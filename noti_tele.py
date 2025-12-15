import cv2
import time
import requests
import threading
import sys
import os
import queue
from datetime import datetime
import logging
import signal

# Configure logging to show messages
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# --- CRITICAL FIX FOR HEADLESS OPENCV ---
def patch_opencv_headless():
    """Patch OpenCV for headless environments (servers without GUI)"""
    patches = {
        'imshow': lambda name, img: None,
        'waitKey': lambda delay: 0,
        'destroyAllWindows': lambda: None,
        'namedWindow': lambda name, flags=None: None,
        'setMouseCallback': lambda winname, onMouse, userdata=None: None,
        'setNumThreads': lambda x: None,
    }
    constants = {
        'IMREAD_COLOR': 1,
        'WINDOW_NORMAL': 0,
        'WINDOW_GUI_EXPANDED': 0,
    }
    
    headless_detected = False
    for attr, func in patches.items():
        if not hasattr(cv2, attr):
            setattr(cv2, attr, func)
            headless_detected = True
    
    for attr, value in constants.items():
        if not hasattr(cv2, attr):
            setattr(cv2, attr, value)
    
    if headless_detected:
        logging.warning("[System] Headless OpenCV detected - GUI functions patched")
    return headless_detected

HEADLESS_MODE_FORCED = patch_opencv_headless()

# --- SAFE IMPORT FOR YOLO ---
try:
    from ultralytics import YOLO
except ImportError as e:
    logging.critical("\n" + "!"*60)
    logging.critical("[CRITICAL ERROR] Could not import 'YOLO' from 'ultralytics'.")
    sys.exit(1)

# ---------------- CONFIGURATION ----------------
# RTSP URL (prefer environment variables for secrets)
RTSP_URL = os.getenv("RTSP_URL", "rtsp://admin:Xpeedent289@171.226.119.80:554/cam/realmonitor?channel=1&subtype=0")

# Telegram Settings (from env to avoid hardcoding tokens)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8460483127:AAFSrZIlh4N4XLm3Zvra-JwKScj7UjS-J1E")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "7327246877")

# Detection Settings
CONFIDENCE_THRESHOLD = 0.5  
ALERT_COOLDOWN = 60         
INITIAL_SHOW_VIDEO = False 

# Inference tuning: run detection only every N frames (reduces CPU usage)
DETECTION_FRAME_SKIP = int(os.getenv("DETECTION_FRAME_SKIP", "2"))
MOTION_FRAME_SKIP = int(os.getenv("MOTION_FRAME_SKIP", "3"))  # Skip frames for motion detection too

# Telegram retry settings
TELEGRAM_MAX_RETRIES = int(os.getenv("TELEGRAM_MAX_RETRIES", "3"))
TELEGRAM_RETRY_DELAY = int(os.getenv("TELEGRAM_RETRY_DELAY", "5"))  # seconds

# Stream Stability Settings
MAX_CONSECUTIVE_ERRORS = 30  # Increased tolerance before reconnect
SKIP_DETECTION_ON_ERRORS = True  # Skip YOLO when stream is unstable

# -----------------------------------------------


class VideoRecorder(threading.Thread):
    def __init__(self, filename, width, height, fps, stop_event):
        super().__init__()
        self.filename = filename
        self.width = width
        self.height = height
        self.fps = fps
        self.stop_event = stop_event
        # Bounded queue to avoid unbounded memory growth when producer is faster than writer
        QUEUE_MAXSIZE = int(os.getenv("RECORDER_QUEUE_MAXSIZE", "256"))
        self.frame_queue = queue.Queue(maxsize=QUEUE_MAXSIZE)
        self.writer = cv2.VideoWriter(
            filename, 
            cv2.VideoWriter_fourcc(*'mp4v'), 
            fps, 
            (width, height)
        )
        if not getattr(self.writer, 'isOpened', lambda: True)():
            logging.warning(f"[Recorder] VideoWriter failed to open for {filename}")
            # mark inactive so add_frame will stop queuing
            self.active = False
            try:
                self.writer.release()
            except Exception:
                pass
            return
        self.active = True

    def add_frame(self, frame):
        if not self.active:
            return

        try:
            # try to put without blocking; if full, drop the oldest frame
            self.frame_queue.put_nowait(frame)
        except queue.Full:
            try:
                _ = self.frame_queue.get_nowait()  # drop oldest
                # don't call task_done for dropped frames; writer will call task_done when it processes
            except Exception:
                pass
            try:
                self.frame_queue.put_nowait(frame)
            except Exception:
                # if still failing, skip the frame
                logging.debug("[Recorder] Dropping frame; queue still full")
                pass

    def run(self):
        while not self.stop_event.is_set() or not self.frame_queue.empty():
            try:
                frame = self.frame_queue.get(timeout=0.1)
                self.writer.write(frame)
                self.frame_queue.task_done()
            except queue.Empty:
                continue
        
        self.writer.release()
        self.active = False
        logging.info(f"✅ Đã lưu {self.filename}")

class PersonDetector:
    def __init__(self):
        logging.info("Đang tải YOLO...")
        try:
            self.model = YOLO('weights/best.pt')
        except Exception as e:
            logging.exception(f"[Error] Failed to load YOLO model: {e}")
            sys.exit(1)
        
        self.last_alert_time = 0
        self.running = True
        self.show_video = INITIAL_SHOW_VIDEO
        self.reconnect_attempts = 0
        self.worker_threads = []
        self.cap = None
        
        # Optimized FFmpeg options for HEVC stability
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
            "rtsp_transport;tcp|"
            "buffer_size;8192000|"  # 8MB buffer
            "max_delay;5000000|"     # 5 second max delay
            "reorder_queue_size;0|"  # Disable reordering (helps with corrupted streams)
            "fflags;nobuffer"        # Minimize buffering latency
        )

        # Motion detection settings
        self.motion_threshold = float(os.getenv("MOTION_THRESHOLD_FRAC", "0.002"))
        self.prev_gray = None
        self.motion_frame_counter = 0  # Counter for motion detection frame skipping

    def send_telegram_video(self, video_path, caption="Phát hiện chuyển động"):
        """Sends video to Telegram with retry mechanism"""
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendVideo"
        
        for attempt in range(1, TELEGRAM_MAX_RETRIES + 1):
            try:
                with open(video_path, 'rb') as video_file:
                    files = {'video': video_file}
                    data = {'chat_id': TELEGRAM_CHAT_ID, 'caption': caption}
                    
                    if attempt > 1:
                        logging.info(f"📤 Thử lại lần {attempt}/{TELEGRAM_MAX_RETRIES}...")
                    else:
                        logging.info(f"📤 Gửi Telegram...")
                    
                    response = requests.post(url, files=files, data=data, timeout=30)
                    
                    if response.status_code == 200:
                        logging.info("✅ Gửi thành công")
                        break  # Success, exit retry loop
                    else:
                        logging.warning(f"⚠️ Lỗi HTTP {response.status_code}")
                        if attempt < TELEGRAM_MAX_RETRIES:
                            time.sleep(TELEGRAM_RETRY_DELAY)
                        
            except requests.exceptions.Timeout:
                logging.warning(f"⏱️ Timeout (lần {attempt})")
                if attempt < TELEGRAM_MAX_RETRIES:
                    time.sleep(TELEGRAM_RETRY_DELAY)
            except Exception as e:
                logging.exception(f"[Telegram] Lỗi (lần {attempt}): {e}")
                if attempt < TELEGRAM_MAX_RETRIES:
                    time.sleep(TELEGRAM_RETRY_DELAY)
        else:
            logging.error(f"❌ Gửi thất bại sau {TELEGRAM_MAX_RETRIES} lần thử")
        
        # Clean up video file
        finally:
            if os.path.exists(video_path):
                try:
                    os.remove(video_path)
                    logging.debug(f"🗑️ Đã xóa {video_path}")
                except Exception as e:
                    logging.warning(f"Không thể xóa {video_path}: {e}")

    def connect_stream(self):
        """Connect to RTSP stream with optimized settings"""
        logging.info(f"Kết nối RTSP...")
        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
        
        if cap.isOpened():
            # Set properties for better error tolerance
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 3)  # Small buffer to reduce lag
            logging.info("✅ Kết nối thành công")
            self.reconnect_attempts = 0  # Reset on success
            return cap
        else:
            logging.error("❌ Không thể mở RTSP")
            return None

    def run(self):
        cap = self.connect_stream()
        if cap is None: 
            return

        # store capture so stop() can access it
        self.cap = cap

        logging.info("\n=== HỆ THỐNG CHẠY ===")
        logging.info("Ghi 3s video → Gửi Telegram")
        logging.info(f"Tái kết nối sau {MAX_CONSECUTIVE_ERRORS} lỗi")
        logging.info("Ctrl+C để dừng\n")

        consecutive_errors = 0
        successful_frames = 0
        frame_counter = 0

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0 or fps > 60: fps = 20.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Recording State
        recorder = None
        recorder_stop_event = None
        recording_start_time = 0
        RECORDING_DURATION = 3

        while self.running:
            success, frame = cap.read()
            
            # --- IMPROVED ERROR HANDLING ---
            if not success:
                consecutive_errors += 1
                
                # Chỉ in ra mỗi 10 lỗi
                if consecutive_errors % 10 == 0:
                    logging.warning(f"⚠️ {consecutive_errors} lỗi liên tiếp")
                
                # Exponential backoff before reconnecting
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                    self.reconnect_attempts += 1
                    backoff_time = min(2 ** self.reconnect_attempts, 30)  # Max 30 seconds
                    
                    logging.warning(f"🔄 Tái kết nối (lần {self.reconnect_attempts})...")
                    
                    # Clean up recorder if active
                    if recorder:
                        recorder_stop_event.set()
                        recorder.join()
                        recorder = None
                    
                    cap.release()
                    time.sleep(backoff_time)
                    
                    cap = self.connect_stream()
                    if cap is None or not cap.isOpened():
                        logging.warning(f"❌ Thất bại, thử lại...")
                        time.sleep(backoff_time)
                        continue
                    
                    consecutive_errors = 0
                    successful_frames = 0
                else:
                    time.sleep(0.05)  # Short delay before retry
                continue
            
            # Frame read successful
            consecutive_errors = 0
            successful_frames += 1
            
            # Reset reconnect attempts after sustained success
            if successful_frames > 100:
                self.reconnect_attempts = max(0, self.reconnect_attempts - 1)
                successful_frames = 0

            # --- Motion pre-check (cheap, but skip frames to save CPU) ---
            motion_detected = True
            self.motion_frame_counter += 1
            
            # Only check motion every N frames
            if (self.motion_frame_counter % MOTION_FRAME_SKIP) == 0:
                try:
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    gray = cv2.GaussianBlur(gray, (21, 21), 0)
                    if self.prev_gray is None:
                        self.prev_gray = gray
                    else:
                        diff = cv2.absdiff(self.prev_gray, gray)
                        _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
                        non_zero = cv2.countNonZero(thresh)
                        total_pixels = thresh.shape[0] * thresh.shape[1]
                        frac = non_zero / float(total_pixels)
                        motion_detected = frac >= self.motion_threshold
                        self.prev_gray = gray
                except Exception:
                    motion_detected = True

            # --- YOLO DETECTION (Skip if stream is unstable) ---
            person_detected = False
            
            # Only run detection if we have stable frames
            if SKIP_DETECTION_ON_ERRORS and consecutive_errors > 0:
                # Skip detection during error recovery
                pass
            else:
                # Optionally skip frames to reduce CPU usage and require motion
                run_detection = (frame_counter % DETECTION_FRAME_SKIP) == 0
                frame_counter += 1

                if run_detection and motion_detected:
                    try:
                        # Try to pass confidence to model inference (some ultralytics versions accept it)
                        try:
                            results = self.model(frame, stream=True, verbose=False, conf=CONFIDENCE_THRESHOLD)
                        except TypeError:
                            results = self.model(frame, stream=True, verbose=False)

                        for result in results:
                            boxes = getattr(result, 'boxes', [])
                            for box in boxes:
                                try:
                                    cls_id = int(box.cls[0])
                                    conf = float(box.conf[0])
                                    if cls_id == 0 and conf > CONFIDENCE_THRESHOLD:
                                        person_detected = True
                                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                                        cv2.putText(frame, f"Person {conf:.2f}", (x1, y1 - 10),
                                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                                except Exception:
                                    continue
                    except Exception as e:
                        logging.exception(f"[YOLO] Detection error (non-fatal): {e}")

            # --- ALERT & RECORDING LOGIC ---
            current_time = time.time()
            
            # Start Recording
            if person_detected and recorder is None:
                if (current_time - self.last_alert_time) > ALERT_COOLDOWN:
                    logging.info(f"🚨 PHÁT HIỆN NGƯỜI - Ghi {RECORDING_DURATION}s")
                    self.last_alert_time = current_time
                    
                    filename = f"alert_{int(current_time)}.mp4"
                    recorder_stop_event = threading.Event()
                    recorder = VideoRecorder(filename, width, height, fps, recorder_stop_event)
                    recorder.start()
                    recording_start_time = current_time

            # Continue Recording
            if recorder:
                recorder.add_frame(frame.copy())  # Use copy to avoid threading issues
                
                # Stop Recording
                if (current_time - recording_start_time) >= RECORDING_DURATION:
                    logging.info("✅ Ghi xong → Gửi Telegram")
                    recorder_stop_event.set()

                    t = threading.Thread(target=self.handle_recording_completion, args=(recorder,), daemon=True)
                    self.worker_threads.append(t)
                    t.start()

                    recorder = None

            # --- DISPLAY ---
            if self.show_video:
                try:
                    cv2.imshow("RTSP Person Detector", frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        self.running = False
                        break
                except Exception:
                    self.show_video = False

        if cap:
            cap.release()
        cv2.destroyAllWindows()
        logging.info("\n=== HỆ THỐNG DỪNG ===")

    def stop(self, wait_seconds=5):
        """Signal the detector to stop and join background threads."""
        logging.info("Shutdown requested: stopping detector...")
        self.running = False
        # stop capture
        try:
            if self.cap is not None:
                self.cap.release()
        except Exception:
            pass

        # signal any active recorder
        try:
            # there may be recorder_stop_event in local scope; best-effort: set any event attributes
            # Not ideal to access locals here; rely on worker threads to finish.
            pass
        except Exception:
            pass

        # join worker threads
        for t in self.worker_threads:
            try:
                t.join(timeout=wait_seconds)
            except Exception:
                logging.debug("Worker thread did not join in time")

    def handle_recording_completion(self, recorder):
        """Waits for recorder to finish writing, then triggers Telegram/AI"""
        recorder.join()
        
        timestamp = datetime.now().strftime('%d/%m %H:%M')
        self.send_telegram_video(recorder.filename, f"🚨 PHÁT HIỆN NGƯỜI\n⏰ {timestamp}")

if __name__ == "__main__":
    detector = PersonDetector()
    detector.run()