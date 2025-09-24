import cv2
import numpy as np
from ultralytics import YOLO
import torch

video_path = "data/input.mp4" 
model_path = "yolov8n.pt"    
resize_width = 640               
resize_height = 360             
skip_frames = 0                

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

model = YOLO(model_path)
try:
    model.fuse()      
    model.to(device)
except Exception as e:
    print("CUDA not available, using CPU")
    model.to("cpu")

cap = cv2.VideoCapture(0)
cv2.namedWindow("YOLO Counter", cv2.WINDOW_NORMAL)
cv2.resizeWindow("YOLO Counter", 960, 540)

zone = np.array([(70, 15), (471, 11), (463, 416), (29, 403)])

frame_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        print("End of video or cannot read file/stream.")
        break

    frame_count += 1
    if frame_count % (skip_frames + 1) != 0:
        # Draw zone
        cv2.polylines(frame, [zone], isClosed=True, color=(0, 255, 255), thickness=2)
        cv2.imshow("YOLO Counter", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == 27:
            print("Paused. Press any key to exit...")
            cv2.waitKey(0)
            break
        continue

    small_frame = cv2.resize(frame, (resize_width, resize_height))
    results = model(small_frame, stream=True, half=True if device=="cuda" else False, classes=[0])

    count = 0
    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            x1 = int(x1 * frame.shape[1] / resize_width)
            x2 = int(x2 * frame.shape[1] / resize_width)
            y1 = int(y1 * frame.shape[0] / resize_height)
            y2 = int(y2 * frame.shape[0] / resize_height)

            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

            inside = cv2.pointPolygonTest(zone, (cx, cy), False)
            if inside >= 0:  
                count += 1
                cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 0), 2)
                cv2.putText(frame, "person", (x1, y1 - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)
                cv2.circle(frame, (cx, cy), 5, (0, 255, 0), -1)

    cv2.polylines(frame, [zone], isClosed=True, color=(0, 255, 255), thickness=2)

    cv2.putText(frame, f"People in zone: {count}", (30, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)

    cv2.imshow("YOLO Counter", frame)
    key = cv2.waitKey(1) & 0xFF

    if key == 27:  
        print("Paused. Press any key to exit...")
        cv2.waitKey(0)
        break

cap.release()
cv2.destroyAllWindows()