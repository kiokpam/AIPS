"""
AI Service Integration API
Provides endpoints and utilities for AI services to interact with cameras.

This API is designed for AI services to:
1. Pull frames from cameras
2. Get zone/line configurations for In/Out counting and behavior detection
3. Report health status

AI services should poll this API and push results to /api/events/*.
"""

import base64
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
import cv2
import numpy as np

from app.api.deps import get_db, get_current_membership_optional
from app.models.core import Camera as CameraModel, CountingZone, CountingLine
from app.services.camera_manager import camera_manager

router = APIRouter(prefix="/ai", tags=["ai-integration"])

logger = logging.getLogger(__name__)


@router.get("/cameras/{camera_id}/frame")
def get_camera_frame_for_ai(
    camera_id: str,
    format: str = Query("jpeg", description="Frame format: 'jpeg' or 'base64'"),
    db: Session = Depends(get_db),
):
    """
    Get latest frame from a camera for AI processing.
    This endpoint is designed for AI services to pull frames.
    No authentication required (AI services run in trusted network).
    """
    # Verify camera exists
    camera = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera not found"
        )
    
    # Get frame from camera manager
    frame = camera_manager.get_camera_frame(camera_id)
    if frame is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Camera not running or no frame available"
        )
    
    if format == "base64":
        # Encode frame as base64 JSON
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to encode frame"
            )
        frame_base64 = base64.b64encode(buffer.tobytes()).decode('utf-8')
        return {
            "camera_id": camera_id,
            "format": "base64",
            "data": frame_base64,
            "width": frame.shape[1],
            "height": frame.shape[0]
        }
    else:
        # Return JPEG binary
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to encode frame"
            )
        from fastapi.responses import Response
        return Response(
            content=buffer.tobytes(),
            media_type="image/jpeg",
            headers={
                "X-Camera-ID": camera_id,
                "X-Frame-Width": str(frame.shape[1]),
                "X-Frame-Height": str(frame.shape[0])
            }
        )


@router.get("/cameras/{camera_id}/config")
def get_camera_config_for_ai(
    camera_id: str,
    db: Session = Depends(get_db),
):
    """
    Get camera configuration for AI services.
    
    Returns:
    - zones: List of polygon zones for behavior detection
      Format: [{"id": "...", "name": "...", "polygon": [[x,y], [x,y], ...]}]
    
    - lines: List of line pairs for In/Out counting
      Format: [{"id": "...", "name": "...", "line_a": [[x,y], [x,y]], "line_b": [[x,y], [x,y]]}]
      
    AI In/Out Detection:
      - Crossing A→B = OUT (exiting)
      - Crossing B→A = IN (entering)
    """
    camera = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera not found"
        )
    
    # Query zones from database
    db_zones = db.query(CountingZone).filter(
        CountingZone.camera_id == camera_id,
        CountingZone.is_active == True
    ).all()
    
    # Format zones for AI (polygon as [[x,y], ...])
    zones = [
        {
            "id": zone.id,
            "name": zone.name,
            "polygon": zone.polygon,  # Already stored as [[x,y], ...]
        }
        for zone in db_zones
    ]
    
    # Query lines from database
    db_lines = db.query(CountingLine).filter(
        CountingLine.camera_id == camera_id,
        CountingLine.is_active == True
    ).all()
    
    # Format lines for AI In/Out detection
    # AI expects: line_a = ((x1,y1), (x2,y2)), line_b = ((x1,y1), (x2,y2))
    lines = []
    for line in db_lines:
        line_data = {
            "id": line.id,
            "name": line.name,
            "line_a": [line.p1, line.p2],  # Line A: [p1, p2]
        }
        # Line B is required for In/Out detection
        if line.p1_b and line.p2_b:
            line_data["line_b"] = [line.p1_b, line.p2_b]
        else:
            # If no Line B defined, AI can't do In/Out counting for this line
            # Still include it but mark as incomplete
            line_data["line_b"] = None
            line_data["incomplete"] = True
        lines.append(line_data)
    
    # Also get task config from camera worker for any runtime-added zones/lines
    camera_worker = camera_manager.get_camera(camera_id)
    runtime_config = {}
    if camera_worker:
        runtime_config = camera_worker.get_task_config()
    
    return {
        "camera_id": camera_id,
        "store_id": camera.store_id,
        "name": camera.name,
        "source": camera.source,
        "ai_services": camera.ai_services,
        "skip_frame": camera.skip_frame,
        "is_active": camera.is_active,
        # Zones from database (persisted)
        "zones": zones,
        # Lines from database (persisted) - for In/Out counting
        "lines": lines,
        # Runtime config (from camera worker, not persisted)
        "runtime_zones": runtime_config.get("zones", []),
        "runtime_lines": runtime_config.get("lines", []),
    }


@router.get("/cameras/{camera_id}/health")
def get_camera_health_for_ai(
    camera_id: str,
    db: Session = Depends(get_db),
):
    """
    Check if camera is healthy and providing frames.
    Useful for AI services to verify camera availability.
    """
    camera = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
    if not camera:
        return {
            "healthy": False,
            "reason": "Camera not found in database"
        }
    
    camera_worker = camera_manager.get_camera(camera_id)
    if not camera_worker:
        return {
            "healthy": False,
            "reason": "Camera worker not running"
        }
    
    # Try to get a frame to verify it's working
    frame = camera_manager.get_camera_frame(camera_id)
    if frame is None:
        return {
            "healthy": False,
            "reason": "Camera not producing frames"
        }
    
    stats = camera_worker.get_stats()
    return {
        "healthy": True,
        "running": stats.get("running", False),
        "fps": stats.get("fps", 0),
        "frame_count": stats.get("frame_count", 0),
        "errors": stats.get("errors", 0),
    }


@router.get("/cameras")
def list_cameras_for_ai(
    store_id: Optional[str] = Query(None, description="Filter by store ID"),
    ai_service: Optional[str] = Query(None, description="Filter by AI service name"),
    active_only: bool = Query(True, description="Only return active cameras"),
    db: Session = Depends(get_db),
):
    """
    List cameras available for AI processing.
    Can filter by store, AI service, and active status.
    """
    query = db.query(CameraModel)
    
    if store_id:
        query = query.filter(CameraModel.store_id == store_id)
    
    if ai_service:
        # Filter cameras that have this AI service enabled
        query = query.filter(CameraModel.ai_services.contains([ai_service]))
    
    if active_only:
        query = query.filter(CameraModel.is_active == True)
    
    cameras = query.all()
    
    return [
        {
            "camera_id": cam.id,
            "store_id": cam.store_id,
            "name": cam.name,
            "source": cam.source,
            "ai_services": cam.ai_services,
            "is_active": cam.is_active,
        }
        for cam in cameras
    ]

