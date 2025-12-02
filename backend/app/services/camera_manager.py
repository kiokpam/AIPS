"""
Camera Management Service
Handles camera registration, stream management, and frame processing
"""

import os
import time
import threading
from typing import Dict, List, Optional, Any
from datetime import datetime
import cv2
import numpy as np
from collections import deque

# Mitigate FFmpeg threading assertion issues on some Windows setups
os.environ.setdefault('OPENCV_FFMPEG_THREADS', '1')

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
        max_failures = 100  # Increased threshold before giving up
        
        while self.running:
            try:
                if not self.cap or not self.cap.isOpened():
                    # Try to reopen if closed
                    if fail_count < max_failures:
                        try:
                            self.cap = self._open_capture(self.src)
                            fail_count = 0
                        except Exception as e:
                            fail_count += 1
                            if fail_count % 10 == 0:
                                print(f"Failed to reopen stream {self.src} (attempt {fail_count}): {e}")
                            time.sleep(1.0)  # Wait longer before retry
                        continue
                    else:
                        print(f"Stream {self.src} failed too many times, stopping")
                        self.running = False
                        break
                
                ret, frame = self.cap.read()
                if not ret:
                    fail_count += 1
                    
                    if self.is_video_file:
                        # Loop video file
                        try:
                            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            fail_count = 0
                        except:
                            pass
                    else:
                        # Try to reconnect for network streams
                        if fail_count >= 30:
                            try:
                                self.cap.release()
                            except:
                                pass
                            try:
                                self.cap = self._open_capture(self.src)
                                fail_count = 0
                            except Exception as e:
                                if fail_count % 10 == 0:
                                    print(f"Reconnection attempt failed for {self.src}: {e}")
                                time.sleep(0.5)  # Wait before retry
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
                
            except Exception as e:
                fail_count += 1
                print(f"Error in video stream update loop for {self.src}: {e}")
                if fail_count >= max_failures:
                    print(f"Too many errors for {self.src}, stopping stream")
                    self.running = False
                    break
                time.sleep(0.1)
    
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
            try:
                self.cap.release()
            except Exception as e:
                print(f"Error releasing VideoCapture: {e}")
            finally:
                self.cap = None

class CameraWorker:
    """Camera worker that manages video stream and AI processing"""
    
    def __init__(self, camera_id: str, store_id: str, source: str, 
                 name: str, ai_services: List[str] = None,
                 skip_frame: int = 3):
        self.camera_id = camera_id
        self.store_id = store_id
        self.source = source  # RTSP URL, file path, or webcam ID
        self.name = name
        self.ai_services = ai_services or []
        
        # Model configuration removed - AI services will handle all model settings
        self.skip_frame = max(1, skip_frame)
        
        self.stream = None
        self.running = False
        self.thread = None
        self.frame_count = 0
        
        # Task configuration
        self.zones = []  # List of zone configurations
        self.lines = []  # List of line configurations
        self.current_count = 0
        
        # Model and tracking
        self.model = None
        self.tracker = None
        self.cached_rendered_frame = None
        self.frame_times = deque(maxlen=90)  # ~3s buffer for FPS calculation
        
        # Statistics
        self.stats = {
            "frames_processed": 0,
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
            try:
                self.stream.stop()
            except Exception as e:
                print(f"Error stopping stream for camera {self.camera_id}: {e}")
        if self.thread:
            try:
                self.thread.join(timeout=2)
            except Exception as e:
                print(f"Error joining thread for camera {self.camera_id}: {e}")
    
    def _run(self):
        """Main processing loop"""
        error_count = 0
        max_errors = 100
        
        while self.running:
            try:
                if not self.stream:
                    time.sleep(0.1)
                    continue
                    
                frame = self.stream.read()
                if frame is None:
                    time.sleep(0.01)
                    continue
                
                self.frame_count += 1
                error_count = 0  # Reset error count on success
                
                # Frame processing hook for AI services
                # AI services can access frames via:
                # 1. GET /api/ai/cameras/{camera_id}/frame (pull-based)
                # 2. Extend this method for push-based integration
                # Frame is available via self.stream.read() or camera_manager.get_camera_frame()
                
                # Update frame times for FPS calculation
                self.frame_times.append(time.time())
                
                time.sleep(0.01)  # Small delay to prevent excessive CPU usage
                
            except Exception as e:
                error_count += 1
                self.stats["errors"] += 1
                if error_count % 10 == 0:
                    print(f"Error in camera {self.camera_id} processing (error #{error_count}): {e}")
                
                if error_count >= max_errors:
                    print(f"Too many errors for camera {self.camera_id}, stopping worker")
                    self.running = False
                    break
                    
                time.sleep(0.1)
    
    def update_task_config(self, zones: List[Dict[str, Any]], lines: List[Dict[str, Any]]):
        """Update task configuration for this camera"""
        self.zones = zones
        self.lines = lines
        # Mark whether we currently have any task configured
        self.stats["has_task"] = bool(self.zones or self.lines)
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Updated task config for camera {self.camera_id}: {len(zones)} zones, {len(lines)} lines")
        # AI services should poll /api/ai/cameras/{camera_id}/config to get updated task config
        # Or implement webhook/callback registration for real-time updates
    
    def clear_tasks(self):
        """Clear all tasks for this camera"""
        self.zones = []
        self.lines = []
        self.current_count = 0
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Cleared tasks for camera {self.camera_id}")
        # AI services should poll /api/ai/cameras/{camera_id}/config to detect cleared tasks
    
    def get_task_config(self) -> Dict[str, Any]:
        """Get current task configuration"""
        return {
            "zones": self.zones,
            "lines": self.lines,
            "current_count": self.current_count
        }
    
    def update_config(self, **kwargs):
        """Update camera configuration"""
        # Model configuration removed - AI services will handle all model settings
        if 'skip_frame' in kwargs:
            self.skip_frame = max(1, kwargs['skip_frame'])
    
    def get_config(self) -> Dict[str, Any]:
        """Get current camera configuration"""
        cfg = {
            "camera_id": self.camera_id,
            "source": self.source,
            # Model configuration removed - AI services will handle all model settings
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
    
    def __init__(self, max_cameras: int = 20):
        self.cameras: Dict[str, CameraWorker] = {}
        self.lock = threading.Lock()
        self.max_cameras = max_cameras  # Limit concurrent cameras to prevent resource exhaustion
        self.source_to_camera: Dict[str, str] = {}  # Map source URL to camera_id for reuse
    
    def add_camera(self, camera_id: str, store_id: str, source: str, 
                   name: str, ai_services: List[str] = None,
                   skip_frame: int = 3) -> bool:
        """Add a new camera with advanced configuration"""
        with self.lock:
            # Check if camera already exists
            if camera_id in self.cameras:
                return False
            
            # Check resource limits
            if len(self.cameras) >= self.max_cameras:
                print(f"Warning: Maximum camera limit ({self.max_cameras}) reached. Cannot add camera {camera_id}")
                return False
            
            # Check if source is already in use by another camera
            # (Many RTSP servers don't allow multiple concurrent connections)
            if source in self.source_to_camera:
                existing_id = self.source_to_camera[source]
                if existing_id != camera_id and existing_id in self.cameras:
                    print(f"Warning: Source {source} is already in use by camera {existing_id}")
                    # Don't fail, but log the warning - some cameras support multiple connections
            
            try:
                worker = CameraWorker(
                    camera_id, store_id, source, name, ai_services,
                    skip_frame
                )
                if worker.start():
                    self.cameras[camera_id] = worker
                    self.source_to_camera[source] = camera_id
                    return True
                else:
                    # Cleanup failed worker
                    try:
                        worker.stop()
                    except:
                        pass
                    return False
            except Exception as e:
                print(f"Error adding camera {camera_id}: {e}")
                return False
    
    def remove_camera(self, camera_id: str) -> bool:
        """Remove a camera"""
        with self.lock:
            if camera_id in self.cameras:
                worker = self.cameras[camera_id]
                source = worker.source
                try:
                    worker.stop()
                except Exception as e:
                    print(f"Error stopping camera {camera_id}: {e}")
                del self.cameras[camera_id]
                # Clean up source mapping
                if source in self.source_to_camera and self.source_to_camera[source] == camera_id:
                    del self.source_to_camera[source]
                return True
            return False
    
    def get_camera(self, camera_id: str) -> Optional[CameraWorker]:
        """Get a camera worker"""
        return self.cameras.get(camera_id)
    
    def list_cameras(self) -> List[Dict[str, Any]]:
        """List all cameras with their stats"""
        with self.lock:
            return [camera.get_stats() for camera in self.cameras.values()]
    
    def get_camera_count(self) -> int:
        """Get current number of active cameras"""
        with self.lock:
            return len(self.cameras)
    
    def get_max_cameras(self) -> int:
        """Get maximum allowed cameras"""
        return self.max_cameras
    
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
            try:
                return camera.stream.read()
            except Exception as e:
                print(f"Error reading frame from camera {camera_id}: {e}")
                return None
        return None
    
    def get_camera_by_source(self, source: str) -> Optional[CameraWorker]:
        """Get camera worker by source URL (for preview reuse)"""
        with self.lock:
            camera_id = self.source_to_camera.get(source)
            if camera_id:
                return self.cameras.get(camera_id)
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
