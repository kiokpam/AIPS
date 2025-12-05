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
    
    # Try browser-compatible codecs first, then fallback to mp4v
    # Note: mp4v is NOT browser-compatible, so we'll re-encode if needed
    codecs_to_try = [
        ('avc1', 'H.264/AVC'),  # Best browser compatibility
        ('H264', 'H.264'),      # Alternative H.264 fourcc
        ('mp4v', 'MPEG-4'),     # AI developers' codec (will re-encode if used)
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
    
    # If we used mp4v (not browser-compatible), re-encode with ffmpeg to H.264
    if used_codec and 'mp4v' in used_codec.lower():
        temp_path = out_path + '.tmp'
        try:
            os.rename(out_path, temp_path)
            # Re-encode to H.264 using ffmpeg for browser compatibility
            cmd = [
                'ffmpeg', '-y', '-i', temp_path,
                '-c:v', 'libx264',  # H.264 codec
                '-preset', 'fast',   # Fast encoding
                '-crf', '23',        # Good quality
                '-pix_fmt', 'yuv420p',  # Browser-compatible pixel format
                '-movflags', '+faststart',  # Enable streaming
                out_path
            ]
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                os.remove(temp_path)
                LOGGER.debug(f"Re-encoded {out_path} to H.264 for browser compatibility")
            else:
                # Re-encoding failed, restore original
                os.rename(temp_path, out_path)
                LOGGER.warning(f"Failed to re-encode {out_path} to H.264: {result.stderr}")
        except subprocess.TimeoutExpired:
            os.rename(temp_path, out_path)
            LOGGER.warning(f"ffmpeg re-encoding timed out for {out_path}")
        except Exception as e:
            if os.path.exists(temp_path):
                os.rename(temp_path, out_path)
            LOGGER.warning(f"Error re-encoding {out_path} to H.264: {e}")

def save_metadata(meta: dict, out_path: str) -> None:
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
