import numpy as np


# Try to use deep_sort_realtime if available; otherwise fall back to simple IoU tracker
try:
    from deep_sort_realtime.deepsort_tracker import DeepSort
    _HAS_DEEPSORT = True
except Exception:
    DeepSort = None
    _HAS_DEEPSORT = False


def iou_bbox(a, b):
    # a and b are [x1,y1,x2,y2]
    xa1, ya1, xa2, ya2 = a
    xb1, yb1, xb2, yb2 = b
    xi1 = max(xa1, xb1)
    yi1 = max(ya1, yb1)
    xi2 = min(xa2, xb2)
    yi2 = min(ya2, yb2)
    inter_w = max(0, xi2 - xi1)
    inter_h = max(0, yi2 - yi1)
    inter = inter_w * inter_h
    area_a = max(0, xa2 - xa1) * max(0, ya2 - ya1)
    area_b = max(0, xb2 - xb1) * max(0, yb2 - yb1)
    union = area_a + area_b - inter
    if union <= 0:
        return 0.0
    return inter / union


class _SimpleTrack:
    def __init__(self, tid, bbox, score, max_age=30):
        self.id = tid
        self.bbox = tuple(bbox)
        self.score = float(score)
        self.time_since_update = 0
        self.max_age = max_age

    def update(self, bbox, score):
        self.bbox = tuple(bbox)
        self.score = float(score)
        self.time_since_update = 0

    def mark_missed(self):
        self.time_since_update += 1

    def is_dead(self):
        return self.time_since_update > self.max_age


class Tracker:
    """Wrapper tracker: prefer deep_sort_realtime when available, otherwise use simple IoU tracker.

    update(detections, frame=None)
      detections: list of [x1,y1,x2,y2, score]
      returns dict id -> (x1,y1,x2,y2)

    Note: If DeepSort is used, this wrapper assumes the package exposes
    DeepSort and update_tracks(detections, frame=frame) returning track objects
    with methods: is_confirmed(), track_id, to_ltrb(). If API differs, code falls back
    to the simple IoU-based tracker.
    """

    def __init__(self, max_age=30, iou_threshold=0.3):
        self.max_age = max_age
        self.iou_threshold = iou_threshold
        self._next_id = 1
        # simple tracker state
        self.tracks = []

        # deep sort instance if available
        if _HAS_DEEPSORT:
            try:
                self.deepsort = DeepSort(max_age=self.max_age)
                self.use_deepsort = True
            except Exception:
                self.deepsort = None
                self.use_deepsort = False
        else:
            self.deepsort = None
            self.use_deepsort = False

    def _match_iou(self, detections):
        # simple greedy IoU matching (detections expected sorted by score desc)
        if len(self.tracks) == 0 or len(detections) == 0:
            return {}, set(range(len(detections)))

        iou_matrix = np.zeros((len(self.tracks), len(detections)), dtype=np.float32)
        for i, tr in enumerate(self.tracks):
            for j, det in enumerate(detections):
                iou_matrix[i, j] = iou_bbox(tr.bbox, det[:4])

        matches = {}
        unmatched = set(range(len(detections)))
        while True:
            i, j = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
            if iou_matrix[i, j] <= self.iou_threshold:
                break
            matches[j] = i
            unmatched.discard(j)
            iou_matrix[i, :] = -1
            iou_matrix[:, j] = -1

        return matches, unmatched

    def update(self, detections, frame=None):
        # Normalize detections
        dets = []
        for d in detections:
            if len(d) == 4:
                dets.append([d[0], d[1], d[2], d[3], 1.0])
            else:
                dets.append([d[0], d[1], d[2], d[3], float(d[4])])

        # Prefer DeepSort when available
        if self.use_deepsort and self.deepsort is not None:
            try:
                # deep_sort_realtime expects detections as [x1,y1,x2,y2,score, class_name]
                ds_dets = [[int(d[0]), int(d[1]), int(d[2]), int(d[3]), float(d[4]), "person"] for d in dets]
                tracks = self.deepsort.update_tracks(ds_dets, frame=frame)
                out = {}
                for tr in tracks:
                    try:
                        if not getattr(tr, "is_confirmed", lambda: True)():
                            continue
                        tid = getattr(tr, "track_id", None)
                        if tid is None:
                            continue
                        # try common bbox methods
                        if hasattr(tr, "to_ltrb"):
                            l, t, r, b = tr.to_ltrb()
                        elif hasattr(tr, "to_ltwh"):
                            l, t, w, h = tr.to_ltwh()
                            r = l + w
                            b = t + h
                        else:
                            # fallback: skip if cannot get bbox
                            continue
                        out[int(tid)] = (int(l), int(t), int(r), int(b))
                    except Exception:
                        continue
                return out
            except Exception:
                # if deep sort fails for any reason, fall back to simple tracker
                self.use_deepsort = False

        # Simple IoU tracker fallback
        # sort detections by score desc
        dets_sorted_idx = sorted(range(len(dets)), key=lambda k: dets[k][4], reverse=True)
        dets_sorted = [dets[i] for i in dets_sorted_idx]

        matches, unmatched = self._match_iou(dets_sorted)

        used_tracks = set()
        for det_idx, tr_idx in matches.items():
            det = dets_sorted[det_idx]
            self.tracks[tr_idx].update(det[:4], det[4])
            used_tracks.add(tr_idx)

        for i, tr in enumerate(self.tracks):
            if i not in used_tracks:
                tr.mark_missed()

        for j in unmatched:
            det = dets_sorted[j]
            new_tr = _SimpleTrack(self._next_id, det[:4], det[4], max_age=self.max_age)
            self._next_id += 1
            self.tracks.append(new_tr)

        # remove dead
        self.tracks = [t for t in self.tracks if not t.is_dead()]

        return {t.id: tuple(map(int, t.bbox)) for t in self.tracks}




