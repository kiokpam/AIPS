"""
Camera Management Service
Handles camera registration, stream management, and frame processing
"""

import os
import time
import threading
import logging
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
        logger = logging.getLogger(__name__)

        # Prefer stable backend per source type (especially on Windows)
        self.cap = self._open_capture(self.src)
        if not self.cap or not self.cap.isOpened():
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
        self.start_time = time.time()  # Track when stream started

        # Log stream creation for debugging
        logger.info(f"Created VideoStream for source: {self.src}")

        threading.Thread(target=self._update, daemon=True, name=f"VideoStream-{id(self)}").start()
    
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
        consecutive_read_failures = 0
        max_consecutive_read_failures = 50  # Reduced from 30 to be more aggressive about reconnecting
        
        while self.running:
            try:
                # Check if capture is still valid
                if not self.cap:
                    # Try to reopen if closed
                    if fail_count < max_failures:
                        try:
                            self.cap = self._open_capture(self.src)
                            fail_count = 0
                            consecutive_read_failures = 0
                            logger = logging.getLogger(__name__)
                            logger.info(f"Reopened stream {self.src}")
                        except Exception as e:
                            fail_count += 1
                            if fail_count % 10 == 0:
                                logger = logging.getLogger(__name__)
                                logger.warning(f"Failed to reopen stream {self.src} (attempt {fail_count}): {e}")
                            time.sleep(1.0)  # Wait longer before retry
                        continue
                    else:
                        logger = logging.getLogger(__name__)
                        logger.error(f"Stream {self.src} failed too many times, stopping")
                        self.running = False
                        break
                
                # Check if capture is opened - use try/except as isOpened() can sometimes throw
                try:
                    if not self.cap.isOpened():
                        # Capture closed, try to reopen
                        consecutive_read_failures += 1
                        if consecutive_read_failures < max_consecutive_read_failures:
                            try:
                                self.cap.release()
                            except:
                                pass
                            try:
                                self.cap = self._open_capture(self.src)
                                consecutive_read_failures = 0
                                logger = logging.getLogger(__name__)
                                logger.info(f"Reopened closed stream {self.src}")
                            except Exception as e:
                                if consecutive_read_failures % 10 == 0:
                                    logger = logging.getLogger(__name__)
                                    logger.warning(f"Failed to reopen closed stream {self.src}: {e}")
                                time.sleep(0.5)
                        else:
                            logger = logging.getLogger(__name__)
                            logger.error(f"Stream {self.src} capture closed too many times, stopping")
                            self.running = False
                            break
                        continue
                except Exception as e:
                    # isOpened() threw an exception - capture might be invalid
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Error checking if stream {self.src} is opened: {e}")
                    try:
                        self.cap.release()
                    except:
                        pass
                    self.cap = None
                    consecutive_read_failures += 1
                    time.sleep(0.5)
                    continue
                
                # Try to read frame
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    consecutive_read_failures += 1
                    fail_count += 1
                    
                    if self.is_video_file:
                        # Loop video file
                        try:
                            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            consecutive_read_failures = 0
                            fail_count = 0
                        except:
                            pass
                    else:
                        # For network streams, be more aggressive about reconnecting
                        if consecutive_read_failures >= 20:  # Reduced threshold
                            try:
                                self.cap.release()
                            except:
                                pass
                            try:
                                self.cap = self._open_capture(self.src)
                                consecutive_read_failures = 0
                                logger = logging.getLogger(__name__)
                                logger.info(f"Reconnected stream {self.src} after read failures")
                            except Exception as e:
                                if consecutive_read_failures % 10 == 0:
                                    logger = logging.getLogger(__name__)
                                    logger.warning(f"Reconnection attempt failed for {self.src}: {e}")
                                time.sleep(0.5)  # Wait before retry
                    time.sleep(0.05)
                    continue
                
                # Successfully read frame
                consecutive_read_failures = 0
                fail_count = 0
                
                with self.lock:
                    self.latest_frame = frame
                    self.frame_times.append(time.time())
                
                # Sync FPS
                elapsed = time.time() - last_time
                delay = self.frame_delay - elapsed
                if delay > 0:
                    time.sleep(min(delay, 0.01))
                last_time = time.time()
                
            except Exception as e:
                fail_count += 1
                consecutive_read_failures += 1
                logger = logging.getLogger(__name__)
                logger.error(f"Error in video stream update loop for {self.src}: {e}", exc_info=True)
                if fail_count >= max_failures:
                    logger.error(f"Too many errors for {self.src}, stopping stream")
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
        logger = logging.getLogger(__name__)
        self.running = False
        if self.cap:
            try:
                # Wait a bit for the update thread to finish current operation
                time.sleep(0.1)
                self.cap.release()
                logger.debug(f"Released VideoCapture for {self.src}")
            except Exception as e:
                logger.warning(f"Error releasing VideoCapture for {self.src}: {e}")
            finally:
                self.cap = None

class CameraWorker:
    """Camera worker that manages video stream and AI processing"""
    
    def __init__(self, camera_id: str, store_id: str, source: str, 
                 name: str, ai_services: List[str] = None,
                 skip_frame: int = 3, shared_stream: Optional[VideoStream] = None):
        self.camera_id = camera_id
        self.store_id = store_id
        self.source = source  # RTSP URL, file path, or webcam ID
        self.name = name
        self.ai_services = ai_services or []
        
        # Model configuration removed - AI services will handle all model settings
        self.skip_frame = max(1, skip_frame)
        
        self.stream = shared_stream  # Use shared stream if provided, otherwise create new one
        self.running = False
        self.thread = None
        self.frame_count = 0
        self.is_shared_stream = shared_stream is not None
        
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
            # Only create new stream if not using shared stream
            if self.stream is None:
                self.stream = VideoStream(self.source)
                # Give stream more time to initialize and read first frame
                # This helps prevent conflicts when multiple streams are created
                time.sleep(0.5)
                
                # Verify stream is actually working by checking for a frame
                max_wait = 2.0  # Wait up to 2 seconds for first frame
                wait_start = time.time()
                while time.time() - wait_start < max_wait:
                    frame = self.stream.read()
                    if frame is not None:
                        logger = logging.getLogger(__name__)
                        logger.info(f"Camera {self.camera_id} stream initialized successfully")
                        break
                    time.sleep(0.1)
                else:
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Camera {self.camera_id} stream created but no frames yet (will continue trying)")
            
            self.running = True
            self.thread = threading.Thread(target=self._run, daemon=True, name=f"CameraWorker-{self.camera_id}")
            self.thread.start()
            return True
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to start camera {self.camera_id}: {e}", exc_info=True)
            return False
    
    def stop(self):
        """Stop the camera worker"""
        self.running = False
        # Only stop stream if it's not shared (shared streams are managed by CameraManager)
        if self.stream and not self.is_shared_stream:
            try:
                self.stream.stop()
            except Exception as e:
                logger = logging.getLogger(__name__)
                logger.warning(f"Error stopping stream for camera {self.camera_id}: {e}")
        if self.thread:
            try:
                self.thread.join(timeout=2)
            except Exception as e:
                logger = logging.getLogger(__name__)
                logger.warning(f"Error joining thread for camera {self.camera_id}: {e}")
    
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
        self.source_to_streams: Dict[str, VideoStream] = {}  # Shared VideoStream instances per source
        self.source_ref_count: Dict[str, int] = {}  # Reference count for shared streams
        # Detection data from AI service (for overlay visualization)
        self.camera_detections: Dict[str, Dict] = {}  # camera_id -> {detections: [], people_in_zone: int, updated_at: float}
    
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
            
            # Check if source is already in use - reuse existing VideoStream to avoid RTSP conflicts
            shared_stream = None
            if source in self.source_to_streams:
                shared_stream = self.source_to_streams[source]
                self.source_ref_count[source] = self.source_ref_count.get(source, 0) + 1
                logger = logging.getLogger(__name__)
                logger.info(f"Reusing existing VideoStream for source {source} (camera {camera_id}, ref_count: {self.source_ref_count[source]})")
            
            try:
                # Add small delay between camera additions to avoid resource conflicts
                if len(self.cameras) > 0:
                    time.sleep(0.3)  # 300ms delay to let previous streams stabilize
                
                worker = CameraWorker(
                    camera_id, store_id, source, name, ai_services,
                    skip_frame, shared_stream=shared_stream  # Pass shared stream if available
                )
                if worker.start():
                    self.cameras[camera_id] = worker
                    # Track source mapping (keep first camera as primary for preview)
                    if source not in self.source_to_camera:
                        self.source_to_camera[source] = camera_id
                    # Create shared stream if it doesn't exist
                    if shared_stream is None:
                        self.source_to_streams[source] = worker.stream
                        self.source_ref_count[source] = 1
                    
                    logger = logging.getLogger(__name__)
                    logger.info(f"Successfully added camera {camera_id} (source: {source}, total cameras: {len(self.cameras)})")
                    return True
                else:
                    # Cleanup failed worker
                    try:
                        worker.stop()
                    except:
                        pass
                    # Decrement ref count if we were reusing a stream
                    if shared_stream:
                        self.source_ref_count[source] = max(0, self.source_ref_count.get(source, 1) - 1)
                    return False
            except Exception as e:
                logger = logging.getLogger(__name__)
                logger.error(f"Error adding camera {camera_id}: {e}", exc_info=True)
                # Decrement ref count if we were reusing a stream
                if shared_stream:
                    self.source_ref_count[source] = max(0, self.source_ref_count.get(source, 1) - 1)
                return False
    
    def remove_camera(self, camera_id: str) -> bool:
        """Remove a camera"""
        with self.lock:
            if camera_id in self.cameras:
                worker = self.cameras[camera_id]
                source = worker.source
                try:
                    # Check if this camera is using a shared stream
                    is_shared = source in self.source_to_streams and self.source_to_streams[source] == worker.stream
                    
                    worker.stop()
                    
                    # If using shared stream, decrement ref count
                    if is_shared:
                        self.source_ref_count[source] = max(0, self.source_ref_count.get(source, 1) - 1)
                        logger = logging.getLogger(__name__)
                        logger.info(f"Camera {camera_id} removed, source {source} ref_count: {self.source_ref_count[source]}")
                        
                        # If no more cameras using this stream, clean it up
                        if self.source_ref_count.get(source, 0) <= 0:
                            try:
                                if source in self.source_to_streams:
                                    self.source_to_streams[source].stop()
                            except:
                                pass
                            del self.source_to_streams[source]
                            del self.source_ref_count[source]
                    else:
                        # Not shared, clean up stream
                        if source in self.source_to_streams:
                            del self.source_to_streams[source]
                        if source in self.source_ref_count:
                            del self.source_ref_count[source]
                except Exception as e:
                    logger = logging.getLogger(__name__)
                    logger.error(f"Error stopping camera {camera_id}: {e}", exc_info=True)
                del self.cameras[camera_id]
                # Clean up source mapping if this was the primary camera
                if source in self.source_to_camera and self.source_to_camera[source] == camera_id:
                    # Find another camera with this source to be the primary
                    for other_id, other_worker in self.cameras.items():
                        if other_worker.source == source:
                            self.source_to_camera[source] = other_id
                            break
                    else:
                        # No other cameras with this source
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
                frame = camera.stream.read()
                # If stream exists but no frame yet, check if stream is still running
                if frame is None and camera.stream.running:
                    # Stream is running but no frame yet - might be initializing
                    # Check if stream has been running for a while (more than 2 seconds)
                    if hasattr(camera.stream, 'start_time'):
                        if time.time() - camera.stream.start_time > 2.0:
                            # Stream has been running for 2+ seconds with no frames - might be stuck
                            logger = logging.getLogger(__name__)
                            logger.warning(f"Camera {camera_id} stream running but no frames after 2 seconds")
                    else:
                        # Track start time
                        camera.stream.start_time = time.time()
                return frame
            except Exception as e:
                logger = logging.getLogger(__name__)
                logger.error(f"Error reading frame from camera {camera_id}: {e}", exc_info=True)
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
    
    def update_detections(self, camera_id: str, detections: List[Dict], people_in_zone: int = 0):
        """Update detection data from AI service for overlay visualization"""
        # Only update if we have detections, or if it's been >5s since last update (to clear stale data)
        current_data = self.camera_detections.get(camera_id)
        current_time = time.time()
        
        # If we have detections, always update
        # If no detections but we have recent data (<5s), keep the old data (don't overwrite with empty)
        # If no detections and data is stale (>5s), clear it
        if len(detections) > 0:
            # Always update when we have detections
            self.camera_detections[camera_id] = {
                "detections": detections,
                "people_in_zone": people_in_zone,
                "updated_at": current_time
            }
        elif current_data and (current_time - current_data.get("updated_at", 0)) < 5.0:
            # Keep existing detections if they're recent (within 5s)
            # This prevents empty updates from clearing valid bounding boxes
            # Only update the timestamp and people_in_zone
            self.camera_detections[camera_id] = {
                "detections": current_data.get("detections", []),
                "people_in_zone": people_in_zone,
                "updated_at": current_data.get("updated_at", current_time)
            }
        else:
            # Clear stale data (>5s old) or initialize new entry
            self.camera_detections[camera_id] = {
                "detections": [],
                "people_in_zone": people_in_zone,
                "updated_at": current_time
            }
        
        # Also update the camera worker's current_count for stats API
        camera = self.cameras.get(camera_id)
        if camera:
            camera.current_count = people_in_zone
            camera.stats["current_count"] = people_in_zone
    
    def get_detections(self, camera_id: str) -> Optional[Dict]:
        """Get current detections for a camera (if recent, within 5 seconds)"""
        data = self.camera_detections.get(camera_id)
        # Increased from 2s to 5s to handle slower AI processing (especially on CPU)
        if data and (time.time() - data.get("updated_at", 0)) < 5.0:
            return data
        return None
    
    def get_camera_frame_with_overlay(self, camera_id: str) -> Optional[np.ndarray]:
        """Get camera frame with task overlays (zones, lines, counts, bounding boxes)"""
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
        
        # Draw lines (Line A in red, Line B in blue)
        for line in camera_worker.lines:
            # Draw Line A (p1 → p2)
            if line.get("p1") and line.get("p2"):
                p1 = tuple(_denorm_point(line["p1"], w, h))
                p2 = tuple(_denorm_point(line["p2"], w, h))
                cv2.line(overlay_frame, p1, p2, (0, 0, 255), 2)  # Red for Line A
                # Add "Line A" label
                mid_a = ((p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2)
                cv2.putText(overlay_frame, "Line A", mid_a, cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
            
            # Draw Line B (p1_b → p2_b) if present
            if line.get("p1_b") and line.get("p2_b"):
                p1_b = tuple(_denorm_point(line["p1_b"], w, h))
                p2_b = tuple(_denorm_point(line["p2_b"], w, h))
                cv2.line(overlay_frame, p1_b, p2_b, (255, 0, 0), 2)  # Blue for Line B
                # Add "Line B" label
                mid_b = ((p1_b[0] + p2_b[0]) // 2, (p1_b[1] + p2_b[1]) // 2)
                cv2.putText(overlay_frame, "Line B", mid_b, cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)
        
        # Draw AI detections (bounding boxes from AI service)
        detection_data = self.get_detections(camera_id)
        if detection_data:
            for det in detection_data.get("detections", []):
                bbox = det.get("bbox", [])
                if len(bbox) == 4:
                    x1, y1, x2, y2 = bbox
                    label = det.get("label", "")
                    confidence = det.get("confidence", 0.0)
                    in_zone = det.get("in_zone", False)
                    
                    # Color coding based on behavior type and zone status
                    label_lower = label.lower() if label else ""
                    
                    if "shoplifting" in label_lower or "theft" in label_lower:
                        # Red for shoplifting/theft (critical)
                        color = (0, 0, 255)  # Bright red (BGR format)
                    elif "violence" in label_lower or "fight" in label_lower:
                        # Purple/Magenta for violence (critical)
                        color = (255, 0, 255)  # Magenta (BGR format)
                    elif label_lower != "normal" and confidence >= 0.5:
                        # Orange for other suspicious behavior
                        color = (0, 165, 255)  # Orange (BGR format)
                    elif in_zone:
                        # Green for normal people in zone
                        color = (57, 255, 20)  # Green (BGR format)
                    else:
                        # Blue for normal people outside zone
                        color = (255, 144, 30)  # Light blue (BGR format)
                    
                    # Draw bounding box with thicker line for critical behaviors
                    line_thickness = 3 if ("shoplifting" in label_lower or "violence" in label_lower) else 2
                    cv2.rectangle(overlay_frame, (x1, y1), (x2, y2), color, line_thickness)
                    
                    # Draw label with behavior type and confidence
                    if label:
                        # Format label text based on behavior type
                        if "shoplifting" in label_lower or "theft" in label_lower:
                            label_text = f"[SHOPLIFTING] {confidence:.0%}"
                        elif "violence" in label_lower or "fight" in label_lower:
                            label_text = f"[VIOLENCE] {confidence:.0%}"
                        elif label_lower != "normal" and confidence >= 0.5:
                            label_text = f"[{label.upper()}] {confidence:.0%}"
                        else:
                            label_text = f"{label} ({confidence:.0%})" if confidence > 0 else label
                        
                        # Draw label background for better visibility
                        (text_width, text_height), baseline = cv2.getTextSize(
                            label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2
                        )
                        label_y = max(text_height + 5, y1 - 5)
                        cv2.rectangle(
                            overlay_frame,
                            (x1, label_y - text_height - 5),
                            (x1 + text_width + 5, label_y + baseline),
                            (0, 0, 0),  # Black background
                            -1
                        )
                        cv2.putText(
                            overlay_frame, label_text, (x1 + 2, label_y),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2
                        )
            
            # Draw people in zone count from AI
            people_in_zone = detection_data.get("people_in_zone", 0)
            if people_in_zone > 0:
                cv2.putText(overlay_frame, f"In Zone: {people_in_zone}", 
                           (10, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        
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
