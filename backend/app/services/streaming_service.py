"""
Video Streaming Service
Handles MJPEG streaming for cameras with task overlays
"""

import time
import threading
import logging
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
        logger = logging.getLogger(__name__)
        camera_worker = camera_manager.get_camera(camera_id)
        if not camera_worker:
            # Yield a single error frame then exit to avoid half-started responses
            error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(error_frame, "Camera not running", (80, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            ret, jpeg = cv2.imencode('.jpg', error_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            return
        
        logger.debug(f"Starting stream for camera {camera_id} (with_overlay={with_overlay})")
        # Mark stream as active
        with self.stream_lock:
            self.active_streams[camera_id] = True
        
        try:
            # Stream generation loop
            send_times = []  # For FPS calculation
            frame_count = 0
            no_frame_count = 0  # Track consecutive None frames
            max_no_frame_wait = 20  # Wait up to 200ms (20 * 0.01s) for first frame, then show placeholder
            last_frame_time = 0  # Track when we last sent a frame to detect delays
            last_frame_seq = -1  # Track last frame sequence to avoid re-encoding same frame
            first_frame_sent = False  # Track if we've sent first frame
            
            while self.active_streams.get(camera_id, False):
                try:
                    # Stop if camera disappeared
                    if not camera_manager.get_camera(camera_id):
                        logger.debug(f"Camera {camera_id} no longer exists, stopping stream")
                        break
                    # Get frame with or without overlay
                    if with_overlay:
                        frame = camera_manager.get_camera_frame_with_overlay(camera_id)
                        # For overlay frames, we can't use sequence tracking (overlay changes independently)
                        frame_seq = -1
                        frame_age = 0
                    else:
                        # Get frame with sequence number AND timestamp to detect stale frames
                        camera = camera_manager.get_camera(camera_id)
                        if camera and camera.stream:
                            frame, frame_seq, frame_timestamp = camera.stream.read_with_metadata()
                            frame_age = (time.time() - frame_timestamp) * 1000 if frame_timestamp > 0 else 0
                        else:
                            frame = None
                            frame_seq = -1
                            frame_age = 0
                    
                    if frame is None:
                        no_frame_count += 1
                        # If we've been waiting too long, yield a "waiting" frame
                        if no_frame_count > max_no_frame_wait:
                            # Yield a "waiting for stream" frame every 500ms to keep connection alive
                            waiting_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                            cv2.putText(waiting_frame, "Initializing camera...", (100, 220),
                                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (100, 149, 237), 2)
                            cv2.putText(waiting_frame, f"Camera: {camera_id}", (120, 260),
                                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (150, 150, 150), 1)
                            ret, jpeg = cv2.imencode('.jpg', waiting_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                            if ret:
                                yield (b'--frame\r\n'
                                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
                            time.sleep(0.05)  # Send placeholder every 50ms while waiting
                        else:
                            time.sleep(0.01)  # Check for frames every 10ms
                        continue
                    
                    # Reset no_frame_count when we get a frame
                    no_frame_count = 0
                    
                    # Update last sequence (for reference/debugging only)
                    if not with_overlay:
                        last_frame_seq = frame_seq
                    
                    # Encode frame to JPEG with high quality for clear video
                    # Quality 92 provides excellent quality while still encoding quickly
                    ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
                    if not ret:
                        continue  # Skip bad frames without delay
                    
                    # Yield MJPEG frame
                    frame_count += 1
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
                    
                    # Calculate FPS AFTER sending (to measure actual send rate)
                    now = time.time()
                    send_times.append(now)
                    
                    # Keep only last 2 seconds
                    cutoff = now - 2.0
                    send_times = [t for t in send_times if t > cutoff]
                    
                    # Log FPS occasionally (every 30 frames)
                    if frame_count % 30 == 0:
                        if len(send_times) >= 2:
                            span = send_times[-1] - send_times[0]
                            if span > 0:
                                fps = (len(send_times) - 1) / span
                                logger.debug(f"Camera {camera_id} streaming at {fps:.1f} FPS ({frame_count} frames sent)")
                    
                    # Track when we sent this frame
                    last_frame_time = time.time()
                    
                    # For USB cameras, add minimal delay for smooth streaming
                    # Reduced for lower latency (real-time responsiveness prioritized)
                    try:
                        camera = camera_manager.get_camera(camera_id)
                        if camera and camera.stream and hasattr(camera.stream, 'is_usb') and camera.stream.is_usb:
                            # Minimal delay for USB cameras (reduced from 10ms to 3ms for lower latency)
                            time.sleep(0.003)  # 3ms - just enough to prevent frame bursts
                    except Exception as e:
                        logger.debug(f"USB detection check failed: {e}")
                        pass
                    
                    # Only throttle if we're going extremely fast (>50 FPS) to prevent overwhelming client
                    if len(send_times) >= 10:
                        span = send_times[-1] - send_times[0]
                        if span > 0:
                            fps = (len(send_times) - 1) / span
                            if fps > 50:
                                time.sleep(0.005)  # 5ms delay only if above 50 FPS
                    # No delay for normal operation - send frames as fast as possible
                        
                except GeneratorExit:
                    # Client disconnected, exit gracefully
                    break
                except Exception as e:
                    logger.warning(f"Stream error for camera {camera_id}: {e}", exc_info=True)
                    time.sleep(0.1)
                    # Continue streaming if possible
                    continue
                    
        except GeneratorExit:
            # Client disconnected during stream setup
            logger.debug(f"Client disconnected from camera {camera_id} stream")
            pass
        except Exception as e:
            logger.error(f"Fatal stream error for camera {camera_id}: {e}", exc_info=True)
        finally:
            # Mark stream as inactive
            with self.stream_lock:
                self.active_streams[camera_id] = False
            logger.debug(f"Stream stopped for camera {camera_id} (sent {frame_count} frames)")
    
    def generate_preview_stream(self, source: str):
        """Generate preview stream for testing sources. Reuses existing camera stream if available."""
        logger = logging.getLogger(__name__)
        stream = None
        reuse_existing = False
        
        try:
            # First, check if a camera with this source is already running
            # Many RTSP servers don't allow multiple concurrent connections
            existing_camera = camera_manager.get_camera_by_source(source)
            
            if existing_camera and existing_camera.stream:
                # Reuse existing camera stream instead of opening new connection
                reuse_existing = True
                logger.info(f"Preview: Reusing existing camera stream for {source}")
                
                try:
                    no_frame_count = 0
                    max_no_frame_wait = 300  # Wait up to 3 seconds for first frame
                    
                    while True:
                        frame = existing_camera.stream.read()
                        if frame is None:
                            no_frame_count += 1
                            # If we've been waiting too long, yield a "waiting" frame
                            if no_frame_count > max_no_frame_wait:
                                waiting_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                                cv2.putText(waiting_frame, "Waiting for stream...", (120, 220),
                                           cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                                cv2.putText(waiting_frame, f"Source: {source[:50]}", (120, 260),
                                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
                                ret, jpeg = cv2.imencode('.jpg', waiting_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                                if ret:
                                    yield (b'--frame\r\n'
                                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
                                time.sleep(0.1)
                            else:
                                time.sleep(0.01)
                            continue
                        
                        # Reset no_frame_count when we get a frame
                        no_frame_count = 0
                        
                        # Encode frame to JPEG
                        ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                        if not ret:
                            time.sleep(0.01)
                            continue
                        
                        # Yield MJPEG frame
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
                        
                        time.sleep(0.033)  # ~30 FPS
                except GeneratorExit:
                    # Client disconnected, exit gracefully
                    pass
                except Exception as e:
                    logger.warning(f"Preview stream error (reusing existing): {e}", exc_info=True)
                    # Yield error frame
                    error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(error_frame, f"Error: {str(e)[:40]}", (50, 240),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
                    ret, jpeg = cv2.imencode('.jpg', error_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    if ret:
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
                return
            
            # If no existing camera, create temporary video stream
            from app.services.camera_manager import VideoStream
            logger.info(f"Preview: Creating new VideoStream for {source}")
            stream = VideoStream(source)
            
            # Wait for stream to initialize and get first frame
            max_wait = 3.0  # Wait up to 3 seconds
            wait_start = time.time()
            no_frame_count = 0
            max_no_frame_wait = 300  # Wait up to 3 seconds (300 * 0.01s) for first frame
            
            try:
                while True:
                    frame = stream.read()
                    if frame is None:
                        no_frame_count += 1
                        # If we've been waiting too long, yield a "waiting" frame
                        if no_frame_count > max_no_frame_wait:
                            waiting_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                            cv2.putText(waiting_frame, "Connecting to stream...", (100, 220),
                                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                            cv2.putText(waiting_frame, f"Source: {source[:50]}", (100, 260),
                                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
                            ret, jpeg = cv2.imencode('.jpg', waiting_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                            if ret:
                                yield (b'--frame\r\n'
                                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
                            time.sleep(0.1)
                        else:
                            time.sleep(0.01)
                        continue
                    
                    # Reset no_frame_count when we get a frame
                    no_frame_count = 0
                    
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
                if stream and not reuse_existing:
                    try:
                        stream.stop()
                        logger.debug(f"Stopped preview stream for {source}")
                    except Exception as e:
                        logger.warning(f"Error stopping preview stream: {e}")
                
        except Exception as e:
            logger.error(f"Preview stream error for source {source}: {e}", exc_info=True)
            # Return error frame
            error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            error_msg = str(e)
            if len(error_msg) > 50:
                error_msg = error_msg[:47] + "..."
            cv2.putText(error_frame, f"Error: {error_msg}", (50, 240),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
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
