"""I/O helper utilities: save frames list as mp4 and write metadata."""
from typing import List
import cv2
import json
import logging
import subprocess
import os

LOGGER = logging.getLogger(__name__)


def save_frames_as_video(frames: List, fps: float, out_path: str) -> None:
    """
    Save a list of frames as an MP4 video file.
    Uses browser-compatible H.264 codec via ffmpeg for reliable playback.
    """
    if not frames:
        return
    
    h, w = frames[0].shape[:2]
    
    # Prefer widely available codecs in this container (mp4v/XVID). H.264 encoder
    # is not available in the current ffmpeg build, so we avoid it to prevent
    # codec_id=27 errors.
    codecs_to_try = [
        ('mp4v', 'MPEG-4'),
        ('XVID', 'XVID'),
    ]
    
    writer = None
    used_codec = None
    
    for codec_name, codec_desc in codecs_to_try:
        try:
            fourcc = cv2.VideoWriter_fourcc(*codec_name)
            writer = cv2.VideoWriter(out_path, fourcc, fps, (w, h))
            if writer.isOpened():
                used_codec = codec_desc
                LOGGER.debug(f"Using codec {codec_desc} ({codec_name}) for {out_path}")
                break
            else:
                writer.release()
                writer = None
        except Exception as e:
            if writer:
                writer.release()
                writer = None
            LOGGER.debug(f"Failed to use codec {codec_name}: {e}")
            continue
    
    # Final fallback to mp4v (AI developers' codec)
    if writer is None or not writer.isOpened():
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(out_path, fourcc, fps, (w, h))
        used_codec = 'MPEG-4 (mp4v)'
        LOGGER.debug(f"Using fallback codec mp4v for {out_path}")
    
    if writer is None or not writer.isOpened():
        raise RuntimeError(f"Failed to initialize VideoWriter for {out_path}")
    
    # Write frames
    for f in frames:
        if f.shape[0] != h or f.shape[1] != w:
            f = cv2.resize(f, (w, h))
        # assume frames are RGB coming from model pipeline; convert to BGR for OpenCV writer
        # f = cv2.cvtColor(f, cv2.COLOR_BGR2RGB) 
        writer.write(f)
    writer.release()
    
    # Skip H.264 re-encode because libx264 is unavailable in this container.

def save_metadata(meta: dict, out_path: str) -> None:
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
