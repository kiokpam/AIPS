import cv2
import numpy as np
from ultralytics import YOLO
import cvzone
from tracker import *
import time

# ========= CONFIG INPUT =========
VIDEO_SOURCE = "rtsp://admin:@Nam12345@171.248.147.155:554/ch1/main"


# ================== CONFIG INPUT ==================
# VIDEO_SOURCE = "b.mp4"
model = YOLO("yolov8n.pt")
TARGET_CLASS = 0  # person class

# ------------------- CLEANUP / BEHAVIOR FLAGS -------------------
# If True, save processed video to disk. Set False to skip writing output file.
SAVE_OUTPUT = False

# If True, when RTSP fails the script will prompt the user for a new URL (interactive).
# Set False for non-interactive automatic behavior (recommended for headless servers).
ALLOW_INTERACTIVE_RTSP_INPUT = False

# Reconnect / RTSP settings
RECONNECT_TRIES = 3       # how many times to recreate VideoCapture
RECONNECT_WAIT = 2.0      # seconds to wait between attempts


def try_open_capture(url, tries=RECONNECT_TRIES, wait=RECONNECT_WAIT):
    """Try to open a cv2.VideoCapture and return (cap, first_frame) or (None, None)."""
    for attempt in range(1, tries + 1):
        cap = cv2.VideoCapture(url)
        # try reading a few frames to allow stream to warm up
        for _ in range(30):
            ret, frame = cap.read()
            if ret and frame is not None:
                return cap, frame.copy()
            cv2.waitKey(30)
        cap.release()
        time.sleep(wait)
    return None, None


cap, initial_frame = try_open_capture(VIDEO_SOURCE)

# ================== ĐỌC FRAME ĐẦU ==================
# Try to read a valid first frame (wait up to ~80 attempts)
first_frame = None
if cap is not None and initial_frame is not None:
    first_frame = initial_frame
else:
    print("❌ Không đọc được video. Thử lại...")
    cap, first_frame = try_open_capture(VIDEO_SOURCE, tries=RECONNECT_TRIES * 2)
    if first_frame is None:
        print("❌ Không thể mở stream sau nhiều lần thử. Thoát.")
        if cap is not None:
            cap.release()
        exit(1)

h, w = first_frame.shape[:2]

# ================== OUTPUT VIDEO ==================
out = None
if SAVE_OUTPUT:
    out = cv2.VideoWriter(
        "output_inout.mp4", cv2.VideoWriter_fourcc(*"mp4v"), 30, (w, h)
    )

# ================== VẼ HAI ĐƯỜNG ==================
points = []

def draw_lines(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:
        points.append((x, y))

cv2.namedWindow("Draw Lines")
cv2.setMouseCallback("Draw Lines", draw_lines)

temp = first_frame.copy()
while True:
    img = temp.copy()

    for p in points:
        cv2.circle(img, p, 5, (0, 255, 0), -1)

    if len(points) >= 2:
        cv2.line(img, points[0], points[1], (0, 255, 255), 2)
    if len(points) >= 4:
        cv2.line(img, points[2], points[3], (255, 255, 0), 2)

    cv2.putText(img, "Click 2 diem line IN, 2 diem line OUT - ENTER de xong",
                (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

    cv2.imshow("Draw Lines", img)
    key = cv2.waitKey(1)

    if key == 13:
        if len(points) == 4:
            break
        print("❗ Ban phai click dung 4 diem")
    elif key == 27:
        exit()

cv2.destroyWindow("Draw Lines")

IN_p1, IN_p2 = points[0], points[1]
OUT_p1, OUT_p2 = points[2], points[3]

# ================== TRACKING STATE ==================
tracker = Tracker()
state = {}            # id → "in" / "out"
last_pos = {}         # id → (x,y)
count_in = 0
count_out = 0

# ================== CHECK CROSS LINE ==================
def is_cross(prev, now, A, B):
    if prev is None:
        return False

    prev = np.array(prev, float)
    now = np.array(now, float)
    A = np.array(A, float)
    B = np.array(B, float)

    def ccw(P, Q, R):
        return (R[1] - P[1]) * (Q[0] - P[0]) > (Q[1] - P[1]) * (R[0] - P[0])

    return ccw(prev, now, A) != ccw(prev, now, B) and \
           ccw(A, B, prev) != ccw(A, B, now)

# ================== MAIN LOOP ==================
cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

prev_time = time.time()

while True:
    ret, frame = cap.read()
    if not ret:
        # Attempt automatic reconnect
        print("⚠️ Mất kết nối tới RTSP, thử reconnect...")
        cap.release()
        cap, frame = try_open_capture(VIDEO_SOURCE)
        if cap is None or frame is None:
            print("❌ Reconnect thất bại.")
            if ALLOW_INTERACTIVE_RTSP_INPUT:
                # Interactive fallback: ask user once for new URL
                print("Nhập RTSP mới hoặc để trống để thoát:")
                try:
                    new_url = input().strip()
                except Exception:
                    new_url = ""
                if new_url:
                    VIDEO_SOURCE = new_url
                    cap, frame = try_open_capture(VIDEO_SOURCE, tries=RECONNECT_TRIES * 2)
            # If still failed or not allowed interactive, exit cleanly
            if cap is None or frame is None:
                print("❌ Không thể tiếp tục. Thoát.")
                break
            print("✅ Reconnect thành công, tiếp tục xử lý.")

    # Tính FPS
    now = time.time()
    fps = 1 / (now - prev_time)
    ms = (now - prev_time) * 1000
    prev_time = now

    # YOLO DETECT
    results = model(frame, verbose=False)
    dets = []  # list of [x1,y1,x2,y2,score]

    for r in results:
        for box in r.boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            if cls == TARGET_CLASS and conf > 0.4:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                dets.append([int(x1), int(y1), int(x2), int(y2), conf])

    # TRACKER (detections include score)
    tracks = tracker.update(dets, frame=frame)
    current_ids = set(tracks.keys())

    # Xoá những ID không còn nữa
    old_ids = set(state.keys())
    removed = old_ids - current_ids
    for rid in removed:
        state.pop(rid, None)
        last_pos.pop(rid, None)

    # Vẽ line
    cv2.line(frame, IN_p1, IN_p2, (0, 255, 255), 3)
    cv2.line(frame, OUT_p1, OUT_p2, (255, 255, 0), 3)

    # XỬ LÝ TỪNG TRACK
    for tid, (x1, y1, x2, y2) in tracks.items():
        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2
        center = (cx, cy)

        prev = last_pos.get(tid, None)
        last_line = state.get(tid, None)

        cross_in = is_cross(prev, center, IN_p1, IN_p2)
        cross_out = is_cross(prev, center, OUT_p1, OUT_p2)

        # Nếu cắt cả 2 line -> skip (tránh bug)
        if cross_in and cross_out:
            last_pos[tid] = center
            continue

        # CẮT LINE IN
        if cross_in:
            if last_line == "out":
                count_in += 1
            state[tid] = "in"

        # CẮT LINE OUT
        elif cross_out:
            if last_line == "in":
                count_out += 1
            state[tid] = "out"

        last_pos[tid] = center

        # Vẽ bbox
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cvzone.putTextRect(frame, f"ID:{tid}", (x1, y1), 1, 1)

    # Vẽ count và FPS
    cvzone.putTextRect(frame, f"IN: {count_in}", (30, 40), 2, 2)
    cvzone.putTextRect(frame, f"OUT: {count_out}", (30, 90), 2, 2)
    cvzone.putTextRect(frame, f"FPS: {fps:.1f}  ({ms:.1f} ms)", (30, 140), 1, 1)

    if out is not None:
        out.write(frame)

    show = cv2.resize(frame, None, fx=0.7, fy=0.7)
    cv2.imshow("IN-OUT Counter", show)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
out.release()
cv2.destroyAllWindows()