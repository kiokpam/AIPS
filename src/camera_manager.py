
# camera_manager.py
import threading, time, cv2, os
# Mitigate FFmpeg threading assertion issues on some Windows setups
os.environ.setdefault('OPENCV_FFMPEG_THREADS', '1')
from collections import deque
import numpy as np

from models import get_model
from detector import detect_frame
from business_models import count_in_zone, LineInOutState, count_line_inout
from tracker import CentroidTracker


# -----------------------------
# VideoStream: thread đọc camera/file/rtsp
# -----------------------------
class VideoStream:
    def __init__(self, src):
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

        threading.Thread(target=self._update, daemon=True).start()

    def _normalize_source(self, src):
        # Webcam ID
        if isinstance(src, str) and src.isdigit():
            return int(src)
        # File relative path
        if isinstance(src, str) and not src.startswith(("rtsp://", "http://", "/")):
            return os.path.abspath(src)
        return src

    def _error_message(self, src):
        if isinstance(src, int):
            return f"Cannot open webcam {src}"
        if isinstance(src, str):
            if src.startswith(("rtsp://", "http://")):
                return f"Cannot open video stream: {src}"
            return f"Cannot open video file: {src}"
        return f"Cannot open video source: {src}"

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
                # fallback to default anyway
                return cv2.VideoCapture(src)

            # Files: default is fine
            return cv2.VideoCapture(src)
        except Exception:
            return cv2.VideoCapture(src)

    def _update(self):
        last_time = time.time()
        fail_count = 0
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                fail_count += 1
                # loop lại nếu là video file
                if self.is_video_file:
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    fail_count = 0
                else:
                    # On repeated failures for webcam/rtsp, try reopen
                    if fail_count >= 30:  # ~1.5s of failures
                        try:
                            self.cap.release()
                        except Exception:
                            pass
                        self.cap = self._open_capture(self.src)
                        fail_count = 0
                    time.sleep(0.05)
                continue

            with self.lock:
                self.latest_frame = frame
            fail_count = 0

            # Sync FPS
            elapsed = time.time() - last_time
            delay = self.frame_delay - elapsed
            if delay > 0:
                time.sleep(min(delay, 0.01))
            last_time = time.time()

    def read(self):
        with self.lock:
            if self.latest_frame is not None:
                return self.latest_frame.copy()
        return None

    def stop(self):
        self.running = False
        if self.cap:
            self.cap.release()


# -----------------------------
# CameraWorker: chạy YOLO + task + FPS đo thực tế
# -----------------------------
class CameraWorker:
    def __init__(self, cam_id, source, model_path="yolov8n.pt", skip_frame=3, device="auto"):
        self.cam_id = cam_id
        self.source = source
        self.device = device
        self.model = get_model(model_path, device)

        self.task = None
        self.task_params = {}
        self.tracker = CentroidTracker()
        self.line_state = None

        self.frame = None
        self.cached_rendered_frame = None
        self.current_count = 0
        self.display_fps = 0
        self.skip_frame = max(1, skip_frame)

        self.running = False
        self.thread = None
        self.stream = VideoStream(source)
        self.frame_times = deque(maxlen=90)  # ~3s buffer

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
        self.task = task_name
        self.task_params = params
        self.cached_rendered_frame = None
        if task_name == "line":
            self.line_state = LineInOutState(tuple(params["p1"]), tuple(params["p2"]))

    def clear_task(self):
        self.task = None
        self.task_params = {}
        self.line_state = None
        self.current_count = 0
        self.cached_rendered_frame = None
        # Ensure frame resumes immediately with raw stream after clearing task
        try:
            frame = self.stream.read()
            if frame is not None:
                self.frame = frame
        except Exception:
            pass

    def _run(self):
        frame_idx = 0
        while self.running:
            frame = self.stream.read()
            if frame is None:
                continue

            frame_idx += 1
            now = time.time()
            self.frame_times.append(now)

            # Tính FPS thực tế
            if len(self.frame_times) >= 2:
                span = self.frame_times[-1] - self.frame_times[0]
                if span > 0:
                    fps = (len(self.frame_times) - 1) / span
                    self.display_fps = round(min(fps, 60.0), 1)

            # Skip frame logic
            if frame_idx % self.skip_frame != 0:
                self.frame = self.cached_rendered_frame if self.cached_rendered_frame is not None else frame
                continue

            processed = frame.copy()

            # Run task
            zone_points = self.task_params.get("zone")
            if self.task == "zone" and zone_points:
                dets = detect_frame(self.model, processed, classes=[0])
                poly = np.array(zone_points, np.int32).reshape((-1, 1, 2))
                processed, count, _ = count_in_zone(processed, dets, poly)
                self.current_count = count

            elif self.task == "line" and self.line_state:
                dets = detect_frame(self.model, processed, classes=[0])
                processed, counts = count_line_inout(processed, dets, self.tracker, self.line_state)
                self.current_count = counts[0] + counts[1]
            else:
                self.current_count = 0

            cv2.putText(processed, f"FPS: {self.display_fps}", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

            self.cached_rendered_frame = processed
            self.frame = processed

    def get_jpeg_bytes(self):
        if self.frame is None:
            blank = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(blank, "No video feed", (200, 200),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            ret, jpeg = cv2.imencode(".jpg", blank, [cv2.IMWRITE_JPEG_QUALITY, 80])
            return jpeg.tobytes() if ret else None

        ret, jpeg = cv2.imencode(".jpg", self.frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
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
        if cam_id in self.cams:
            self.cams[cam_id].clear_task()

    def list_cameras(self):
        return list(self.cams.keys())

    def get_worker(self, cam_id):
        return self.cams.get(cam_id)
