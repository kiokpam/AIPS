"""
Video Clips API
Provides endpoints to list and serve video clips saved by AI service during anomaly detection.
"""

import os
import logging
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Header
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, field_serializer
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_membership, get_current_membership_flexible, get_current_membership_optional, CurrentMembership, MembershipRole
from app.models.core import Alert as AlertModel, Camera as CameraModel, Store as StoreModel, MemberPermission

router = APIRouter(prefix="/clips", tags=["clips"])
logger = logging.getLogger(__name__)

# Clips directory - resolve relative to project root
# When running in Docker: /app/clips (mapped via docker-compose volume)
# When running natively: ./clips (relative to project root where backend is started)
# Try to be smart: if /app/clips exists use it (Docker), otherwise use ./clips (native)
if Path("/app/clips").exists():
    CLIPS_DIR = Path("/app/clips")  # Docker path
else:
    CLIPS_DIR = Path("./clips").resolve()  # Windows/Linux native path

# Ensure directory exists
CLIPS_DIR.mkdir(parents=True, exist_ok=True)
logger.info(f"Clips directory: {CLIPS_DIR}")


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

    @field_serializer('timestamp')
    def serialize_timestamp(self, value: datetime) -> str:
        """Serialize timestamp as ISO format with Z suffix to indicate UTC."""
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat().replace('+00:00', 'Z')


class VideoClipsResponse(BaseModel):
    clips: List[VideoClip]
    total_count: int


def parse_clip_filename(filename: str) -> dict:
    """
    Parse clip filename to extract metadata.
    Format: {camera_id}_{track_id}_{behavior}_{confidence}.mp4 or *_lost.mp4
    """
    try:
        name = Path(filename).stem
        if name.endswith('_lost'):
            name = name[:-5]
        parts = name.rsplit('_', 2)
        if len(parts) >= 3:
            prefix, behavior, confidence_str = parts
            try:
                if '.' in confidence_str:
                    confidence = float(confidence_str)
                else:
                    confidence = int(confidence_str) / 100.0
            except ValueError:
                confidence = None
            prefix_parts = prefix.rsplit('_', 1)
            camera_id = prefix_parts[0] if len(prefix_parts) > 1 else None
            return {"behavior": behavior.lower(), "confidence": confidence, "camera_id": camera_id}
    except Exception as e:
        logger.debug(f"Could not parse filename {filename}: {e}")
    return {"behavior": "unknown", "confidence": None, "camera_id": None}


@router.get("", response_model=VideoClipsResponse)
def list_video_clips(
    behavior: Optional[str] = Query(None, description="Filter by behavior type"),
    store_id: Optional[str] = Query(None, description="Filter by store ID"),
    limit: int = Query(50, ge=1, le=200),
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    clips: List[VideoClip] = []

    if not CLIPS_DIR.exists():
        logger.info(f"Clips directory does not exist: {CLIPS_DIR}")
        return VideoClipsResponse(clips=[], total_count=0)

    # Permissions
    accessible_store_ids: Optional[List[str]] = None
    if current.role == MembershipRole.member:
        store_permissions = db.query(MemberPermission.store_id).filter(
            MemberPermission.membership_id == current.membership.id,
            MemberPermission.store_id.isnot(None)
        ).distinct().all()
        accessible_store_ids = [perm[0] for perm in store_permissions if perm[0]]
        if not accessible_store_ids:
            return VideoClipsResponse(clips=[], total_count=0)

    alerts_query = db.query(AlertModel).filter(
        AlertModel.org_id == current.organization.id,
        AlertModel.type == "anomaly"
    )
    alerts = {a.id: a for a in alerts_query.all()}

    cameras = {c.id: c for c in db.query(CameraModel).filter(
        CameraModel.org_id == current.organization.id
    ).all()}
    stores = {s.id: s for s in db.query(StoreModel).filter(
        StoreModel.org_id == current.organization.id
    ).all()}

    clip_files = []
    for ext in ['*.mp4', '*.avi', '*.mkv', '*.webm']:
        clip_files.extend(CLIPS_DIR.glob(ext))

    clip_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)

    for clip_path in clip_files[:limit * 2]:
        try:
            stat = clip_path.stat()
            filename = clip_path.name
            parsed = parse_clip_filename(filename)

            camera_id = parsed.get("camera_id")
            store_id_clip = None
            matched_alert = None

            if camera_id and camera_id in cameras:
                store_id_clip = cameras[camera_id].store_id
            else:
                for alert in alerts.values():
                    if alert.clip_ref and filename in (alert.clip_ref or ""):
                        matched_alert = alert
                        camera_id = camera_id or alert.camera_id
                        store_id_clip = store_id_clip or alert.store_id
                        break
                    elif alert.anomaly_type and parsed["behavior"] and \
                         alert.anomaly_type.lower() == parsed["behavior"]:
                        if not camera_id or alert.camera_id == camera_id:
                            matched_alert = alert
                            camera_id = camera_id or alert.camera_id
                            store_id_clip = store_id_clip or alert.store_id
                            break

            # Reject clips that cannot be attributed to this org (no camera/alert/store match)
            if not store_id_clip and not matched_alert and (not camera_id or camera_id not in cameras):
                continue

            if behavior and parsed["behavior"] != behavior.lower():
                continue
            if store_id and store_id_clip != store_id:
                continue
            if accessible_store_ids:
                # Members must have store assignment; if we cannot resolve store_id, block
                if not store_id_clip or store_id_clip not in accessible_store_ids:
                    continue

            clip_id = hashlib.md5(filename.encode()).hexdigest()[:12]

            clip = VideoClip(
                id=clip_id,
                filename=filename,
                camera_id=camera_id,
                camera_name=cameras.get(camera_id).name if camera_id and camera_id in cameras else None,
                store_id=store_id_clip,
                store_name=stores.get(store_id_clip).name if store_id_clip and store_id_clip in stores else None,
                behavior=parsed["behavior"],
                confidence=parsed["confidence"] or (matched_alert.confidence if matched_alert else None),
                timestamp=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                size_mb=round(stat.st_size / (1024 * 1024), 2),
                duration_seconds=None,
                alert_id=matched_alert.id if matched_alert else None,
            )
            clips.append(clip)
            if len(clips) >= limit:
                break
        except Exception as e:
            logger.warning(f"Error processing clip {clip_path}: {e}")
            continue

    return VideoClipsResponse(clips=clips, total_count=len(clips))


@router.options("/{filename}")
def options_video_clip():
    """Handle CORS preflight requests for video clips."""
    return Response(
        status_code=200,
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Authorization',
            'Access-Control-Max-Age': '3600',
        }
    )

@router.get("/{filename}")
def get_video_clip(
    filename: str,
    request: Request,
    current: CurrentMembership = Depends(get_current_membership_flexible),
    db: Session = Depends(get_db),
    range: Optional[str] = Header(None),
):
    """Download or stream a video clip with range support.
    
    Supports authentication via:
    - Authorization: Bearer <token> header
    - ?token=<token> query parameter (for HTML5 video elements)
    """
    # Authentication required; restrict access by org and member store permissions
    safe_filename = Path(filename).name
    clip_path = CLIPS_DIR / safe_filename

    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    
    # Get file size early (before any processing) for faster response
    try:
        file_size = clip_path.stat().st_size
    except OSError:
        raise HTTPException(status_code=404, detail="Clip not found")

    # Resolve camera/store ownership for authorization
    parsed = parse_clip_filename(safe_filename)

    # Build org-scoped lookups
    cameras = {c.id: c for c in db.query(CameraModel).filter(
        CameraModel.org_id == current.organization.id
    ).all()}
    stores = {s.id: s for s in db.query(StoreModel).filter(
        StoreModel.org_id == current.organization.id
    ).all()}
    alerts = {a.id: a for a in db.query(AlertModel).filter(
        AlertModel.org_id == current.organization.id,
        AlertModel.type == "anomaly"
    ).all()}

    camera_id = parsed.get("camera_id")
    store_id_clip = None
    matched_alert = None

    if camera_id and camera_id in cameras:
        store_id_clip = cameras[camera_id].store_id
    else:
        for alert in alerts.values():
            if alert.clip_ref and safe_filename in (alert.clip_ref or ""):
                matched_alert = alert
                camera_id = camera_id or alert.camera_id
                store_id_clip = store_id_clip or alert.store_id
                break
            elif alert.anomaly_type and parsed["behavior"] and \
                 alert.anomaly_type.lower() == parsed["behavior"]:
                if not camera_id or alert.camera_id == camera_id:
                    matched_alert = alert
                    camera_id = camera_id or alert.camera_id
                    store_id_clip = store_id_clip or alert.store_id
                    break

    # Authorization: clip must belong to this org, and members must have store permission
    if not store_id_clip and not matched_alert and (not camera_id or camera_id not in cameras):
        raise HTTPException(status_code=404, detail="Clip not found")

    if current.role == MembershipRole.member:
        store_permissions = db.query(MemberPermission.store_id).filter(
            MemberPermission.membership_id == current.membership.id,
            MemberPermission.store_id.isnot(None)
        ).distinct().all()
        accessible_store_ids = [perm[0] for perm in store_permissions if perm[0]]
        if not accessible_store_ids or not store_id_clip or store_id_clip not in accessible_store_ids:
            raise HTTPException(status_code=404, detail="Clip not found")

    ext = clip_path.suffix.lower()
    media_types = {
        '.mp4': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
    }
    media_type = media_types.get(ext, 'video/mp4')

    # File size already retrieved above
    if range:
        range_header = range.replace('bytes=', '').split('-')
        start = int(range_header[0]) if range_header[0] else 0
        end = int(range_header[1]) if range_header[1] else file_size - 1
        if start >= file_size or end >= file_size:
            raise HTTPException(status_code=416, detail="Range not satisfiable")
        content_length = end - start + 1
        with open(clip_path, 'rb') as f:
            f.seek(start)
            chunk = f.read(content_length)
        return Response(
            content=chunk,
            status_code=206,
            headers={
                'Content-Range': f'bytes {start}-{end}/{file_size}',
                'Accept-Ranges': 'bytes',
                'Content-Length': str(content_length),
                'Content-Type': media_type,
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                'Access-Control-Allow-Headers': 'Range',
                'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
            },
            media_type=media_type,
        )

    # Use FileResponse - FastAPI handles streaming efficiently with range support
    return FileResponse(
        path=clip_path,
        media_type=media_type,
        filename=safe_filename,
        headers={
            'Accept-Ranges': 'bytes',
            'Content-Length': str(file_size),
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
        },
    )


@router.delete("/{filename}")
def delete_video_clip(
    filename: str,
    current: CurrentMembership = Depends(get_current_membership_optional),
):
    if current.role != MembershipRole.manager:
        raise HTTPException(status_code=403, detail="Only managers can delete clips")

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


