import cv2
import numpy as np

video_path = "input.mp4" 

points = []

def mouse_callback(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:  
        points.append((x, y))
        print(f"Point added: {(x, y)}")

cap = cv2.VideoCapture(video_path)
ret, frame = cap.read()
cap.release()

if not ret:
    print(" Cannot read video")
    exit()

cv2.namedWindow("Select Zone - Press ESC when done")
cv2.setMouseCallback("Select Zone - Press ESC when done", mouse_callback)

while True:
    temp = frame.copy()

    for p in points:
        cv2.circle(temp, p, 5, (0, 0, 255), -1)

    if len(points) > 1:
        cv2.polylines(temp, [np.array(points, np.int32)], isClosed=False, color=(0, 255, 255), thickness=2)

    cv2.imshow("Select Zone - Press ESC when done", temp)
    key = cv2.waitKey(1) & 0xFF
    if key == 27: 
        break

cv2.destroyAllWindows()
print("Final polygon coordinates:", points)
