"""
Video Streaming Service
Handles MJPEG streaming for cameras with task overlays
"""

import time
import threading
from typing import Dict, Optional
import cv2
import numpy as np
from fastapi import HTTPException
from app.services.camera_manager import camera_manager

class StreamingService:
    """Service for managing video streams with overlays"""
    
    def __init__(self):
        self.active_streams: Dict[str, bool] = {}
        self.stream_lock = threading.Lock()
    
    def generate_mjpeg_stream(self, camera_id: str, with_overlay: bool = True):
        """Generate MJPEG stream for a camera. Never raise inside generator; yield an error frame and exit instead."""
        camera_worker = camera_manager.get_camera(camera_id)
        if not camera_worker:
            # Yield a single error frame then exit to avoid half-started responses
            error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(error_frame, "Camera not running", (80, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            ret, jpeg = cv2.imencode('.jpg', error_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            return
        
        # Mark stream as active
        with self.stream_lock:
            self.active_streams[camera_id] = True
        
        try:
            # Stream generation loop
            send_times = []  # For FPS calculation
            frame_count = 0
            
            while self.active_streams.get(camera_id, False):
                try:
                    # Stop if camera disappeared
                    if not camera_manager.get_camera(camera_id):
                        break
                    # Get frame with or without overlay
                    if with_overlay:
                        frame = camera_manager.get_camera_frame_with_overlay(camera_id)
                    else:
                        frame = camera_manager.get_camera_frame(camera_id)
                    
                    if frame is None:
                        time.sleep(0.01)
                        continue
                    
                    # Encode frame to JPEG
                    ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    if not ret:
                        time.sleep(0.01)
                        continue
                    
                    # Calculate FPS
                    now = time.time()
                    send_times.append(now)
                    # Keep only last 2 seconds
                    cutoff = now - 2.0
                    send_times = [t for t in send_times if t > cutoff]
                    
                    # Yield MJPEG frame
                    frame_count += 1
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
                    
                    # Dynamic pacing based on FPS
                    if len(send_times) >= 5:
                        span = send_times[-1] - send_times[0]
                        if span > 0:
                            fps = (len(send_times) - 1) / span
                            frame_delay = 1.0 / min(fps, 30.0)  # Max 30 FPS
                            time.sleep(min(frame_delay * 0.8, 0.033))
                        else:
                            time.sleep(0.033)
                    else:
                        time.sleep(0.033)  # ~30 FPS fallback
                        
                except GeneratorExit:
                    # Client disconnected, exit gracefully
                    break
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Stream error for camera {camera_id}: {e}", exc_info=True)
                    time.sleep(0.1)
                    # Continue streaming if possible
                    continue
                    
        except GeneratorExit:
            # Client disconnected during stream setup
            pass
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Fatal stream error for camera {camera_id}: {e}", exc_info=True)
        finally:
            # Mark stream as inactive
            with self.stream_lock:
                self.active_streams[camera_id] = False
    
    def generate_preview_stream(self, source: str):
        """Generate preview stream for testing sources"""
        try:
            # Create temporary video stream
            from app.services.camera_manager import VideoStream
            stream = VideoStream(source)
            
            try:
                while True:
                    frame = stream.read()
                    if frame is None:
                        time.sleep(0.01)
                        continue
                    
                    # Encode frame to JPEG
                    ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    if not ret:
                        time.sleep(0.01)
                        continue
                    
                    # Yield MJPEG frame
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
                    
                    time.sleep(0.033)  # ~30 FPS
                    
            finally:
                stream.stop()
                
        except Exception as e:
            print(f"Preview stream error for source {source}: {e}")
            # Return error frame
            error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(error_frame, f"Error: {str(e)}", (50, 240),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            ret, jpeg = cv2.imencode('.jpg', error_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
    
    def stop_stream(self, camera_id: str):
        """Stop a specific camera stream"""
        with self.stream_lock:
            self.active_streams[camera_id] = False
    
    def stop_all_streams(self):
        """Stop all active streams"""
        with self.stream_lock:
            for camera_id in self.active_streams:
                self.active_streams[camera_id] = False
    
    def get_stream_status(self) -> Dict[str, bool]:
        """Get status of all streams"""
        with self.stream_lock:
            return self.active_streams.copy()

# Global streaming service instance
streaming_service = StreamingService()
