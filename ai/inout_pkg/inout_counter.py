

from typing import Tuple, Dict, List, Iterable, Optional

Point = Tuple[float, float]
BBox = Tuple[float, float, float, float]


def _center_from_bbox(bbox: BBox) -> Point:
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def _on_segment(a: Point, b: Point, c: Point) -> bool:
    # check if point c lies on segment ab
    (x1, y1), (x2, y2), (x3, y3) = (a, b, c)
    return (
        min(x1, x2) <= x3 <= max(x1, x2)
        and min(y1, y2) <= y3 <= max(y1, y2)
    )


def _orientation(a: Point, b: Point, c: Point) -> int:
    # returns 0-collinear, 1-clockwise, 2-counterclockwise
    (x1, y1), (x2, y2), (x3, y3) = (a, b, c)
    val = (y2 - y1) * (x3 - x2) - (x2 - x1) * (y3 - y2)
    if abs(val) < 1e-9:
        return 0
    return 1 if val > 0 else 2


def segments_intersect(p1: Point, p2: Point, p3: Point, p4: Point) -> bool:
    # robust segment intersection check using orientations
    o1 = _orientation(p1, p2, p3)
    o2 = _orientation(p1, p2, p4)
    o3 = _orientation(p3, p4, p1)
    o4 = _orientation(p3, p4, p2)

    if o1 != o2 and o3 != o4:
        return True

    # special cases
    if o1 == 0 and _on_segment(p1, p2, p3):
        return True
    if o2 == 0 and _on_segment(p1, p2, p4):
        return True
    if o3 == 0 and _on_segment(p3, p4, p1):
        return True
    if o4 == 0 and _on_segment(p3, p4, p2):
        return True
    return False


class InOutCounter:
    """Maintain per-ID state and count IN/OUT transitions between two lines.

    Contract:
    - Inputs: per-frame tracker list of (track_id, bbox) where bbox is (x1,y1,x2,y2)
    - Outputs: counters `count_in`, `count_out` and access to `state` for inspection
    - Error modes: invalid tracks are ignored; lost IDs provided separately
    """

    def __init__(self, line_a: Tuple[Point, Point], line_b: Tuple[Point, Point]):
        # store lines with labels
        self.lines = {"A": tuple(line_a), "B": tuple(line_b)}
        self.state: Dict[int, Dict[str, object]] = {}
        self.count_in = 0
        self.count_out = 0

    def _ensure_state(self, track_id: int) -> None:
        if track_id not in self.state:
            self.state[track_id] = {"order": [], "last_center": None}

    def _register_touch(self, track_id: int, line_label: str) -> None:
        self._ensure_state(track_id)
        order: List[str] = self.state[track_id]["order"]
        if not order or order[-1] != line_label:
            order.append(line_label)
            # keep only the sequence of distinct consecutive touches
            self.state[track_id]["order"] = order
            # after appending, evaluate for a valid in/out
            if len(order) >= 2:
                pair = order[-2:]
                if pair == ["A", "B"]:
                    self.count_out += 1
                    # reset order to avoid double counting while inside frame
                    self.state[track_id]["order"] = []
                elif pair == ["B", "A"]:
                    self.count_in += 1
                    self.state[track_id]["order"] = []

    def _check_touch_by_motion(self, track_id: int, prev_center: Point, curr_center: Point) -> None:
        # check if segment prev->curr intersects either configured line
        for label, (p1, p2) in self.lines.items():
            if segments_intersect(prev_center, curr_center, p1, p2):
                self._register_touch(track_id, label)

    def _check_touch_by_proximity(self, track_id: int, curr_center: Point, thresh: float = 2.0) -> None:
        # fallback: if the current center lies on the line (within a small threshold),
        # register a touch. This helps when there is no prev center recorded.
        for label, (p1, p2) in self.lines.items():
            # distance from point to line segment
            if _point_segment_distance(curr_center, p1, p2) <= thresh:
                self._register_touch(track_id, label)

    def process_tracks(self, tracks: Iterable[object], lost_ids: Optional[Iterable[int]] = None) -> None:
        """Process current frame tracks and update counts.

        tracks: iterable of either (track_id, bbox) or dict with keys 'track_id' and 'bbox'
        lost_ids: iterable of ints to remove from state
        """
        # handle lost IDs first: remove their states
        if lost_ids:
            for lid in lost_ids:
                if lid in self.state:
                    del self.state[lid]

        for t in tracks:
            # normalize input
            if isinstance(t, dict):
                track_id = int(t.get("track_id"))
                bbox = tuple(t.get("bbox"))
            else:
                # expect a tuple/list (id, bbox)
                track_id, bbox = t
                track_id = int(track_id)

            curr_center = _center_from_bbox(bbox)
            self._ensure_state(track_id)
            prev_center = self.state[track_id].get("last_center")

            if prev_center is not None:
                # check motion intersection
                self._check_touch_by_motion(track_id, prev_center, curr_center)
            else:
                # no prev center: check proximity
                self._check_touch_by_proximity(track_id, curr_center)

            # always update last_center for next frame
            self.state[track_id]["last_center"] = curr_center

    def remove_id(self, track_id: int) -> None:
        # explicit removal when tracker reports an ID gone
        if track_id in self.state:
            del self.state[track_id]

    def get_counts(self) -> Tuple[int, int]:
        return self.count_in, self.count_out


def _point_segment_distance(p: Point, a: Point, b: Point) -> float:
    # compute perpendicular distance from p to segment ab
    import math

    (x, y), (x1, y1), (x2, y2) = (p, a, b)
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    # project point onto line, clamp t between 0 and 1
    t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(x - proj_x, y - proj_y)


