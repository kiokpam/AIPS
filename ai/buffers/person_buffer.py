"""PersonBuffer: per-track circular FIFO buffer of person crops and timestamps.

Stores original-resolution crops. Thread-safe operations.
"""
from collections import deque
from typing import List, Tuple, Optional
import threading
import cv2
import numpy as np


class PersonBuffer:
    def __init__(self, track_id: int, max_frames: int = 150, pad: float = 0.1, fps: float = 25.0):
        self.track_id = int(track_id)
        self.max_frames = int(max_frames)
        self.pad = float(pad)
        self.fps = float(fps)
        self.lock = threading.Lock()
        self._buf = deque(maxlen=self.max_frames)  # each item: (frame_crop, bbox, timestamp)
        self._label = 'Unknown'
        self._prob = 0.0

    def append(self, frame: np.ndarray, bbox: Tuple[int, int, int, int], timestamp: float) -> None:
        x1, y1, x2, y2 = bbox
        h, w = frame.shape[:2]
        x1 = max(0, min(x1, w - 1))
        x2 = max(0, min(x2, w - 1))
        y1 = max(0, min(y1, h - 1))
        y2 = max(0, min(y2, h - 1))
        if x2 <= x1 or y2 <= y1:
            return
        crop = frame[y1:y2, x1:x2].copy()
        with self.lock:
            self._buf.append((crop, (x1, y1, x2, y2), float(timestamp)))

    def extend_capacity(self, extra_frames: int) -> None:
        with self.lock:
            new_max = max(len(self._buf) + extra_frames, self.max_frames + extra_frames)
            # recreate deque with larger maxlen while preserving contents
            items = list(self._buf)
            self._buf = deque(items, maxlen=new_max)
            self.max_frames = new_max

    def set_capacity(self, new_max_frames: int) -> None:
        """Set buffer capacity to a specific size, preserving existing frames."""
        with self.lock:
            new_max = max(new_max_frames, len(self._buf))  # Don't shrink below current size
            items = list(self._buf)
            self._buf = deque(items, maxlen=new_max)
            self.max_frames = new_max

    def pop_oldest(self, n: int) -> None:
        with self.lock:
            for _ in range(n):
                if not self._buf:
                    break
                self._buf.popleft()

    def get_clip_frames(self) -> List[np.ndarray]:
        with self.lock:
            return [it[0] for it in list(self._buf)]

    def to_video(self, out_path: str) -> None:
        frames = self.get_clip_frames()
        if not frames:
            return
        h, w = frames[0].shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(out_path, fourcc, self.fps, (w, h))
        for f in frames:
            if f.shape[0] != h or f.shape[1] != w:
                f = cv2.resize(f, (w, h))
            writer.write(cv2.cvtColor(f, cv2.COLOR_RGB2BGR) if f.shape[2] == 3 else f)
        writer.release()

    def get_latest_crop(self) -> Optional[np.ndarray]:
        with self.lock:
            if not self._buf:
                return None
            return self._buf[-1][0]

    def set_label(self, label: str, prob: float) -> None:
        with self.lock:
            self._label = label
            self._prob = float(prob)

    def get_label_display(self) -> str:
        with self.lock:
            return f"{self._label} ({self._prob:.2f})"
