import cv2
import numpy as np

def point_in_polygon(pt, poly):
    return cv2.pointPolygonTest(np.array(poly), pt, False) >= 0

def line_side(pt, line_p1, line_p2):
    x0,y0 = pt
    x1,y1 = line_p1
    x2,y2 = line_p2
    return (x2-x1)*(y0-y1) - (y2-y1)*(x0-x1)

def draw_zone_polygon(frame, zone_polygon, color=(0, 255, 0), thickness=3):
    if zone_polygon is not None and len(zone_polygon) > 2:
        poly = np.array(zone_polygon, np.int32).reshape((-1,1,2))
        cv2.polylines(frame, [poly], True, color, thickness)

def draw_counting_line(frame, p1, p2, color=(255, 0, 0), thickness=2):
    cv2.line(frame, p1, p2, color, thickness)

def draw_count_text(frame, text, position=(10, 30), color=(0, 255, 0), font_scale=1, thickness=2):
    cv2.putText(frame, text, position, cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, thickness)

def draw_detection_box(frame, bbox, center=None, color=(0, 0, 255), thickness=2, show_center=True):
    x1, y1, x2, y2 = bbox
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)
    if show_center:
        if center is None:
            center = ((x1 + x2) // 2, (y1 + y2) // 2)
        cv2.circle(frame, center, 3, color, -1)
