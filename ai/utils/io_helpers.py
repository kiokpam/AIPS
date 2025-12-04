"""I/O helper utilities: save frames list as mp4 and write metadata."""
from typing import List
import cv2
import json


def save_frames_as_video(frames: List, fps: float, out_path: str) -> None:
    if not frames:
        return
    h, w = frames[0].shape[:2]
    # Use H.264-compatible codec for better HTML5 video support.
    # Many browsers cannot play MP4 files encoded with 'mp4v', but they
    # do support H.264/AVC ('avc1') when available in the underlying ffmpeg build.
    # Fallback to 'mp4v' if H.264 is not available would require a runtime check,
    # but in our Docker image we install ffmpeg codecs so 'avc1' should work.
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
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
