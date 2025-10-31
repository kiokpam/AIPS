"""
Preview API endpoints for testing video sources
"""

import cv2
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.services.streaming_service import streaming_service

router = APIRouter(prefix="/preview", tags=["preview"])

@router.get("/stream")
def preview_stream(source: str = Query(..., description="Video source (RTSP URL, file path, or webcam ID)")):
    """Preview video stream from any source without adding to system"""
    if not source.strip():
        raise HTTPException(status_code=400, detail="Source parameter is required")
    
    try:
        # Generate preview stream
        def generate():
            yield from streaming_service.generate_preview_stream(source)
        
        return StreamingResponse(
            generate(),
            media_type="multipart/x-mixed-replace; boundary=frame",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview error: {str(e)}")

@router.get("/test")
def test_source(source: str = Query(..., description="Video source to test")):
    """Test if a video source is accessible"""
    try:
        import threading
        import queue
        import time
        
        result_queue = queue.Queue()
        
        def test_connection():
            cap = None
            try:
                # Try opening with retry (some sources need a moment between connections)
                max_retries = 2
                for attempt in range(max_retries):
                    try:
                        cap = cv2.VideoCapture(source)
                        # Set timeout for opening (some RTSP sources take time)
                        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                        if cap.isOpened():
                            break
                        cap.release()
                        cap = None
                        if attempt < max_retries - 1:
                            time.sleep(0.5)  # Brief delay before retry
                    except Exception as e:
                        if cap:
                            cap.release()
                        cap = None
                        if attempt < max_retries - 1:
                            time.sleep(0.5)
                        else:
                            raise
                
                if cap and cap.isOpened():
                    # Get basic info
                    fps = cap.get(cv2.CAP_PROP_FPS) or 0
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
                    
                    # Try to read one frame with timeout
                    start_time = time.time()
                    ret = False
                    frame = None
                    while time.time() - start_time < 3.0:  # 3 second timeout for frame read
                        ret, frame = cap.read()
                        if ret and frame is not None:
                            break
                        time.sleep(0.1)
                    
                    cap.release()
                    
                    if ret and frame is not None:
                        result_queue.put(("success", {
                            "fps": fps,
                            "width": width,
                            "height": height,
                            "frame_readable": True
                        }))
                    else:
                        result_queue.put(("error", "Cannot read frames from video source"))
                else:
                    if cap:
                        cap.release()
                    result_queue.put(("error", "Cannot open video source - connection failed or source in use"))
            except Exception as e:
                if cap:
                    try:
                        cap.release()
                    except:
                        pass
                error_msg = str(e)
                if "timeout" in error_msg.lower():
                    error_msg = "Connection timeout - video source not responding"
                elif "connection" in error_msg.lower():
                    error_msg = "Cannot open video source - connection failed"
                result_queue.put(("error", error_msg))
        
        # Start test in a separate thread
        test_thread = threading.Thread(target=test_connection, daemon=True)
        test_thread.start()
        
        # Wait for result with timeout
        try:
            result_type, data = result_queue.get(timeout=15)  # 15 second timeout
            if result_type == "success":
                return {
                    "accessible": True,
                    "fps": data["fps"],
                    "width": data["width"],
                    "height": data["height"],
                    "frame_readable": data["frame_readable"],
                    "source": source
                }
            else:
                return {
                    "accessible": False,
                    "error": data,
                    "source": source
                }
        except queue.Empty:
            return {
                "accessible": False,
                "error": "Connection timeout - video source not responding",
                "source": source
            }
            
    except Exception as e:
        error_msg = str(e)
        if "Connection refused" in error_msg:
            error_msg = "Connection refused - check if the RTSP server is running and accessible"
        elif "timeout" in error_msg.lower():
            error_msg = "Connection timeout - check network connectivity"
        elif "Cannot open video source" in error_msg:
            error_msg = "Cannot open video source - check URL format and credentials"
        
        return {
            "accessible": False,
            "error": error_msg,
            "source": source
        }

@router.get("/debug")
def debug_rtsp(rtsp_url: str = Query(..., description="RTSP URL to debug")):
    """Debug RTSP connection with detailed information"""
    import socket
    from urllib.parse import urlparse
    
    try:
        # Parse the RTSP URL
        parsed = urlparse(rtsp_url)
        host = parsed.hostname
        port = parsed.port or 554  # Default RTSP port
        
        # Test basic network connectivity
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        
        network_error = None
        try:
            result = sock.connect_ex((host, port))
            network_accessible = result == 0
        except Exception as e:
            network_accessible = False
            network_error = str(e)
        finally:
            sock.close()
        
        # Test OpenCV backends
        backends = [
            ("FFmpeg", cv2.CAP_FFMPEG),
            ("GStreamer", cv2.CAP_GSTREAMER),
            ("Default", cv2.CAP_ANY)
        ]
        
        backend_results = []
        for name, backend in backends:
            try:
                cap = cv2.VideoCapture(rtsp_url, backend)
                is_opened = cap.isOpened()
                if is_opened:
                    ret, frame = cap.read()
                    frame_readable = ret and frame is not None
                else:
                    frame_readable = False
                cap.release()
                
                backend_results.append({
                    "backend": name,
                    "opened": is_opened,
                    "frame_readable": frame_readable
                })
            except Exception as e:
                backend_results.append({
                    "backend": name,
                    "opened": False,
                    "frame_readable": False,
                    "error": str(e)
                })
        
        return {
            "rtsp_url": rtsp_url,
            "parsed": {
                "host": host,
                "port": port,
                "username": parsed.username,
                "path": parsed.path
            },
            "network_test": {
                "accessible": network_accessible,
                "error": network_error if not network_accessible else None
            },
            "opencv_backends": backend_results,
            "recommendations": _get_rtsp_recommendations(rtsp_url, network_accessible, backend_results)
        }
        
    except Exception as e:
        return {
            "error": f"Debug failed: {str(e)}",
            "rtsp_url": rtsp_url
        }

def _get_rtsp_recommendations(rtsp_url: str, network_ok: bool, backend_results: list) -> list:
    """Generate recommendations based on test results"""
    recommendations = []
    
    if not network_ok:
        recommendations.extend([
            "Check if the RTSP server is running",
            "Verify the IP address and port are correct",
            "Check firewall settings",
            "Test network connectivity: ping the server IP"
        ])
    
    if not any(b["opened"] for b in backend_results):
        recommendations.extend([
            "Try different RTSP URL formats:",
            "  - rtsp://username:password@ip:port/path",
            "  - rtsp://ip:port/path (if no auth needed)",
            "  - rtsp://ip:port/stream1",
            "Check if the camera supports RTSP protocol",
            "Try using VLC or other RTSP client to test the URL"
        ])
    
    if any(b["opened"] and not b["frame_readable"] for b in backend_results):
        recommendations.extend([
            "Connection established but cannot read frames",
            "Check camera settings and stream configuration",
            "Verify the stream path is correct"
        ])
    
    return recommendations
