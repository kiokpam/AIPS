"""
Camera Management Service
Handles camera registration, stream management, and integration with AI services
"""

import os
import time
import threading
import asyncio
import httpx
from typing import Dict, List, Optional, Any
from datetime import datetime
import cv2
import numpy as np
import base64
from collections import deque

# Mitigate FFmpeg threading assertion issues on some Windows setups
os.environ.setdefault('OPENCV_FFMPEG_THREADS', '1')

# Configuration
PEOPLE_COUNTING_URL = os.getenv("PEOPLE_COUNTING_URL", "http://localhost:8001")
BEHAVIOR_DETECTION_URL = os.getenv("BEHAVIOR_DETECTION_URL", "http://localhost:8002")
AI_CORE_URL = os.getenv("AI_CORE_URL", "http://localhost:8003")
PEOPLE_COUNTING_MODE = os.getenv("PEOPLE_COUNTING_MODE", "ai_core").lower()  # 'ai_core' | 'external'

class VideoStream:
    """Enhanced video stream handler for RTSP, webcam, and file sources"""
    
    def __init__(self, src: str):
        self.src = self._normalize_source(src)

        # Prefer stable backend per source type (especially on Windows)
        self.cap = self._open_capture(self.src)
        if not self.cap.isOpened():
            raise RuntimeError(self._error_message(self.src))

        # Lấy FPS metadata
        self.video_fps = self.cap.get(cv2.CAP_PROP_FPS) or 0
        if self.video_fps <= 0 or self.video_fps > 60:
            self.video_fps = 30.0  # fallback
        self.frame_delay = 1.0 / self.video_fps

        self.is_video_file = (
            isinstance(self.src, str)
            and not self.src.isdigit()
            and not self.src.startswith(("rtsp://", "http://"))
        )

        self.latest_frame = None
        self.lock = threading.Lock()
        self.running = True
        self.frame_times = deque(maxlen=30)

        threading.Thread(target=self._update, daemon=True).start()
    
    def _error_message(self, src):
        if isinstance(src, int):
            return f"Cannot open webcam {src}"
        if isinstance(src, str):
            if src.startswith(("rtsp://", "http://")):
                return f"Cannot open video stream: {src}"
            return f"Cannot open video file: {src}"
        return f"Cannot open video source: {src}"
    
    def _normalize_source(self, src: str):
        """Normalize different source types"""
        if isinstance(src, str) and src.isdigit():
            return int(src)
        if isinstance(src, str) and not src.startswith(("rtsp://", "http://", "/")):
            return os.path.abspath(src)
        return src
    
    def _open_capture(self, src):
        """Open cv2.VideoCapture with appropriate backend for stability."""
        try:
            # Webcam on Windows: prefer CAP_DSHOW to avoid MSMF grab errors
            if isinstance(src, int):
                if os.name == 'nt':
                    cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)
                else:
                    cap = cv2.VideoCapture(src)
                return cap

            # RTSP/HTTP streams: prefer FFMPEG backend if available
            if isinstance(src, str) and src.startswith(("rtsp://", "http://")):
                # Try default backend first
                cap_default = cv2.VideoCapture(src)
                if cap_default.isOpened():
                    # Reduce buffering if supported
                    try:
                        cap_default.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    except Exception:
                        pass
                    return cap_default

                # Then try FFMPEG backend with safer settings
                cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
                if cap.isOpened():
                    # Reduce buffering and threads if supported
                    try:
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    except Exception:
                        pass
                    try:
                        prop_threads = getattr(cv2, 'CAP_PROP_THREADS', None)
                        if prop_threads is not None:
                            cap.set(prop_threads, 1)
                    except Exception:
                        pass
                    return cap

                # Fallback to default
                return cv2.VideoCapture(src)

            # File
            return cv2.VideoCapture(src)
        except Exception as e:
            print(f"Error opening capture for {src}: {e}")
            return cv2.VideoCapture(src)
    
    def _update(self):
        """Main capture loop"""
        last_time = time.time()
        fail_count = 0
        
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                fail_count += 1
                
                if self.is_video_file:
                    # Loop video file
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    fail_count = 0
                else:
                    # Try to reconnect for network streams
                    if fail_count >= 30:
                        try:
                            self.cap.release()
                        except:
                            pass
                        self.cap = self._open_capture(self.src)
                        fail_count = 0
                    time.sleep(0.05)
                continue
            
            with self.lock:
                self.latest_frame = frame
                self.frame_times.append(time.time())
            
            fail_count = 0
            
            # Sync FPS
            elapsed = time.time() - last_time
            delay = self.frame_delay - elapsed
            if delay > 0:
                time.sleep(min(delay, 0.01))
            last_time = time.time()
    
    def read(self) -> Optional[np.ndarray]:
        """Get latest frame"""
        with self.lock:
            if self.latest_frame is not None:
                return self.latest_frame.copy()
        return None
    
    def get_fps(self) -> float:
        """Get current FPS"""
        if len(self.frame_times) >= 2:
            span = self.frame_times[-1] - self.frame_times[0]
            if span > 0:
                return (len(self.frame_times) - 1) / span
        return self.video_fps

    def get_size(self) -> Optional[tuple]:
        """Return (width, height) of frames if known."""
        try:
            w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
            if w > 0 and h > 0:
                return (w, h)
            with self.lock:
                if self.latest_frame is not None:
                    lh, lw = self.latest_frame.shape[:2]
                    return (lw, lh)
        except Exception:
            pass
        return None
    
    def stop(self):
        """Stop the video stream"""
        self.running = False
        if self.cap:
            self.cap.release()

class CameraWorker:
    """Camera worker that manages video stream and AI processing"""
    
    def __init__(self, camera_id: str, store_id: str, source: str, 
                 name: str, ai_services: List[str] = None,
                 model_name: str = "yolov8n.pt", device: str = "auto",
                 conf_thresh: float = 0.5, iou_thresh: float = 0.45,
                 max_det: int = 300, skip_frame: int = 3):
        self.camera_id = camera_id
        self.store_id = store_id
        self.source = source  # RTSP URL, file path, or webcam ID
        self.name = name
        self.ai_services = ai_services or []
        
        # Advanced configuration
        self.model_name = model_name
        self.device = device
        self.conf_thresh = conf_thresh
        self.iou_thresh = iou_thresh
        self.max_det = max_det
        self.skip_frame = max(1, skip_frame)
        
        self.stream = None
        self.running = False
        self.thread = None
        self.frame_count = 0
        self.last_ai_processing = 0
        self.ai_processing_interval = self.skip_frame  # Use skip_frame for processing interval
        
        # Task configuration
        self.zones = []  # List of zone configurations
        self.lines = []  # List of line configurations
        self.current_count = 0
        
        # Model and tracking
        self.model = None
        self.tracker = None
        self.cached_rendered_frame = None
        self.frame_times = deque(maxlen=90)  # ~3s buffer for FPS calculation
        
        # AI service clients
        self.people_counting_client = httpx.AsyncClient(timeout=10.0)
        self.behavior_detection_client = httpx.AsyncClient(timeout=10.0)
        self.ai_core_client = httpx.AsyncClient(timeout=10.0)
        self._pc_registered = False
        
        # Statistics
        self.stats = {
            "frames_processed": 0,
            "ai_processing_count": 0,
            "last_processing_time": None,
            "avg_processing_time_ms": 0,
            "errors": 0,
            "current_count": 0,
            "model_loaded": False,
            "has_task": False
        }
    
    def start(self):
        """Start the camera worker"""
        try:
            self.stream = VideoStream(self.source)
            self.running = True
            self.thread = threading.Thread(target=self._run, daemon=True)
            self.thread.start()
            return True
        except Exception as e:
            print(f"Failed to start camera {self.camera_id}: {e}")
            return False
    
    def stop(self):
        """Stop the camera worker"""
        self.running = False
        if self.stream:
            self.stream.stop()
        if self.thread:
            self.thread.join(timeout=2)
        
        # Close HTTP clients (ensure event loop context)
        try:
            asyncio.run(self.people_counting_client.aclose())
        except RuntimeError:
            # If an event loop is already running elsewhere, fall back to threadsafe
            loop = asyncio.new_event_loop()
            loop.run_until_complete(self.people_counting_client.aclose())
            loop.close()
        try:
            asyncio.run(self.behavior_detection_client.aclose())
        except RuntimeError:
            loop = asyncio.new_event_loop()
            loop.run_until_complete(self.behavior_detection_client.aclose())
            loop.close()

        try:
            asyncio.run(self.ai_core_client.aclose())
        except RuntimeError:
            loop = asyncio.new_event_loop()
            loop.run_until_complete(self.ai_core_client.aclose())
            loop.close()
    
    def _run(self):
        """Main processing loop"""
        while self.running:
            try:
                frame = self.stream.read()
                if frame is None:
                    time.sleep(0.01)
                    continue
                
                self.frame_count += 1
                
                # Process with AI services at intervals
                if self.frame_count % self.ai_processing_interval == 0:
                    # Run coroutine in this worker thread using a fresh event loop
                    try:
                        asyncio.run(self._process_with_ai(frame))
                    except RuntimeError:
                        loop = asyncio.new_event_loop()
                        loop.run_until_complete(self._process_with_ai(frame))
                        loop.close()
                
                time.sleep(0.01)  # Small delay to prevent excessive CPU usage
                
            except Exception as e:
                print(f"Error in camera {self.camera_id} processing: {e}")
                self.stats["errors"] += 1
                time.sleep(0.1)
    
    async def _process_with_ai(self, frame: np.ndarray):
        """Process frame with AI services"""
        start_time = time.time()
        
        try:
            # Encode frame to base64
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            frame_data = base64.b64encode(buffer).decode('utf-8')
            
            # Process with people counting service
            if "people_counting" in self.ai_services:
                await self._process_people_counting(frame_data)
            
            # Process with behavior detection service
            if "behavior_detection" in self.ai_services:
                await self._process_behavior_detection(frame_data)
            
            # Update statistics
            processing_time = (time.time() - start_time) * 1000
            self.stats["ai_processing_count"] += 1
            self.stats["last_processing_time"] = datetime.now().isoformat()
            
            # Update average processing time
            if self.stats["avg_processing_time_ms"] == 0:
                self.stats["avg_processing_time_ms"] = processing_time
            else:
                self.stats["avg_processing_time_ms"] = (
                    self.stats["avg_processing_time_ms"] * 0.9 + processing_time * 0.1
                )
            
        except Exception as e:
            print(f"AI processing error for camera {self.camera_id}: {e}")
            self.stats["errors"] += 1
    
    async def _process_people_counting(self, frame_data: str):
        """Process frame with people counting service"""
        try:
            # Get current task configuration
            zones = []
            lines = []
            
            for zone in self.zones:
                zones.append({
                    "id": zone["id"],
                    "polygon": zone["polygon"]
                })
            
            for line in self.lines:
                lines.append({
                    "id": line["id"],
                    "p1": line["p1"],
                    "p2": line["p2"]
                })
            
            # Create camera config with current tasks
            config = {
                "camera_id": self.camera_id,
                "store_id": self.store_id,
                "rtsp_url": self.source,
                "zones": zones,
                "lines": lines,
                "model_name": self.model_name,
                "device": self.device,
                "conf_thresh": self.conf_thresh
            }
            
            payload = {
                "camera_id": self.camera_id,
                "frame_data": frame_data,
                "config": config
            }
            
            async def _ai_core_count() -> int:
                det_resp = await self.ai_core_client.post(
                    f"{AI_CORE_URL}/detect",
                    json={
                        "frame_data": frame_data,
                        "model_name": self.model_name,
                        "device": self.device,
                        "classes": [0],
                        "conf_thresh": self.conf_thresh,
                    },
                    timeout=8.0,
                )
                det_resp.raise_for_status()
                det = det_resp.json()
                detections = det.get("detections", [])
                total = 0
                for zone_cfg in zones:
                    try:
                        cz_resp = await self.ai_core_client.post(
                            f"{AI_CORE_URL}/count-zone",
                            json={
                                "frame_data": frame_data,
                                "detections": detections,
                                "zone_polygon": zone_cfg.get("polygon", []),
                            },
                            timeout=6.0,
                        )
                        if cz_resp.status_code == 200:
                            cz = cz_resp.json()
                            total += int(cz.get("count", 0))
                    except Exception:
                        continue
                return total

            async def _external_infer() -> Optional[int]:
                try:
                    response = await self.people_counting_client.post(
                        f"{PEOPLE_COUNTING_URL}/infer",
                        json=payload,
                        timeout=5.0
                    )
                    if response.status_code == 200:
                        result = response.json()
                        return int(sum(z.get("count", 0) for z in result.get("zones", [])))
                    else:
                        try:
                            err_text = response.text
                        except Exception:
                            err_text = "<no body>"
                        print(f"People counting HTTP {response.status_code} for {self.camera_id}: {err_text}")
                except Exception:
                    return None
                return None

            total_count = 0
            if PEOPLE_COUNTING_MODE == "ai_core":
                # Use AI Core directly
                total_count = await _ai_core_count()
            else:
                # Try external, fallback to AI Core
                ext = await _external_infer()
                if ext is not None:
                    total_count = ext
                else:
                    total_count = await _ai_core_count()

            self.current_count = total_count
            self.stats["current_count"] = total_count
            print(f"People counting ({PEOPLE_COUNTING_MODE}) for {self.camera_id}: {total_count}")
            
        except Exception as e:
            print(f"People counting error: {e}")

    async def _register_people_counting_if_needed(self):
        """Register camera with people-counting service to initialize trackers for line counting."""
        if self._pc_registered:
            return
        try:
            zones = [{
                "id": z.get("id", z.get("name", "zone")),
                "polygon": z.get("polygon", [])
            } for z in self.zones]
            lines = [{
                "id": l.get("id", l.get("name", "line")),
                "p1": l.get("p1"),
                "p2": l.get("p2")
            } for l in self.lines]

            if not zones and not lines:
                return

            config = {
                "camera_id": self.camera_id,
                "store_id": self.store_id,
                "rtsp_url": self.source,
                "zones": zones,
                "lines": lines,
                "model_name": self.model_name,
                "device": self.device,
                "conf_thresh": self.conf_thresh,
            }
            resp = await self.people_counting_client.post(
                f"{PEOPLE_COUNTING_URL}/camera/register",
                json=config,
                timeout=5.0,
            )
            if resp.status_code == 200:
                self._pc_registered = True
        except Exception as e:
            print(f"People counting register error: {e}")
    
    async def _process_behavior_detection(self, frame_data: str):
        """Process frame with behavior detection service"""
        try:
            payload = {
                "camera_id": self.camera_id,
                "frame_data": frame_data
            }
            
            response = await self.behavior_detection_client.post(
                f"{BEHAVIOR_DETECTION_URL}/infer",
                json=payload,
                timeout=5.0
            )
            
            if response.status_code == 200:
                result = response.json()
                # Handle behavior detection results
                if result.get("anomalies"):
                    print(f"Anomalies detected for {self.camera_id}: {result['anomalies']}")
            
        except Exception as e:
            print(f"Behavior detection error: {e}")
    
    def update_task_config(self, zones: List[Dict[str, Any]], lines: List[Dict[str, Any]]):
        """Update task configuration for this camera"""
        self.zones = zones
        self.lines = lines
        # Mark whether we currently have any task configured
        self.stats["has_task"] = bool(self.zones or self.lines)
        print(f"Updated task config for camera {self.camera_id}: {len(zones)} zones, {len(lines)} lines")
        # Register with people-counting if service is enabled
        if "people_counting" in self.ai_services:
            try:
                # run async registration in a fresh loop since we are in worker thread
                asyncio.run(self._register_people_counting_if_needed())
            except RuntimeError:
                loop = asyncio.new_event_loop()
                loop.run_until_complete(self._register_people_counting_if_needed())
                loop.close()
    
    def clear_tasks(self):
        """Clear all tasks for this camera"""
        self.zones = []
        self.lines = []
        self.current_count = 0
        print(f"Cleared tasks for camera {self.camera_id}")
        # Unregister from people-counting to free trackers
        try:
            if self._pc_registered:
                # best-effort async call
                asyncio.run(self.people_counting_client.post(
                    f"{PEOPLE_COUNTING_URL}/camera/{self.camera_id}/unregister",
                    timeout=3.0,
                ))
                self._pc_registered = False
        except Exception:
            pass
    
    def get_task_config(self) -> Dict[str, Any]:
        """Get current task configuration"""
        return {
            "zones": self.zones,
            "lines": self.lines,
            "current_count": self.current_count
        }
    
    def update_config(self, **kwargs):
        """Update camera configuration"""
        if 'model_name' in kwargs:
            self.model_name = kwargs['model_name']
            self.model = None  # Reset model to reload with new name
        if 'device' in kwargs:
            self.device = kwargs['device']
            self.model = None  # Reset model to reload with new device
        if 'conf_thresh' in kwargs:
            self.conf_thresh = kwargs['conf_thresh']
        if 'iou_thresh' in kwargs:
            self.iou_thresh = kwargs['iou_thresh']
        if 'max_det' in kwargs:
            self.max_det = kwargs['max_det']
        if 'skip_frame' in kwargs:
            self.skip_frame = max(1, kwargs['skip_frame'])
            self.ai_processing_interval = self.skip_frame
    
    def get_config(self) -> Dict[str, Any]:
        """Get current camera configuration"""
        cfg = {
            "camera_id": self.camera_id,
            "source": self.source,
            "model_name": self.model_name,
            "device": self.device,
            "conf_thresh": self.conf_thresh,
            "iou_thresh": self.iou_thresh,
            "max_det": self.max_det,
            "skip_frame": self.skip_frame,
            "ai_services": self.ai_services
        }
        if self.stream:
            size = self.stream.get_size()
            if size:
                cfg.update({"width": size[0], "height": size[1]})
        return cfg
    
    def get_stats(self) -> Dict[str, Any]:
        """Get camera statistics"""
        return {
            "camera_id": self.camera_id,
            "store_id": self.store_id,
            "name": self.name,
            "running": self.running,
            "fps": self.stream.get_fps() if self.stream else 0,
            "frame_count": self.frame_count,
            "ai_services": self.ai_services,
            "zones_count": len(self.zones),
            "lines_count": len(self.lines),
            "current_count": self.current_count,
            "model_loaded": self.stats["model_loaded"],
            "has_task": self.stats["has_task"],
            "config": self.get_config(),
            "stats": self.stats
        }

class CameraManager:
    """Main camera manager that handles multiple cameras"""
    
    def __init__(self):
        self.cameras: Dict[str, CameraWorker] = {}
        self.lock = threading.Lock()
    
    def add_camera(self, camera_id: str, store_id: str, source: str, 
                   name: str, ai_services: List[str] = None,
                   model_name: str = "yolov8n.pt", device: str = "auto",
                   conf_thresh: float = 0.5, iou_thresh: float = 0.45,
                   max_det: int = 300, skip_frame: int = 3) -> bool:
        """Add a new camera with advanced configuration"""
        with self.lock:
            if camera_id in self.cameras:
                return False
            
            worker = CameraWorker(
                camera_id, store_id, source, name, ai_services,
                model_name, device, conf_thresh, iou_thresh, max_det, skip_frame
            )
            if worker.start():
                self.cameras[camera_id] = worker
                return True
            return False
    
    def remove_camera(self, camera_id: str) -> bool:
        """Remove a camera"""
        with self.lock:
            if camera_id in self.cameras:
                self.cameras[camera_id].stop()
                del self.cameras[camera_id]
                return True
            return False
    
    def get_camera(self, camera_id: str) -> Optional[CameraWorker]:
        """Get a camera worker"""
        return self.cameras.get(camera_id)
    
    def list_cameras(self) -> List[Dict[str, Any]]:
        """List all cameras with their stats"""
        with self.lock:
            return [camera.get_stats() for camera in self.cameras.values()]
    
    def update_camera_ai_services(self, camera_id: str, ai_services: List[str]) -> bool:
        """Update AI services for a camera"""
        with self.lock:
            if camera_id in self.cameras:
                self.cameras[camera_id].ai_services = ai_services
                return True
            return False
    
    def update_camera_config(self, camera_id: str, **config) -> bool:
        """Update camera configuration"""
        with self.lock:
            if camera_id in self.cameras:
                self.cameras[camera_id].update_config(**config)
                return True
            return False
    
    def get_camera_frame(self, camera_id: str) -> Optional[np.ndarray]:
        """Get latest frame from a camera"""
        camera = self.get_camera(camera_id)
        if camera and camera.stream:
            return camera.stream.read()
        return None
    
    def get_camera_jpeg(self, camera_id: str) -> Optional[bytes]:
        """Get latest frame as JPEG bytes"""
        frame = self.get_camera_frame(camera_id)
        if frame is not None:
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            return buffer.tobytes()
        return None
    
    def get_camera_frame_with_overlay(self, camera_id: str) -> Optional[np.ndarray]:
        """Get camera frame with task overlays (zones, lines, counts)"""
        camera_worker = self.get_camera(camera_id)
        if not camera_worker or not camera_worker.stream:
            return None
        
        frame = camera_worker.stream.read()
        if frame is None:
            return None
        
        # Create a copy to draw overlays on
        overlay_frame = frame.copy()
        
        # Helpers to denormalize 0..1 coordinates to pixels
        def _denorm_point(p, width, height):
            try:
                x, y = float(p[0]), float(p[1])
                if 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0:
                    return [int(x * width), int(y * height)]
            except Exception:
                pass
            return [int(p[0]), int(p[1])]

        def _denorm_polygon(poly, width, height):
            try:
                if all(0.0 <= float(x) <= 1.0 and 0.0 <= float(y) <= 1.0 for x, y in poly):
                    return [[int(x * width), int(y * height)] for x, y in poly]
            except Exception:
                pass
            return poly

        h, w = overlay_frame.shape[:2]

        # Draw zones (convert normalized to pixels if needed)
        for zone in camera_worker.zones:
            if zone.get("polygon"):
                points = _denorm_polygon(zone["polygon"], w, h)
                polygon = np.array(points, np.int32)
                cv2.polylines(overlay_frame, [polygon], True, (0, 255, 0), 2)
                # Add zone name
                if zone.get("name"):
                    cv2.putText(overlay_frame, zone["name"], 
                               tuple(polygon[0]), cv2.FONT_HERSHEY_SIMPLEX, 
                               0.7, (0, 255, 0), 2)
        
        # Draw lines
        for line in camera_worker.lines:
            if line.get("p1") and line.get("p2"):
                p1 = tuple(_denorm_point(line["p1"], w, h))
                p2 = tuple(_denorm_point(line["p2"], w, h))
                cv2.line(overlay_frame, p1, p2, (255, 0, 0), 2)
                # Add line name
                if line.get("name"):
                    mid_point = ((p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2)
                    cv2.putText(overlay_frame, line["name"], 
                               mid_point, cv2.FONT_HERSHEY_SIMPLEX, 
                               0.7, (255, 0, 0), 2)
        
        # Draw current count
        if camera_worker.current_count > 0:
            cv2.putText(overlay_frame, f"Count: {camera_worker.current_count}", 
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        # Draw FPS
        fps = camera_worker.stream.get_fps()
        cv2.putText(overlay_frame, f"FPS: {fps:.1f}", 
                   (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        return overlay_frame
    
    def get_camera_jpeg_with_overlay(self, camera_id: str) -> Optional[bytes]:
        """Get camera frame with overlays as JPEG bytes"""
        frame = self.get_camera_frame_with_overlay(camera_id)
        if frame is not None:
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            return buffer.tobytes()
        return None

# Global camera manager instance
camera_manager = CameraManager()
