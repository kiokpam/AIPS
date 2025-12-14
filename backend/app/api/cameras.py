"""
Camera Management API

REST API endpoints for camera management, including:
- Camera CRUD operations (create, read, update, delete)
- Camera start/stop control
- Real-time video streaming
- Camera statistics and health monitoring
- Task configuration (zones, lines)

This module provides the HTTP interface for camera management operations,
integrating with the camera_manager service for actual video processing.

Author: AIPS Development Team
License: See project LICENSE file
"""

import logging
import uuid
from typing import Any, Dict, List

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentMembership,
    get_current_membership,
    get_current_membership_optional,
    get_db,
    require_manager,
)
from app.models.core import (
    Camera as CameraModel,
    MemberPermission,
    MembershipRole,
    Store as StoreModel,
    CountingZone as CountingZoneModel,
    CountingLine as CountingLineModel,
)
from app.schemas.core import (
    Camera as CameraSchema, 
    CameraCreate, 
    CameraUpdate,
    CountingZone as CountingZoneSchema,
    CountingZoneCreate,
    CountingLine as CountingLineSchema,
    CountingLineCreate,
    TaskSetRequest,
)
from app.services.camera_manager import camera_manager
from app.services.streaming_service import streaming_service

router = APIRouter(prefix="/cameras", tags=["cameras"])

logger = logging.getLogger(__name__)

class CameraStats(BaseModel):
    camera_id: str
    store_id: str
    name: str
    running: bool
    fps: float
    frame_count: int
    ai_services: List[str]
    stats: Dict[str, Any]

@router.get("/", response_model=List[CameraSchema])
def list_cameras(
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> List[CameraSchema]:
    """List cameras for the current organization (filtered by permissions for members)"""
    # Managers can see all cameras
    if current.role == MembershipRole.manager:
        rows = (
            db.query(CameraModel)
            .filter(CameraModel.org_id == current.organization.id)
            .order_by(CameraModel.name.asc())
            .all()
        )
    else:
        # Members can only see cameras they have permission to view
        permissions = db.query(MemberPermission).filter(
            MemberPermission.membership_id == current.id,
            MemberPermission.can_view == True,
            MemberPermission.camera_id.isnot(None)  # Exclude dashboard permission
        ).all()
        
        allowed_camera_ids = [perm.camera_id for perm in permissions]
        
        if not allowed_camera_ids:
            # No camera permissions, return empty list
            rows = []
        else:
            rows = (
                db.query(CameraModel)
                .filter(
                    CameraModel.org_id == current.organization.id,
                    CameraModel.id.in_(allowed_camera_ids)
                )
                .order_by(CameraModel.name.asc())
                .all()
            )
    
    return [
        CameraSchema(
            id=row.id,
            store_id=row.store_id,
            name=row.name,
            source=row.source,
            ai_services=row.ai_services,
            # Model configuration removed - AI services will handle all model settings
            skip_frame=row.skip_frame,
            is_active=row.is_active,
            org_id=row.org_id,
        )
        for row in rows
    ]

@router.post("/", response_model=CameraSchema, status_code=status.HTTP_201_CREATED)
def create_camera(
    payload: CameraCreate,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> CameraSchema:
    """Create a new camera with advanced configuration"""
    # Validate store exists if store_id is provided
    if payload.store_id:
        store = (
            db.query(StoreModel)
            .filter(StoreModel.id == payload.store_id, StoreModel.org_id == current.organization.id)
            .first()
        )
        if not store:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    default_ai = payload.ai_services if payload.ai_services else ["people_counting", "behavior_detection"]
    item = CameraModel(
        id=str(uuid.uuid4()),
        store_id=payload.store_id,  # Can be None for unassigned cameras
        name=payload.name,
        source=payload.source,
        ai_services=default_ai,
        # Model configuration removed - AI services will handle all model settings
        model_name=None,
        device=None,
        conf_thresh=None,
        iou_thresh=None,
        max_det=None,
        skip_frame=payload.skip_frame,
        org_id=current.organization.id,
    )
    
    logger = logging.getLogger(__name__)
    
    try:
        db.add(item)
        db.flush()  # Get ID without committing yet

        # Only start camera if it has a store assigned
        # Unassigned cameras remain inactive until assigned to a store
        if item.store_id:
            success = camera_manager.add_camera(
                camera_id=item.id,
                store_id=item.store_id,
                source=item.source,
                name=item.name,
                ai_services=item.ai_services,
                # Model configuration removed - AI services will handle all model settings
                skip_frame=item.skip_frame,
            )

            if not success:
                db.rollback()
                # Check if it's a resource limit issue
                current_count = camera_manager.get_camera_count()
                max_cameras = camera_manager.get_max_cameras()
                if current_count >= max_cameras:
                    logger.warning(f"Camera creation failed: max limit reached ({max_cameras} cameras)")
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Maximum camera limit reached ({max_cameras} cameras). Please stop some cameras before adding new ones."
                    )
                logger.error(f"Camera creation failed: unable to start stream for {item.id}")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to start camera stream. Check RTSP URL accessibility and network connectivity.")

            # Camera started successfully - mark as active
            item.is_active = True
        else:
            # Unassigned camera - save as inactive
            item.is_active = False
            logger.info(f"Camera {item.id} created without store assignment (inactive)")
        
        # Commit to database
        db.commit()
        db.refresh(item)
        logger.info(f"Camera {item.id} created and started successfully")
        
        # Load zones/lines from database and sync to camera manager (if any exist)
        zones_from_db = db.query(CountingZoneModel).filter(
            CountingZoneModel.camera_id == item.id,
            CountingZoneModel.org_id == current.organization.id,
            CountingZoneModel.is_active == True
        ).all()
        
        lines_from_db = db.query(CountingLineModel).filter(
            CountingLineModel.camera_id == item.id,
            CountingLineModel.org_id == current.organization.id,
            CountingLineModel.is_active == True
        ).all()
        
        if zones_from_db or lines_from_db:
            zones_config = [
                {"id": z.id, "name": z.name, "polygon": z.polygon, "is_active": z.is_active}
                for z in zones_from_db
            ]
            lines_config = [
                {"id": l.id, "name": l.name, "p1": l.p1, "p2": l.p2, "p1_b": l.p1_b, "p2_b": l.p2_b, "is_active": l.is_active}
                for l in lines_from_db
            ]
            camera_worker = camera_manager.get_camera(item.id)
            if camera_worker:
                camera_worker.update_task_config(zones_config, lines_config)
                logger.info(f"Loaded {len(zones_config)} zones and {len(lines_config)} lines for camera {item.id}")
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create camera: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error while creating camera")

    return CameraSchema(
        id=item.id,
        store_id=item.store_id,
        name=item.name,
        source=item.source,
        ai_services=item.ai_services,
        # Model configuration removed - AI services will handle all model settings
        skip_frame=item.skip_frame,
        is_active=item.is_active,
        org_id=item.org_id,
    )

@router.get("/{camera_id}", response_model=CameraSchema)
def get_camera(
    camera_id: str,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> CameraSchema:
    """Get a specific camera"""
    camera = (
        db.query(CameraModel)
        .filter(CameraModel.id == camera_id, CameraModel.org_id == current.organization.id)
        .first()
    )
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    return CameraSchema(
        id=camera.id,
        store_id=camera.store_id,
        name=camera.name,
        source=camera.source,
        ai_services=camera.ai_services,
        # Model configuration removed - AI services will handle all model settings
        skip_frame=camera.skip_frame,
        is_active=camera.is_active,
        org_id=camera.org_id,
    )

@router.put("/{camera_id}", response_model=CameraSchema)
def update_camera(
    camera_id: str,
    payload: CameraUpdate,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> CameraSchema:
    """Update a camera"""
    camera = _get_camera_or_404(db, camera_id, current.organization.id)

    logger = logging.getLogger(__name__)
    
    try:
        # Update fields but don't commit yet
        if payload.name is not None:
            camera.name = payload.name
        if payload.source is not None:
            camera.source = payload.source
        if payload.ai_services is not None:
            camera.ai_services = payload.ai_services
            # Model configuration removed - AI services will handle all model settings
        if payload.skip_frame is not None:
            camera.skip_frame = payload.skip_frame
        if payload.is_active is not None:
            camera.is_active = payload.is_active

        # Handle store reassignment
        store_changed = False
        if payload.store_id is not None and payload.store_id != camera.store_id:
            # Validate target store exists if assigning to a store
            if payload.store_id:  # Not empty string
                target_store = (
                    db.query(StoreModel)
                    .filter(StoreModel.id == payload.store_id, StoreModel.org_id == current.organization.id)
                    .first()
                )
                if not target_store:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
            camera.store_id = payload.store_id
            store_changed = True

        # Determine if camera needs to be restarted
        needs_restart = (
            payload.source is not None or 
            payload.ai_services is not None or 
            store_changed
        )
        
        # If config changed, restart camera
        if needs_restart:
            # Stop existing camera if running
            camera_manager.remove_camera(camera_id)
            
            # Only start camera if it has a store assigned
            if camera.store_id:
                success = camera_manager.add_camera(
                    camera_id=camera.id,
                    store_id=camera.store_id,
                    source=camera.source,
                    name=camera.name,
                    ai_services=camera.ai_services,
                    # Model configuration removed - AI services will handle all model settings
                    skip_frame=camera.skip_frame,
                )
                if not success:
                    db.rollback()
                    logger.error(f"Failed to restart camera {camera_id} with new configuration")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Failed to restart camera with new configuration",
                    )
                camera.is_active = True
                logger.info(f"Camera {camera_id} restarted and assigned to store {camera.store_id}")
            else:
                # Camera unassigned from store - mark as inactive
                camera.is_active = False
                logger.info(f"Camera {camera_id} stopped (unassigned from store)")

        # Only commit if restart succeeded (or no restart needed)
        db.commit()
        db.refresh(camera)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update camera {camera_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error while updating camera")

    return CameraSchema(
        id=camera.id,
        store_id=camera.store_id,
        name=camera.name,
        source=camera.source,
        ai_services=camera.ai_services,
        # Model configuration removed - AI services will handle all model settings
        skip_frame=camera.skip_frame,
        is_active=camera.is_active,
        org_id=camera.org_id,
    )

@router.delete("/{camera_id}")
def delete_camera(
    camera_id: str,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Delete a camera with proper cleanup"""
    try:
        camera = _get_camera_or_404(db, camera_id, current.organization.id)
        
        # 1. Remove from camera manager (stops any running streams/workers)
        # This is safe to call even if camera is not running
        try:
            camera_manager.remove_camera(camera_id)
        except Exception as e:
            logger.warning(f"Failed to remove camera {camera_id} from manager (may not be running): {e}")
        
        # 2. Also unregister from streaming service
        try:
            from app.services.streaming_service import streaming_service
            streaming_service.stop_stream(camera_id)
        except Exception as e:
            logger.warning(f"Failed to stop stream for camera {camera_id}: {e}")
        
        # 3. Delete from database (CASCADE will handle related records)
        db.delete(camera)
        db.commit()
        logger.info(f"Camera {camera_id} deleted successfully")
        
        return {"message": "Camera deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete camera {camera_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete camera: {str(e)}"
        )

@router.get("/{camera_id}/stats", response_model=CameraStats)
def get_camera_stats(
    camera_id: str,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> CameraStats:
    """Get camera statistics and status"""
    _get_camera_or_404(db, camera_id, current.organization.id)
    camera_worker = camera_manager.get_camera(camera_id)
    if not camera_worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found or not running")
    return CameraStats(**camera_worker.get_stats())

@router.get("/{camera_id}/stream")
def get_camera_stream(
    request: Request,
    camera_id: str,
    overlay: bool = Query(True, description="Include task overlays"),
    current: CurrentMembership = Depends(get_current_membership_optional),
    db: Session = Depends(get_db),
):
    """Get camera video stream as MJPEG"""
    _get_camera_or_404(db, camera_id, current.organization.id)

    def generate():
        try:
            yield from streaming_service.generate_mjpeg_stream(camera_id, with_overlay=overlay)
        except GeneratorExit:
            # Client disconnected, stop the stream gracefully
            streaming_service.stop_stream(camera_id)
            raise
        except Exception as e:
            # Log error and yield a final error frame before closing
            logger = logging.getLogger(__name__)
            logger.error(f"Stream error for camera {camera_id}: {e}", exc_info=True)
            streaming_service.stop_stream(camera_id)
            # Yield error frame to complete the response
            error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(error_frame, "Stream error", (150, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            ret, jpeg = cv2.imencode('.jpg', error_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

@router.get("/{camera_id}/frame")
def get_camera_frame(
    request: Request,
    camera_id: str,
    overlay: bool = Query(True, description="Include task overlays"),
    current: CurrentMembership = Depends(get_current_membership_optional),
    db: Session = Depends(get_db),
):
    """Get single camera frame as JPEG"""
    _get_camera_or_404(db, camera_id, current.organization.id)
    jpeg_data = (
        camera_manager.get_camera_jpeg_with_overlay(camera_id)
        if overlay
        else camera_manager.get_camera_jpeg(camera_id)
    )
    if jpeg_data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found or no frame available")
    return Response(content=jpeg_data, media_type="image/jpeg")

@router.post("/{camera_id}/start")
def start_camera(
    camera_id: str,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Start a camera worker"""
    camera = _get_camera_or_404(db, camera_id, current.organization.id)
    
    # If camera is already running in manager, just update database state
    if camera_manager.get_camera(camera_id):
        camera.is_active = True
        db.commit()
        return {"message": "Camera is already running"}
    
    # Try to start the camera
    success = camera_manager.add_camera(
        camera_id=camera.id,
        store_id=camera.store_id,
        source=camera.source,
        name=camera.name,
        ai_services=camera.ai_services or ["people_counting", "behavior_detection"],
        # Model configuration removed - AI services will handle all model settings
        skip_frame=camera.skip_frame,
    )
    
    if not success:
        # Update database state even if start failed
        camera.is_active = False
        db.commit()
        # Check if it's a resource limit issue
        current_count = camera_manager.get_camera_count()
        max_cameras = camera_manager.get_max_cameras()
        if current_count >= max_cameras:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Maximum camera limit reached ({max_cameras} cameras). Please stop some cameras before starting new ones."
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to start camera. Check RTSP stream accessibility and network connectivity.")
    
    # Update database state to active
    camera.is_active = True
    db.commit()
    
    # Load zones/lines from database and sync to camera manager (if any exist)
    zones_from_db = db.query(CountingZoneModel).filter(
        CountingZoneModel.camera_id == camera_id,
        CountingZoneModel.org_id == current.organization.id,
        CountingZoneModel.is_active == True
    ).all()
    
    lines_from_db = db.query(CountingLineModel).filter(
        CountingLineModel.camera_id == camera_id,
        CountingLineModel.org_id == current.organization.id,
        CountingLineModel.is_active == True
    ).all()
    
    if zones_from_db or lines_from_db:
        zones_config = [
            {"id": z.id, "name": z.name, "polygon": z.polygon, "is_active": z.is_active}
            for z in zones_from_db
        ]
        lines_config = [
            {"id": l.id, "name": l.name, "p1": l.p1, "p2": l.p2, "p1_b": l.p1_b, "p2_b": l.p2_b, "is_active": l.is_active}
            for l in lines_from_db
        ]
        camera_worker = camera_manager.get_camera(camera_id)
        if camera_worker:
            camera_worker.update_task_config(zones_config, lines_config)
            logger.info(f"Loaded {len(zones_config)} zones and {len(lines_config)} lines for camera {camera_id}")
    
    return {"message": "Camera started successfully"}

@router.post("/{camera_id}/stop")
def stop_camera(
    camera_id: str,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Stop a camera worker"""
    camera = _get_camera_or_404(db, camera_id, current.organization.id)
    
    # Remove from camera manager (if running)
    camera_manager.remove_camera(camera_id)
    
    # Update database state
    camera.is_active = False
    db.commit()
    
    return {"message": "Camera stopped successfully"}

@router.get("/stats/summary")
def get_system_stats(
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get system-wide camera statistics"""
    allowed_ids = set(_list_org_camera_ids(db, current.organization.id))
    stats = [s for s in camera_manager.list_cameras() if s.get("camera_id") in allowed_ids]
    running = [s for s in stats if s.get("running")]
    return {
        "total_cameras": len(allowed_ids),
        "running_cameras": len(running),
        "total_fps": sum(s.get("fps", 0) for s in stats),
        "total_frames_processed": sum(s.get("frame_count", 0) for s in stats),
        "cameras": stats,
    }

@router.post("/{camera_id}/ai-services")
def update_ai_services(
    camera_id: str,
    ai_services: List[str],
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Update AI services for a camera"""
    camera = _get_camera_or_404(db, camera_id, current.organization.id)
    camera.ai_services = ai_services
    db.commit()
    camera_manager.update_camera_ai_services(camera_id, ai_services)
    return {"message": "AI services updated successfully", "ai_services": ai_services}

@router.get("/{camera_id}/tasks")
def get_camera_tasks(
    camera_id: str,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get current task configuration for a camera"""
    _get_camera_or_404(db, camera_id, current.organization.id)
    camera_worker = camera_manager.get_camera(camera_id)
    if not camera_worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found or not running")
    task_config = camera_worker.get_task_config()
    return {
        "camera_id": camera_id,
        "zones": task_config["zones"],
        "lines": task_config["lines"],
        "current_count": task_config["current_count"],
    }

@router.post("/{camera_id}/tasks")
def set_camera_tasks(
    camera_id: str,
    request: TaskSetRequest,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """
    Set zones and/or lines for a camera.
    This saves them to the database so AI services can read them.
    """
    camera = _get_camera_or_404(db, camera_id, current.organization.id)
    org_id = current.organization.id
    
    zones_created = 0
    lines_created = 0
    
    try:
        # Clear existing zones/lines for this camera if we're setting new ones
        if request.zones is not None:
            db.query(CountingZoneModel).filter(
                CountingZoneModel.camera_id == camera_id,
                CountingZoneModel.org_id == org_id
            ).delete()
        
        if request.lines is not None:
            db.query(CountingLineModel).filter(
                CountingLineModel.camera_id == camera_id,
                CountingLineModel.org_id == org_id
            ).delete()
        
        # Create new zones
        if request.zones:
            for zone_data in request.zones:
                zone = CountingZoneModel(
                    id=str(uuid.uuid4()),
                    camera_id=camera_id,
                    name=zone_data.name,
                    polygon=zone_data.polygon,
                    is_active=zone_data.is_active,
                    org_id=org_id,
                )
                db.add(zone)
                zones_created += 1
        
        # Create new lines
        if request.lines:
            for line_data in request.lines:
                line = CountingLineModel(
                    id=str(uuid.uuid4()),
                    camera_id=camera_id,
                    name=line_data.name,
                    p1=line_data.p1,
                    p2=line_data.p2,
                    # For In/Out counting, we need p1_b and p2_b
                    p1_b=line_data.p1_b,
                    p2_b=line_data.p2_b,
                    is_active=line_data.is_active,
                    org_id=org_id,
                )
                db.add(line)
                lines_created += 1
                logger.info(f"Created line {line_data.name}: A={line_data.p1}->{line_data.p2}, B={line_data.p1_b}->{line_data.p2_b}")
        
        db.commit()
        logger.info(f"Camera {camera_id}: Saved {zones_created} zones and {lines_created} lines to database")
        
        # Update camera manager with new task config (sync zones/lines to in-memory camera worker)
        # Re-query zones/lines from DB to get their IDs
        zones_from_db = db.query(CountingZoneModel).filter(
            CountingZoneModel.camera_id == camera_id,
            CountingZoneModel.org_id == org_id,
            CountingZoneModel.is_active == True
        ).all()
        
        lines_from_db = db.query(CountingLineModel).filter(
            CountingLineModel.camera_id == camera_id,
            CountingLineModel.org_id == org_id,
            CountingLineModel.is_active == True
        ).all()
        
        zones_config = [
            {
                "id": z.id,
                "name": z.name,
                "polygon": z.polygon,
                "is_active": z.is_active
            }
            for z in zones_from_db
        ]
        
        lines_config = [
            {
                "id": l.id,
                "name": l.name,
                "p1": l.p1,
                "p2": l.p2,
                "p1_b": l.p1_b,
                "p2_b": l.p2_b,
                "is_active": l.is_active
            }
            for l in lines_from_db
        ]
        
        # Update camera manager's in-memory task config
        camera_worker = camera_manager.get_camera(camera_id)
        if camera_worker:
            camera_worker.update_task_config(zones_config, lines_config)
            logger.info(f"Updated in-memory task config for camera {camera_id}")
        else:
            logger.warning(f"Camera {camera_id} not found in camera_manager, task config not updated in memory")
        
        return {
            "message": "Tasks saved successfully",
            "zones_created": zones_created,
            "lines_created": lines_created,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save tasks for camera {camera_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save tasks: {str(e)}"
        )


@router.get("/{camera_id}/tasks/db")
def get_camera_tasks_from_db(
    camera_id: str,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """
    Get zones and lines from database (persisted config).
    This is what AI services will use.
    """
    try:
        _get_camera_or_404(db, camera_id, current.organization.id)
        org_id = current.organization.id
        
        # Query zones
        zones = db.query(CountingZoneModel).filter(
            CountingZoneModel.camera_id == camera_id,
            CountingZoneModel.org_id == org_id,
            CountingZoneModel.is_active == True
        ).all()
        
        # Query lines
        lines = db.query(CountingLineModel).filter(
            CountingLineModel.camera_id == camera_id,
            CountingLineModel.org_id == org_id,
            CountingLineModel.is_active == True
        ).all()
        
        return {
            "camera_id": camera_id,
            "zones": [
                {
                    "id": z.id,
                    "name": z.name,
                    "polygon": z.polygon,
                    "is_active": z.is_active,
                }
                for z in zones
            ],
            "lines": [
                {
                    "id": l.id,
                    "name": l.name,
                    "p1": l.p1,
                    "p2": l.p2,
                    "p1_b": l.p1_b,
                    "p2_b": l.p2_b,
                    "is_active": l.is_active,
                }
                for l in lines
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Error fetching camera tasks from DB for {camera_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching camera tasks")


@router.post("/{camera_id}/tasks/clear")
def clear_camera_tasks(
    camera_id: str,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Clear all tasks for a camera (both runtime and database)"""
    _get_camera_or_404(db, camera_id, current.organization.id)
    org_id = current.organization.id
    
    # Clear from database
    db.query(CountingZoneModel).filter(
        CountingZoneModel.camera_id == camera_id,
        CountingZoneModel.org_id == org_id
    ).delete()
    db.query(CountingLineModel).filter(
        CountingLineModel.camera_id == camera_id,
        CountingLineModel.org_id == org_id
    ).delete()
    db.commit()
    
    # Clear runtime tasks if camera is running
    camera_worker = camera_manager.get_camera(camera_id)
    if camera_worker:
        camera_worker.clear_tasks()
    
    return {"message": "Tasks cleared successfully"}

@router.post("/{camera_id}/stream/stop")
def stop_camera_stream(
    camera_id: str,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Stop camera video stream"""
    _get_camera_or_404(db, camera_id, current.organization.id)
    streaming_service.stop_stream(camera_id)
    return {"message": "Stream stopped successfully"}

@router.get("/streams/status")
def get_streams_status(
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get status of active streams scoped to organization"""
    allowed_ids = set(_list_org_camera_ids(db, current.organization.id))
    status_map = streaming_service.get_stream_status()
    filtered = {cid: status for cid, status in status_map.items() if cid in allowed_ids}
    return {
        "active_streams": filtered,
        "total_active": sum(1 for active in filtered.values() if active),
    }

@router.get("/{camera_id}/config")
def get_camera_config(
    camera_id: str,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get camera configuration"""
    _get_camera_or_404(db, camera_id, current.organization.id)
    camera_worker = camera_manager.get_camera(camera_id)
    if not camera_worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found or not running")
    return {"camera_id": camera_id, "config": camera_worker.get_config()}

@router.put("/{camera_id}/config")
def update_camera_config(
    camera_id: str,
    config_update: CameraUpdate,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Update camera configuration"""
    _get_camera_or_404(db, camera_id, current.organization.id)
    camera_worker = camera_manager.get_camera(camera_id)
    if not camera_worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found or not running")

    updates: Dict[str, any] = {}
    # Model configuration removed - AI services will handle all model settings
    if config_update.skip_frame is not None:
        updates["skip_frame"] = config_update.skip_frame

    success = camera_manager.update_camera_config(camera_id, **updates)
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update camera configuration")

    return {
        "message": "Camera configuration updated successfully",
        "config": camera_worker.get_config(),
    }


def _get_camera_or_404(db: Session, camera_id: str, org_id: str) -> CameraModel:
    camera = (
        db.query(CameraModel)
        .filter(CameraModel.id == camera_id, CameraModel.org_id == org_id)
        .first()
    )
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    return camera


def _list_org_camera_ids(db: Session, org_id: str) -> List[str]:
    rows = db.query(CameraModel.id).filter(CameraModel.org_id == org_id).all()
    return [row[0] if isinstance(row, tuple) else row.id for row in rows]