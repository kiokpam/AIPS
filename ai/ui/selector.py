"""Interactive selectors for drawing lines and polygons on a frame."""
from typing import Tuple, List
import cv2
import numpy as np


def select_lines(frame) -> Tuple[Tuple[int, int], Tuple[int, int]]:
    points: List[Tuple[int, int]] = []

    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            points.append((x, y))

    win = 'Select 4 points: A1 A2 B1 B2 (press q when done)'
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(win, on_mouse)
    while True:
        disp = frame.copy()
        for p in points:
            cv2.circle(disp, p, 5, (0, 255, 0), -1)
        if len(points) >= 2:
            cv2.line(disp, points[0], points[1], (0, 0, 255), 2)
        if len(points) >= 4:
            cv2.line(disp, points[2], points[3], (255, 0, 0), 2)
        cv2.imshow(win, disp)
        k = cv2.waitKey(1) & 0xFF
        if k == ord('q') or len(points) >= 4:
            break
    cv2.destroyWindow(win)
    if len(points) < 4:
        raise RuntimeError('Need 4 points to define two lines')
    return (points[0], points[1]), (points[2], points[3])


def select_polygon(frame, n_points: int = 4) -> List[Tuple[int, int]]:
    points: List[Tuple[int, int]] = []

    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            points.append((x, y))

    win = f'Select {n_points} polygon points (press q when done)'
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(win, on_mouse)
    while True:
        disp = frame.copy()
        for p in points:
            cv2.circle(disp, p, 5, (0, 255, 0), -1)
        if len(points) >= 2:
            cv2.polylines(disp, [np.array(points)], False, (0, 0, 255), 2)
        cv2.imshow(win, disp)
        k = cv2.waitKey(1) & 0xFF
        if k == ord('q') or len(points) >= n_points:
            break
    cv2.destroyWindow(win)
    if len(points) < n_points:
        raise RuntimeError(f'Need {n_points} points to define polygon')
    print("Selected points:", points)
    return points
