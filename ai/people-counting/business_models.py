from utils import point_in_polygon, line_side, draw_zone_polygon, draw_count_text, draw_detection_box
import cv2, numpy as np, math

def count_in_zone(frame, detections, zone_polygon):
    draw_zone_polygon(frame, zone_polygon, color=(0,255,0), thickness=3)

    count = 0
    ids_in_zone = []
    for det in detections:
        (x1,y1,x2,y2) = det['bbox']
        cx,cy = det['center']
        inside = point_in_polygon((cx,cy), zone_polygon)
        color = (0,255,0) if inside else (0,0,255)
        if inside:
            count += 1
            ids_in_zone.append((cx,cy))
        draw_detection_box(frame, (x1,y1,x2,y2), (cx,cy), color, thickness=2)

    return frame, count, ids_in_zone

class LineInOutState:
    def __init__(self, p1, p2):
        self.p1 = tuple(p1)
        self.p2 = tuple(p2)
        self.prev_positions = {}  
        self.count_in = 0
        self.count_out = 0

def distance_point_to_line(pt, p1, p2):
    x0,y0 = pt; x1,y1 = p1; x2,y2 = p2
    return abs((y2-y1)*x0 - (x2-x1)*y0 + x2*y1 - y2*x1) / math.hypot(x2-x1, y2-y1)

def count_line_inout(frame, detections, tracker, state: LineInOutState):
    from utils import draw_counting_line, draw_count_text
    
    centers = [det['center'] for det in detections]
    objects = tracker.update(centers)

    draw_counting_line(frame, state.p1, state.p2, color=(255,0,0), thickness=2)

    for oid, centroid in objects.items():
        c = (int(centroid[0]), int(centroid[1]))
        side = line_side(c, state.p1, state.p2)
        prev_side = state.prev_positions.get(oid, None)

        if prev_side is None:
            state.prev_positions[oid] = side
        else:
            if prev_side*side < 0 and distance_point_to_line(c, state.p1, state.p2) < 20:
                if side > 0:
                    state.count_in += 1
                else:
                    state.count_out += 1
            state.prev_positions[oid] = side

        cv2.circle(frame, c, 3, (0,255,255), -1)

    return frame, (state.count_in, state.count_out)
