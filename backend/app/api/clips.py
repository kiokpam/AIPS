"""
Video Clips API
Provides endpoints to list and serve video clips saved by AI service during anomaly detection.
"""

import os
import logging
from pathlib import Path
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_membership, CurrentMembership, MembershipRole
from app.models.core import Alert as AlertModel, Camera as CameraModel, Store as StoreModel, MemberPermission

router = APIRouter(prefix="/clips", tags=["clips"])
logger = logging.getLogger(__name__)

# Clips directory - mounted from docker-compose
CLIPS_DIR = Path("/app/clips")


class VideoClip(BaseModel):
    id: str
    filename: str
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    store_id: Optional[str] = None
    store_name: Optional[str] = None
    behavior: Optional[str] = None
    confidence: Optional[float] = None
    timestamp: datetime
    size_mb: float
    duration_seconds: Optional[int] = None
    alert_id: Optional[str] = None


class VideoClipsResponse(BaseModel):
    clips: List[VideoClip]
    total_count: int


def parse_clip_filename(filename: str) -> dict:
    """
    Parse clip filename to extract metadata.
    Expected format: {timestamp}_{confidence}_{behavior}.mp4
    Example: 9h30_80_shoplifting.mp4 or 2024-12-03T09-30-00_85_violence.mp4
    """
    try:
        name = Path(filename).stem  # Remove extension
        parts = name.rsplit('_', 2)  # Split from right to get behavior last
        
        if len(parts) >= 3:
            time_part, confidence_str, behavior = parts[-3], parts[-2], parts[-1]
            confidence = int(confidence_str) / 100.0 if confidence_str.isdigit() else None
            return {
                "behavior": behavior.lower(),
                "confidence": confidence,
                "time_part": time_part
            }
        elif len(parts) == 2:
            confidence_str, behavior = parts
            confidence = int(confidence_str) / 100.0 if confidence_str.isdigit() else None
            return {
                "behavior": behavior.lower(),
                "confidence": confidence,
                "time_part": None
            }
    except Exception as e:
        logger.debug(f"Could not parse filename {filename}: {e}")
    
    return {"behavior": "unknown", "confidence": None, "time_part": None}


@router.get("", response_model=VideoClipsResponse)
def list_video_clips(
    behavior: Optional[str] = Query(None, description="Filter by behavior type"),
    store_id: Optional[str] = Query(None, description="Filter by store ID"),
    limit: int = Query(50, ge=1, le=200),
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """
    List video clips saved by AI service.
    Clips are saved when anomalies (shoplifting, violence) are detected.
    """
    clips: List[VideoClip] = []
    
    # Check if clips directory exists
    if not CLIPS_DIR.exists():
        logger.info(f"Clips directory does not exist: {CLIPS_DIR}")
        return VideoClipsResponse(clips=[], total_count=0)
    
    # Get accessible stores for members
    accessible_store_ids = None
    if current.role == MembershipRole.member:
        store_permissions = db.query(MemberPermission.store_id).filter(
            MemberPermission.membership_id == current.membership.id,
            MemberPermission.store_id.isnot(None)
        ).distinct().all()
        accessible_store_ids = [perm[0] for perm in store_permissions if perm[0]]
        if not accessible_store_ids:
            return VideoClipsResponse(clips=[], total_count=0)
    
    # Get alerts with clip references for metadata enrichment
    alerts_query = db.query(AlertModel).filter(
        AlertModel.org_id == current.organization.id,
        AlertModel.type == "anomaly"
    )
    alerts = {a.id: a for a in alerts_query.all()}
    
    # Get cameras and stores for name lookup
    cameras = {c.id: c for c in db.query(CameraModel).filter(
        CameraModel.org_id == current.organization.id
    ).all()}
    stores = {s.id: s for s in db.query(StoreModel).filter(
        StoreModel.org_id == current.organization.id
    ).all()}
    
    # List clip files
    clip_files = []
    for ext in ['*.mp4', '*.avi', '*.mkv', '*.webm']:
        clip_files.extend(CLIPS_DIR.glob(ext))
    
    # Sort by modification time (newest first)
    clip_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    
    for clip_path in clip_files[:limit * 2]:  # Get extra for filtering
        try:
            stat = clip_path.stat()
            filename = clip_path.name
            parsed = parse_clip_filename(filename)
            
            # Try to match with alert for richer metadata
            matched_alert = None
            for alert in alerts.values():
                if alert.anomaly_type and parsed["behavior"] and \
                   alert.anomaly_type.lower() == parsed["behavior"]:
                    matched_alert = alert
                    break
            
            camera_id = matched_alert.camera_id if matched_alert else None
            store_id_clip = matched_alert.store_id if matched_alert else None
            
            # Apply filters
            if behavior and parsed["behavior"] != behavior.lower():
                continue
            if store_id and store_id_clip != store_id:
                continue
            if accessible_store_ids and store_id_clip and store_id_clip not in accessible_store_ids:
                continue
            
            clip = VideoClip(
                id=filename,
                filename=filename,
                camera_id=camera_id,
                camera_name=cameras.get(camera_id).name if camera_id and camera_id in cameras else None,
                store_id=store_id_clip,
                store_name=stores.get(store_id_clip).name if store_id_clip and store_id_clip in stores else None,
                behavior=parsed["behavior"],
                confidence=parsed["confidence"] or (matched_alert.confidence if matched_alert else None),
                timestamp=datetime.fromtimestamp(stat.st_mtime),
                size_mb=round(stat.st_size / (1024 * 1024), 2),
                duration_seconds=None,  # Would need ffprobe to get duration
                alert_id=matched_alert.id if matched_alert else None,
            )
            clips.append(clip)
            
            if len(clips) >= limit:
                break
                
        except Exception as e:
            logger.warning(f"Error processing clip {clip_path}: {e}")
            continue
    
    return VideoClipsResponse(clips=clips, total_count=len(clips))


@router.get("/{filename}")
def get_video_clip(
    filename: str,
    current: CurrentMembership = Depends(get_current_membership),
):
    """
    Download or stream a video clip.
    """
    # Sanitize filename to prevent path traversal
    safe_filename = Path(filename).name
    clip_path = CLIPS_DIR / safe_filename
    
    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    
    # Determine media type
    ext = clip_path.suffix.lower()
    media_types = {
        '.mp4': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
    }
    media_type = media_types.get(ext, 'video/mp4')
    
    return FileResponse(
        path=clip_path,
        media_type=media_type,
        filename=safe_filename,
    )


@router.delete("/{filename}")
def delete_video_clip(
    filename: str,
    current: CurrentMembership = Depends(get_current_membership),
):
    """
    Delete a video clip. Only managers can delete clips.
    """
    if current.role != MembershipRole.manager:
        raise HTTPException(status_code=403, detail="Only managers can delete clips")
    
    # Sanitize filename
    safe_filename = Path(filename).name
    clip_path = CLIPS_DIR / safe_filename
    
    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    
    try:
        clip_path.unlink()
        logger.info(f"Deleted clip: {safe_filename}")
        return {"status": "success", "message": f"Clip {safe_filename} deleted"}
    except Exception as e:
        logger.error(f"Failed to delete clip {safe_filename}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete clip")

