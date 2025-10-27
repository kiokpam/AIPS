import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import SessionLocal
from app.models.core import Camera as CameraModel
from app.schemas.core import Camera, CameraCreate
from app.services.camera_manager import camera_manager
from app.services.streaming_service import streaming_service

router = APIRouter(prefix="/cameras", tags=["cameras"])

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    ai_services: Optional[List[str]] = None

class CameraStats(BaseModel):
    camera_id: str
    store_id: str
    name: str
    running: bool
    fps: float
    frame_count: int
    ai_services: List[str]
    stats: dict

def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/", response_model=List[Camera])
def list_cameras(db: Session = Depends(get_db)) -> List[Camera]:
    """List all cameras from database"""
    rows = db.query(CameraModel).all()
    return [Camera(id=r.id, store_id=r.store_id, name=r.name, rtsp_url=r.rtsp_url) for r in rows]

@router.post("/", response_model=Camera)
def create_camera(payload: CameraCreate, db: Session = Depends(get_db)) -> Camera:
    """Create a new camera in database with advanced configuration"""
    item = CameraModel(
        id=str(uuid.uuid4()), 
        store_id=payload.store_id, 
        name=payload.name, 
        source=payload.source,
        ai_services=payload.ai_services,
        model_name=payload.model_name,
        device=payload.device,
        conf_thresh=payload.conf_thresh,
        iou_thresh=payload.iou_thresh,
        max_det=payload.max_det,
        skip_frame=payload.skip_frame
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    
    # Start camera worker with advanced configuration
    success = camera_manager.add_camera(
        camera_id=item.id,
        store_id=item.store_id,
        source=item.source,
        name=item.name,
        ai_services=item.ai_services,
        model_name=item.model_name,
        device=item.device,
        conf_thresh=item.conf_thresh,
        iou_thresh=item.iou_thresh,
        max_det=item.max_det,
        skip_frame=item.skip_frame
    )
    
    if not success:
        # If camera worker failed to start, remove from database
        db.delete(item)
        db.commit()
        raise HTTPException(status_code=400, detail="Failed to start camera stream")
    
    return Camera(
        id=item.id, 
        store_id=item.store_id, 
        name=item.name, 
        source=item.source,
        ai_services=item.ai_services,
        model_name=item.model_name,
        device=item.device,
        conf_thresh=item.conf_thresh,
        iou_thresh=item.iou_thresh,
        max_det=item.max_det,
        skip_frame=item.skip_frame,
        is_active=item.is_active
    )

@router.get("/{camera_id}", response_model=Camera)
def get_camera(camera_id: str, db: Session = Depends(get_db)) -> Camera:
    """Get a specific camera"""
    camera = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    return Camera(id=camera.id, store_id=camera.store_id, name=camera.name, rtsp_url=camera.rtsp_url)

@router.put("/{camera_id}", response_model=Camera)
def update_camera(camera_id: str, payload: CameraUpdate, db: Session = Depends(get_db)) -> Camera:
    """Update a camera"""
    camera = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Update database fields
    if payload.name is not None:
        camera.name = payload.name
    if payload.rtsp_url is not None:
        camera.rtsp_url = payload.rtsp_url
    
    db.commit()
    db.refresh(camera)
    
    # Update camera worker if needed
    if payload.rtsp_url is not None:
        # Restart camera worker with new URL
        camera_manager.remove_camera(camera_id)
        ai_services = payload.ai_services or ['people_counting', 'behavior_detection']
        success = camera_manager.add_camera(
            camera_id=camera.id,
            store_id=camera.store_id,
            rtsp_url=camera.rtsp_url,
            name=camera.name,
            ai_services=ai_services
        )
        
        if not success:
            raise HTTPException(status_code=400, detail="Failed to restart camera with new URL")
    
    if payload.ai_services is not None:
        camera_manager.update_camera_ai_services(camera_id, payload.ai_services)
    
    return Camera(id=camera.id, store_id=camera.store_id, name=camera.name, rtsp_url=camera.rtsp_url)

@router.delete("/{camera_id}")
def delete_camera(camera_id: str, db: Session = Depends(get_db)):
    """Delete a camera"""
    camera = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Stop camera worker
    camera_manager.remove_camera(camera_id)
    
    # Remove from database
    db.delete(camera)
    db.commit()
    
    return {"message": "Camera deleted successfully"}

@router.get("/{camera_id}/stats", response_model=CameraStats)
def get_camera_stats(camera_id: str):
    """Get camera statistics and status"""
    camera_worker = camera_manager.get_camera(camera_id)
    if not camera_worker:
        raise HTTPException(status_code=404, detail="Camera not found or not running")
    
    stats = camera_worker.get_stats()
    return CameraStats(**stats)

@router.get("/{camera_id}/stream")
def get_camera_stream(camera_id: str, overlay: bool = Query(True, description="Include task overlays")):
    """Get camera video stream as MJPEG"""
    try:
        # Generate MJPEG stream
        def generate():
            yield from streaming_service.generate_mjpeg_stream(camera_id, with_overlay=overlay)
        
        return StreamingResponse(
            generate(),
            media_type="multipart/x-mixed-replace; boundary=frame",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stream error: {str(e)}")

@router.get("/{camera_id}/frame")
def get_camera_frame(camera_id: str, overlay: bool = Query(True, description="Include task overlays")):
    """Get single camera frame as JPEG"""
    if overlay:
        jpeg_data = camera_manager.get_camera_jpeg_with_overlay(camera_id)
    else:
        jpeg_data = camera_manager.get_camera_jpeg(camera_id)
    
    if jpeg_data is None:
        raise HTTPException(status_code=404, detail="Camera not found or no frame available")
    
    return Response(content=jpeg_data, media_type="image/jpeg")

@router.post("/{camera_id}/start")
def start_camera(camera_id: str, db: Session = Depends(get_db)):
    """Start a camera worker"""
    camera = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Check if camera is already running
    if camera_manager.get_camera(camera_id):
        return {"message": "Camera is already running"}
    
    # Start camera worker
    success = camera_manager.add_camera(
        camera_id=camera.id,
        store_id=camera.store_id,
        rtsp_url=camera.rtsp_url,
        name=camera.name,
        ai_services=['people_counting', 'behavior_detection']
    )
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to start camera")
    
    return {"message": "Camera started successfully"}

@router.post("/{camera_id}/stop")
def stop_camera(camera_id: str):
    """Stop a camera worker"""
    success = camera_manager.remove_camera(camera_id)
    if not success:
        raise HTTPException(status_code=404, detail="Camera not found or not running")
    
    return {"message": "Camera stopped successfully"}

@router.get("/stats/summary")
def get_system_stats():
    """Get system-wide camera statistics"""
    cameras = camera_manager.list_cameras()
    
    total_cameras = len(cameras)
    running_cameras = sum(1 for c in cameras if c['running'])
    total_fps = sum(c['fps'] for c in cameras)
    total_frames = sum(c['frame_count'] for c in cameras)
    
    return {
        "total_cameras": total_cameras,
        "running_cameras": running_cameras,
        "total_fps": total_fps,
        "total_frames_processed": total_frames,
        "cameras": cameras
    }

@router.post("/{camera_id}/ai-services")
def update_ai_services(camera_id: str, ai_services: List[str]):
    """Update AI services for a camera"""
    success = camera_manager.update_camera_ai_services(camera_id, ai_services)
    if not success:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    return {"message": "AI services updated successfully", "ai_services": ai_services}

@router.get("/{camera_id}/tasks")
def get_camera_tasks(camera_id: str):
    """Get current task configuration for a camera"""
    camera_worker = camera_manager.get_camera(camera_id)
    if not camera_worker:
        raise HTTPException(status_code=404, detail="Camera not found or not running")
    
    task_config = camera_worker.get_task_config()
    return {
        "camera_id": camera_id,
        "zones": task_config["zones"],
        "lines": task_config["lines"],
        "current_count": task_config["current_count"]
    }

@router.post("/{camera_id}/tasks/clear")
def clear_camera_tasks(camera_id: str):
    """Clear all tasks for a camera"""
    camera_worker = camera_manager.get_camera(camera_id)
    if not camera_worker:
        raise HTTPException(status_code=404, detail="Camera not found or not running")
    
    camera_worker.clear_tasks()
    return {"message": "Tasks cleared successfully"}

@router.post("/{camera_id}/stream/stop")
def stop_camera_stream(camera_id: str):
    """Stop camera video stream"""
    streaming_service.stop_stream(camera_id)
    return {"message": "Stream stopped successfully"}

@router.get("/streams/status")
def get_streams_status():
    """Get status of all active streams"""
    return {
        "active_streams": streaming_service.get_stream_status(),
        "total_active": sum(streaming_service.get_stream_status().values())
    }

@router.get("/{camera_id}/config")
def get_camera_config(camera_id: str):
    """Get camera configuration"""
    camera_worker = camera_manager.get_camera(camera_id)
    if not camera_worker:
        raise HTTPException(status_code=404, detail="Camera not found or not running")
    
    return {
        "camera_id": camera_id,
        "config": camera_worker.get_config()
    }

@router.put("/{camera_id}/config")
def update_camera_config(camera_id: str, config_update: CameraUpdate):
    """Update camera configuration"""
    camera_worker = camera_manager.get_camera(camera_id)
    if not camera_worker:
        raise HTTPException(status_code=404, detail="Camera not found or not running")
    
    # Prepare configuration updates
    config_updates = {}
    if config_update.model_name is not None:
        config_updates['model_name'] = config_update.model_name
    if config_update.device is not None:
        config_updates['device'] = config_update.device
    if config_update.conf_thresh is not None:
        config_updates['conf_thresh'] = config_update.conf_thresh
    if config_update.iou_thresh is not None:
        config_updates['iou_thresh'] = config_update.iou_thresh
    if config_update.max_det is not None:
        config_updates['max_det'] = config_update.max_det
    if config_update.skip_frame is not None:
        config_updates['skip_frame'] = config_update.skip_frame
    
    # Update camera worker configuration
    success = camera_manager.update_camera_config(camera_id, **config_updates)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update camera configuration")
    
    return {
        "message": "Camera configuration updated successfully",
        "config": camera_worker.get_config()
    }