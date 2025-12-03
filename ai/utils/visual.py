"""Drawing helpers for visualization."""
from typing import Tuple
import cv2


def color_for_inside(inside: bool, suspicious: bool = False):
    # priority: suspicious -> inside -> outside
    if suspicious:
        return (0, 165, 255)  # orange-ish for suspicious
    return (57, 255, 20) if inside else (255, 7, 58)


def draw_overlay(frame, bbox: Tuple[int, int, int, int], track_id: int, label: str, color: Tuple[int, int, int]):
    x1, y1, x2, y2 = bbox
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    # Show only label and score (no track ID)
    cv2.putText(frame, label, (x1, max(0, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

