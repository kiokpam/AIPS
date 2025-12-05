"""I/O helper utilities: save frames list as mp4 and write metadata."""
from typing import List
import cv2
import json


def save_frames_as_video(frames: List, fps: float, out_path: str) -> None:
    """
    Save a list of frames as an MP4 video file.
    Matches AI developers' implementation but with browser-compatible codec fallback.
    """
    if not frames:
        return
    
    h, w = frames[0].shape[:2]
    
    # Try browser-compatible codec first (H.264), then fallback to AI developers' codec (mp4v)
    codecs_to_try = [
        ('avc1', 'H.264/AVC'),  # Best browser compatibility
        ('mp4v', 'MPEG-4'),     # AI developers' codec (fallback)
    ]
    
    writer = None
    for codec_name, _ in codecs_to_try:
        try:
            fourcc = cv2.VideoWriter_fourcc(*codec_name)
            writer = cv2.VideoWriter(out_path, fourcc, fps, (w, h))
            if writer.isOpened():
                break
            else:
                writer.release()
                writer = None
        except Exception:
            if writer:
                writer.release()
                writer = None
            continue
    
    # If H.264 failed, use AI developers' codec (mp4v) as final fallback
    if writer is None or not writer.isOpened():
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(out_path, fourcc, fps, (w, h))
    
    for f in frames:
        if f.shape[0] != h or f.shape[1] != w:
            f = cv2.resize(f, (w, h))
        # assume frames are RGB coming from model pipeline; convert to BGR for OpenCV writer
        # f = cv2.cvtColor(f, cv2.COLOR_BGR2RGB) 
        writer.write(f)
    writer.release()

def save_metadata(meta: dict, out_path: str) -> None:
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
