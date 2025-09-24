# camera_manager.py
import threading, time, cv2, os
from models import get_model
from detector import detect_frame
from business_models import count_in_zone, LineInOutState, count_line_inout
from tracker import CentroidTracker
import numpy as np
from utils import draw_detection_box
# -----------------------------
# VideoStream: thread đọc camera
# -----------------------------
class VideoStream:
    def __init__(self, src):
        print(f"DEBUG: Initializing VideoStream with source: {src}")
        
        # Convert relative path to absolute if needed
        if isinstance(src, str) and not src.startswith(('rtsp://', 'http://', '/')):
            if not src.isdigit():
                src = os.path.abspath(src)
                print(f"DEBUG: Converted to absolute path: {src}")
        
        # For webcam (numeric string), convert to int and validate
        if isinstance(src, str) and src.isdigit():
            src = int(src)
            print(f"DEBUG: Webcam ID detected: {src}")
            
            # Test if webcam exists before opening
            if not self._test_webcam_availability(src):
                raise RuntimeError(f"Webcam with ID {src} is not available. Please check:\n"
                                   f"1. Webcam is connected properly\n"
                                   f"2. Webcam is not being used by another application\n"
                                   f"3. Try different webcam IDs (0, 1, 2...)")
        
        self.cap = cv2.VideoCapture(src)
        if not self.cap.isOpened():
            error_msg = self._get_detailed_error_message(src)
            print(f"ERROR: Cannot open video source: {src}")
            raise RuntimeError(error_msg)
            
        # Get video FPS for proper timing
        self.video_fps = self.cap.get(cv2.CAP_PROP_FPS)
        if self.video_fps <= 0 or self.video_fps > 120:  # Fallback for invalid FPS
            self.video_fps = 25.0  # Default FPS
        
        self.frame_delay = 1.0 / self.video_fps  # Time between frames
        print(f"DEBUG: VideoStream opened successfully, FPS: {self.video_fps}, Frame delay: {self.frame_delay:.3f}s")
        
        self.latest_frame = None
        self.lock = threading.Lock()
        self.running = True
        self.frame_count = 0
        
        # Đo FPS thực tế
        self.actual_fps = 0.0
        self.fps_measurement_frames = []
        
        threading.Thread(target=self._update, daemon=True).start()

    def _test_webcam_availability(self, webcam_id):
        """Test if webcam ID is available without fully opening it"""
        try:
            test_cap = cv2.VideoCapture(webcam_id)
            if not test_cap.isOpened():
                return False
            
            # Try to read a frame to confirm it works
            ret, frame = test_cap.read()
            test_cap.release()
            return ret and frame is not None
        except Exception as e:
            print(f"DEBUG: Webcam test failed: {e}")
            return False
    
    def _get_detailed_error_message(self, src):
        """Generate detailed error message based on source type"""
        if isinstance(src, int):  # Webcam
            return (f"Cannot open webcam {src}. Common solutions:\n"
                   f"• Check if webcam is properly connected\n"
                   f"• Close other applications using the webcam (Skype, Teams, etc.)\n"
                   f"• Try different webcam IDs (0, 1, 2...)\n"
                   f"• Update webcam drivers\n"
                   f"• Check webcam permissions in Windows Settings")
        elif isinstance(src, str):
            if src.startswith(('rtsp://', 'http://')):  # RTSP/HTTP stream
                return (f"Cannot open video stream: {src}\n"
                       f"• Check network connection\n"
                       f"• Verify RTSP URL and credentials\n"
                       f"• Check if camera is online and accessible")
            else:  # File path
                return (f"Cannot open video file: {src}\n"
                       f"• Check if file exists and is readable\n"
                       f"• Verify video format is supported (mp4, avi, mov, etc.)\n"
                       f"• Check file permissions")
        else:
            return f"Cannot open video source: {src}"

    def _update(self):
        print("DEBUG: VideoStream thread started")
        last_frame_time = time.time()
        
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                # For video files, loop back to beginning
                if isinstance(self.cap.get(cv2.CAP_PROP_FRAME_COUNT), float):
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                time.sleep(0.05)
                continue
                
            self.frame_count += 1
            current_time = time.time()
            
            # Đo FPS thực tế - chỉ đo frame reading, không bao gồm sleep
            self.fps_measurement_frames.append(current_time)
            # Giữ frames trong 3 giây để stable hơn
            self.fps_measurement_frames = [t for t in self.fps_measurement_frames if t > current_time - 3.0]
            
            # Tính FPS thực tế
            if len(self.fps_measurement_frames) >= 10:  # Cần ít nhất 10 frames để tính chính xác
                time_span = self.fps_measurement_frames[-1] - self.fps_measurement_frames[0]
                if time_span > 0:
                    self.actual_fps = round((len(self.fps_measurement_frames) - 1) / time_span, 1)
            elif len(self.fps_measurement_frames) <= 1:
                # Fallback về metadata FPS khi chưa đủ data
                self.actual_fps = round(self.video_fps, 1)
            
            with self.lock:
                self.latest_frame = frame.copy()  # Make copy to avoid corruption
            
            # Control frame rate by sleeping for the correct duration
            time_elapsed = current_time - last_frame_time
            time_to_wait = self.frame_delay - time_elapsed
            
            if time_to_wait > 0:
                time.sleep(time_to_wait)
            
            last_frame_time = time.time()

    def read(self):
        with self.lock:
            return self.latest_frame.copy() if self.latest_frame is not None else None

    def stop(self):
        print("DEBUG: Stopping VideoStream")
        self.running = False
        if self.cap:
            self.cap.release()
        print("DEBUG: VideoStream stopped")

# -----------------------------
# CameraWorker: chạy YOLO + task
# -----------------------------
class CameraWorker:
    def __init__(self, cam_id, source, model_path="yolov8n.pt", skip_frame=3, device="auto"):
        print(f"DEBUG: Creating CameraWorker {cam_id} with skip_frame={skip_frame}")
        
        self.cam_id = cam_id
        self.source = source
        self.device = device
        self.model_path = model_path  # Lưu path thay vì load model ngay
        self.model = None  # Model sẽ được load khi cần thiết
        self.task = None
        self.task_params = {}
        self.running = False
        self.lock = threading.Lock()
        self.thread = None
        self.frame = None
        self.tracker = CentroidTracker()
        self.line_state = None

        # Stats
        self.current_count = 0
        self.current_fps = 0
        self.processing_fps = 0  # FPS của việc xử lý YOLO
        self.streaming_fps = 0   # FPS thực tế của video streaming
        self.display_fps = 0     # FPS hiển thị tổng hợp
        self.fps_frames = []
        self.skip_frame = max(1, skip_frame)  # Ensure skip_frame >= 1
        self.cached_rendered_frame = None  # Cache for visualization
        
        print(f"DEBUG: Skip frame set to: {self.skip_frame}")

        # Video stream
        try:
            self.stream = VideoStream(source)
        except RuntimeError as e:
            print(f"ERROR: Failed to create VideoStream: {e}")
            raise

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        self.stream.stop()
        if self.thread:
            self.thread.join(timeout=1)

    def set_task(self, task_name, params):
        with self.lock:
            # Load model khi set task lần đầu
            if self.model is None and task_name in ["zone", "line"]:
                print(f"🚀 Loading YOLO model for camera {self.cam_id} - task: {task_name}")
                self.model = get_model(self.model_path, self.device)
                print(f"✅ Model loaded successfully for camera {self.cam_id}")
            
            self.task = task_name
            self.task_params = params
            # Clear cache when task changes to force immediate update
            self.cached_rendered_frame = None
            if task_name == "line":
                p1 = tuple(params['p1'])
                p2 = tuple(params['p2'])
                self.line_state = LineInOutState(p1, p2)

    def clear_task(self):
        """Clear current task and return to normal video stream"""
        with self.lock:
            print(f"🔄 Clearing task for camera {self.cam_id}")
            self.task = None
            self.task_params = {}
            self.line_state = None
            self.current_count = 0
            # Clear cache to force immediate update
            self.cached_rendered_frame = None
            print(f"✅ Task cleared for camera {self.cam_id} - showing normal video stream")

    def _run(self):
        print(f"DEBUG: Camera {self.cam_id} started with source {self.source}")
        frame_idx = 0
        
        while self.running:
            frame = self.stream.read()
            if frame is None:
                # time.sleep(0.01)
                continue

            frame_idx += 1
            frame_resized = frame.copy()  # Make copy to avoid threading issues

            # Skip processing - use cached frame
            if frame_idx % self.skip_frame != 0:
                if self.cached_rendered_frame is not None:
                    # Use cached frame for maximum performance
                    self.frame = self.cached_rendered_frame.copy()
                else:
                    # First few frames before cache is created - show raw frame
                    self.frame = frame_resized
                continue

            # Update FPS stats
            current_time = time.time()
            
            # 1. Luôn lấy streaming FPS từ VideoStream (tốc độ đọc video thực tế)
            video_fps = getattr(self.stream, 'actual_fps', 0)
            if video_fps <= 0:
                # Fallback to metadata FPS
                video_fps = round(self.stream.video_fps, 1) if hasattr(self.stream, 'video_fps') else 0
            self.streaming_fps = video_fps
            
            # 2. Kiểm tra có task active không
            has_active_task = (
                (self.task == "zone" and 'zone' in self.task_params and self.model is not None) or
                (self.task == "line" and self.line_state is not None and self.model is not None)
            )
            
            # 3. Tính processing FPS (chỉ khi có task)
            if has_active_task:
                # Có task - tính FPS của AI processing (chỉ processed frames)
                self.fps_frames.append(current_time)
                self.fps_frames = [t for t in self.fps_frames if t > current_time - 3.0]  # 3 giây để stable hơn
                if len(self.fps_frames) > 1:
                    span = self.fps_frames[-1] - self.fps_frames[0]
                    if span > 0:
                        # Tính processing FPS thật (bao gồm cả skip frame effect)
                        raw_fps = (len(self.fps_frames) - 1) / span
                        self.processing_fps = round(raw_fps, 1)
                    else:
                        self.processing_fps = 0
                else:
                    self.processing_fps = 0
            else:
                # Không có task - không có processing
                self.processing_fps = 0
                self.fps_frames = []  # Clear processing fps tracking
            
            # 4. Set current_fps cho API (luôn là streaming FPS để consistent)
            self.current_fps = self.streaming_fps
            self.display_fps = self.streaming_fps

            # Perform task - chỉ detect khi có task được set
            with self.lock:
                if self.task == "zone" and 'zone' in self.task_params and self.model is not None:
                    # Detect persons chỉ khi có zone task và model đã được load
                    dets = detect_frame(self.model, frame_resized, classes=[0])
                    poly = np.array(self.task_params['zone'], np.int32).reshape((-1,1,2))
                    frame_resized, count, _ = count_in_zone(frame_resized, dets, poly)
                    self.current_count = count
                    
                    # Debug every 30 processed frames
                    if (frame_idx // self.skip_frame) % 30 == 0:
                        print(f"DEBUG: Camera {self.cam_id} - Frame {frame_idx} (every {self.skip_frame}), detected {len(dets)} objects in ZONE, Count: {count}, Streaming: {self.streaming_fps} FPS, Processing: {self.processing_fps} FPS")
                        
                elif self.task == "line" and self.line_state is not None and self.model is not None:
                    # Detect persons chỉ khi có line task và model đã được load
                    dets = detect_frame(self.model, frame_resized, classes=[0])
                    frame_resized, counts = count_line_inout(frame_resized, dets, self.tracker, self.line_state)
                    self.current_count = counts[0] + counts[1]
                    
                    # Debug every 30 processed frames
                    if (frame_idx // self.skip_frame) % 30 == 0:
                        print(f"DEBUG: Camera {self.cam_id} - Frame {frame_idx} (every {self.skip_frame}), detected {len(dets)} objects in LINE, In/Out: {counts}, Streaming: {self.streaming_fps} FPS, Processing: {self.processing_fps} FPS")
                        
                else:
                    # No task - chỉ hiển thị video gốc, KHÔNG detect
                    self.current_count = 0
                    # Debug every 30 processed frames
                    if (frame_idx // self.skip_frame) % 30 == 0:
                        print(f"DEBUG: Camera {self.cam_id} - Frame {frame_idx} (every {self.skip_frame}), NO TASK - showing video at {self.streaming_fps} FPS")

            # Cache the rendered frame for skip frames
            self.cached_rendered_frame = frame_resized.copy()
            self.frame = frame_resized
            # time.sleep(0.005)

    def get_jpeg_bytes(self):
        if self.frame is None:
            error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(error_frame, 'No video feed', (200, 200),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255,255,255), 2)
            ret, jpeg = cv2.imencode('.jpg', error_frame)
            return jpeg.tobytes() if ret else None
        ret, jpeg = cv2.imencode('.jpg', self.frame)
        return jpeg.tobytes() if ret else None

# -----------------------------
# CameraManager: quản lý nhiều cam
# -----------------------------
class CameraManager:
    def __init__(self):
        self.cams = {}
        self.next_id = 1
        self.lock = threading.Lock()

    def add_camera(self, source, model_path="yolov8n.pt", device="auto"):
        with self.lock:
            cam_id = str(self.next_id)
            self.next_id += 1
            if isinstance(source, str) and not source.startswith(('rtsp://','http://','/')):
                if not source.isdigit():
                    source = os.path.abspath(source)
            worker = CameraWorker(cam_id, source, model_path, device=device)
            worker.start()
            self.cams[cam_id] = worker
            return cam_id

    def remove_camera(self, cam_id):
        with self.lock:
            if cam_id in self.cams:
                self.cams[cam_id].stop()
                del self.cams[cam_id]

    def set_task(self, cam_id, task_name, params):
        if cam_id in self.cams:
            self.cams[cam_id].set_task(task_name, params)

    def clear_task(self, cam_id):
        """Clear current task and return to normal video stream"""
        if cam_id in self.cams:
            self.cams[cam_id].clear_task()

    def list_cameras(self):
        return list(self.cams.keys())

    def get_worker(self, cam_id):
        return self.cams.get(cam_id)
