import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.core import Camera, CountingZone as CountingZoneModel, CountingLine as CountingLineModel
from app.schemas.core import (
    CountingZone, CountingZoneCreate, CountingZoneUpdate,
    CountingLine, CountingLineCreate, CountingLineUpdate,
    TaskConfig, TaskSetRequest
)
from app.services.camera_manager import camera_manager

router = APIRouter(prefix="/tasks", tags=["tasks"])

def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Zone Management Endpoints
@router.get("/zones", response_model=List[CountingZone])
def list_zones(db: Session = Depends(get_db)) -> List[CountingZone]:
    """List all counting zones"""
    zones = db.query(CountingZoneModel).all()
    return [
        CountingZone(
            id=zone.id,
            camera_id=zone.camera_id,
            name=zone.name,
            polygon=zone.polygon,
            is_active=zone.is_active
        )
        for zone in zones
    ]

@router.get("/zones/camera/{camera_id}", response_model=List[CountingZone])
def list_camera_zones(camera_id: str, db: Session = Depends(get_db)) -> List[CountingZone]:
    """List zones for a specific camera"""
    zones = db.query(CountingZoneModel).filter(CountingZoneModel.camera_id == camera_id).all()
    return [
        CountingZone(
            id=zone.id,
            camera_id=zone.camera_id,
            name=zone.name,
            polygon=zone.polygon,
            is_active=zone.is_active
        )
        for zone in zones
    ]

@router.post("/zones", response_model=CountingZone)
def create_zone(zone_data: CountingZoneCreate, db: Session = Depends(get_db)) -> CountingZone:
    """Create a new counting zone"""
    # Verify camera exists
    camera = db.query(Camera).filter(Camera.id == zone_data.camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Validate polygon (must have at least 3 points)
    if len(zone_data.polygon) < 3:
        raise HTTPException(status_code=400, detail="Polygon must have at least 3 points")
    
    zone = CountingZoneModel(
        id=str(uuid.uuid4()),
        camera_id=zone_data.camera_id,
        name=zone_data.name,
        polygon=zone_data.polygon,
        is_active=zone_data.is_active
    )
    
    db.add(zone)
    db.commit()
    db.refresh(zone)
    
    # Update camera worker with new zone configuration
    _update_camera_tasks(zone_data.camera_id, db)
    
    return CountingZone(
        id=zone.id,
        camera_id=zone.camera_id,
        name=zone.name,
        polygon=zone.polygon,
        is_active=zone.is_active
    )

@router.put("/zones/{zone_id}", response_model=CountingZone)
def update_zone(zone_id: str, zone_data: CountingZoneUpdate, db: Session = Depends(get_db)) -> CountingZone:
    """Update a counting zone"""
    zone = db.query(CountingZoneModel).filter(CountingZoneModel.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    if zone_data.name is not None:
        zone.name = zone_data.name
    if zone_data.polygon is not None:
        if len(zone_data.polygon) < 3:
            raise HTTPException(status_code=400, detail="Polygon must have at least 3 points")
        zone.polygon = zone_data.polygon
    if zone_data.is_active is not None:
        zone.is_active = zone_data.is_active
    
    db.commit()
    db.refresh(zone)
    
    # Update camera worker with new zone configuration
    _update_camera_tasks(zone.camera_id, db)
    
    return CountingZone(
        id=zone.id,
        camera_id=zone.camera_id,
        name=zone.name,
        polygon=zone.polygon,
        is_active=zone.is_active
    )

@router.delete("/zones/{zone_id}")
def delete_zone(zone_id: str, db: Session = Depends(get_db)):
    """Delete a counting zone"""
    zone = db.query(CountingZoneModel).filter(CountingZoneModel.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    camera_id = zone.camera_id
    db.delete(zone)
    db.commit()
    
    # Update camera worker with new zone configuration
    _update_camera_tasks(camera_id, db)
    
    return {"message": "Zone deleted successfully"}

# Line Management Endpoints
@router.get("/lines", response_model=List[CountingLine])
def list_lines(db: Session = Depends(get_db)) -> List[CountingLine]:
    """List all counting lines"""
    lines = db.query(CountingLineModel).all()
    return [
        CountingLine(
            id=line.id,
            camera_id=line.camera_id,
            name=line.name,
            p1=line.p1,
            p2=line.p2,
            is_active=line.is_active
        )
        for line in lines
    ]

@router.get("/lines/camera/{camera_id}", response_model=List[CountingLine])
def list_camera_lines(camera_id: str, db: Session = Depends(get_db)) -> List[CountingLine]:
    """List lines for a specific camera"""
    lines = db.query(CountingLineModel).filter(CountingLineModel.camera_id == camera_id).all()
    return [
        CountingLine(
            id=line.id,
            camera_id=line.camera_id,
            name=line.name,
            p1=line.p1,
            p2=line.p2,
            is_active=line.is_active
        )
        for line in lines
    ]

@router.post("/lines", response_model=CountingLine)
def create_line(line_data: CountingLineCreate, db: Session = Depends(get_db)) -> CountingLine:
    """Create a new counting line"""
    # Verify camera exists
    camera = db.query(Camera).filter(Camera.id == line_data.camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Validate line points
    if len(line_data.p1) != 2 or len(line_data.p2) != 2:
        raise HTTPException(status_code=400, detail="Line points must have exactly 2 coordinates [x, y]")
    
    line = CountingLineModel(
        id=str(uuid.uuid4()),
        camera_id=line_data.camera_id,
        name=line_data.name,
        p1=line_data.p1,
        p2=line_data.p2,
        is_active=line_data.is_active
    )
    
    db.add(line)
    db.commit()
    db.refresh(line)
    
    # Update camera worker with new line configuration
    _update_camera_tasks(line_data.camera_id, db)
    
    return CountingLine(
        id=line.id,
        camera_id=line.camera_id,
        name=line.name,
        p1=line.p1,
        p2=line.p2,
        is_active=line.is_active
    )

@router.put("/lines/{line_id}", response_model=CountingLine)
def update_line(line_id: str, line_data: CountingLineUpdate, db: Session = Depends(get_db)) -> CountingLine:
    """Update a counting line"""
    line = db.query(CountingLineModel).filter(CountingLineModel.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    if line_data.name is not None:
        line.name = line_data.name
    if line_data.p1 is not None:
        if len(line_data.p1) != 2:
            raise HTTPException(status_code=400, detail="Line point must have exactly 2 coordinates [x, y]")
        line.p1 = line_data.p1
    if line_data.p2 is not None:
        if len(line_data.p2) != 2:
            raise HTTPException(status_code=400, detail="Line point must have exactly 2 coordinates [x, y]")
        line.p2 = line_data.p2
    if line_data.is_active is not None:
        line.is_active = line_data.is_active
    
    db.commit()
    db.refresh(line)
    
    # Update camera worker with new line configuration
    _update_camera_tasks(line.camera_id, db)
    
    return CountingLine(
        id=line.id,
        camera_id=line.camera_id,
        name=line.name,
        p1=line.p1,
        p2=line.p2,
        is_active=line.is_active
    )

@router.delete("/lines/{line_id}")
def delete_line(line_id: str, db: Session = Depends(get_db)):
    """Delete a counting line"""
    line = db.query(CountingLineModel).filter(CountingLineModel.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    camera_id = line.camera_id
    db.delete(line)
    db.commit()
    
    # Update camera worker with new line configuration
    _update_camera_tasks(camera_id, db)
    
    return {"message": "Line deleted successfully"}

# Task Management Endpoints
@router.get("/camera/{camera_id}/config", response_model=TaskConfig)
def get_camera_task_config(camera_id: str, db: Session = Depends(get_db)) -> TaskConfig:
    """Get task configuration for a camera"""
    # Verify camera exists
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Get active zones
    zones = db.query(CountingZoneModel).filter(
        CountingZoneModel.camera_id == camera_id,
        CountingZoneModel.is_active == True
    ).all()
    
    # Get active lines
    lines = db.query(CountingLineModel).filter(
        CountingLineModel.camera_id == camera_id,
        CountingLineModel.is_active == True
    ).all()
    
    return TaskConfig(
        zones=[
            CountingZone(
                id=zone.id,
                camera_id=zone.camera_id,
                name=zone.name,
                polygon=zone.polygon,
                is_active=zone.is_active
            )
            for zone in zones
        ],
        lines=[
            CountingLine(
                id=line.id,
                camera_id=line.camera_id,
                name=line.name,
                p1=line.p1,
                p2=line.p2,
                is_active=line.is_active
            )
            for line in lines
        ]
    )

@router.post("/camera/{camera_id}/set")
def set_camera_tasks(camera_id: str, task_request: TaskSetRequest, db: Session = Depends(get_db)):
    """Set tasks for a camera (zones and/or lines)"""
    # Verify camera exists
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Clear existing tasks if requested
    if task_request.task_type in ["zone", "both"]:
        # Deactivate existing zones
        db.query(CountingZoneModel).filter(CountingZoneModel.camera_id == camera_id).update({"is_active": False})
    
    if task_request.task_type in ["line", "both"]:
        # Deactivate existing lines
        db.query(CountingLineModel).filter(CountingLineModel.camera_id == camera_id).update({"is_active": False})
    
    # Create new zones
    if task_request.zones:
        for zone_data in task_request.zones:
            zone_data.camera_id = camera_id  # Ensure correct camera_id
            zone = CountingZoneModel(
                id=str(uuid.uuid4()),
                camera_id=zone_data.camera_id,
                name=zone_data.name,
                polygon=zone_data.polygon,
                is_active=zone_data.is_active
            )
            db.add(zone)
    
    # Create new lines
    if task_request.lines:
        for line_data in task_request.lines:
            line_data.camera_id = camera_id  # Ensure correct camera_id
            line = CountingLineModel(
                id=str(uuid.uuid4()),
                camera_id=line_data.camera_id,
                name=line_data.name,
                p1=line_data.p1,
                p2=line_data.p2,
                is_active=line_data.is_active
            )
            db.add(line)
    
    db.commit()
    
    # Update camera worker with new task configuration
    _update_camera_tasks(camera_id, db)
    
    return {"message": "Tasks set successfully"}

@router.post("/camera/{camera_id}/clear")
def clear_camera_tasks(camera_id: str, db: Session = Depends(get_db)):
    """Clear all tasks for a camera"""
    # Verify camera exists
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Deactivate all zones and lines
    db.query(CountingZoneModel).filter(CountingZoneModel.camera_id == camera_id).update({"is_active": False})
    db.query(CountingLineModel).filter(CountingLineModel.camera_id == camera_id).update({"is_active": False})
    
    db.commit()
    
    # Update camera worker to clear tasks
    _update_camera_tasks(camera_id, db)
    
    return {"message": "Tasks cleared successfully"}

def _update_camera_tasks(camera_id: str, db: Session):
    """Update camera worker with current task configuration"""
    try:
        # Get active zones
        zones = db.query(CountingZoneModel).filter(
            CountingZoneModel.camera_id == camera_id,
            CountingZoneModel.is_active == True
        ).all()
        
        # Get active lines
        lines = db.query(CountingLineModel).filter(
            CountingLineModel.camera_id == camera_id,
            CountingLineModel.is_active == True
        ).all()
        
        # Convert to format expected by AI services
        zone_configs = []
        for zone in zones:
            zone_configs.append({
                "id": zone.id,
                "name": zone.name,
                "polygon": zone.polygon
            })
        
        line_configs = []
        for line in lines:
            line_configs.append({
                "id": line.id,
                "name": line.name,
                "p1": line.p1,
                "p2": line.p2
            })
        
        # Update camera worker task configuration
        camera_worker = camera_manager.get_camera(camera_id)
        if camera_worker:
            camera_worker.update_task_config(zone_configs, line_configs)
            
    except Exception as e:
        print(f"Failed to update camera tasks for {camera_id}: {e}")
