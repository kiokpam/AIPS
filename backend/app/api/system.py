"""
System Monitoring API endpoints
Provides system health, performance, and device information
"""

import os
import sys
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.api.deps import CurrentMembership, get_current_membership, get_db, require_manager
from app.models.core import Camera as CameraModel
from app.services.system_monitor import system_monitor
from app.services.camera_manager import camera_manager

router = APIRouter(prefix="/system", tags=["system"])

@router.get("/gpu_info")
def get_gpu_info(current: CurrentMembership = Depends(require_manager)) -> Dict[str, Any]:
    """Get GPU/CPU device information (from codedash_ai)"""
    return system_monitor.get_device_info()

@router.get("/performance")
def get_system_performance(current: CurrentMembership = Depends(require_manager)) -> Dict[str, Any]:
    """Get current system performance metrics"""
    return system_monitor.get_system_performance()

@router.get("/performance/history")
def get_performance_history(
    minutes: int = Query(60, description="History in minutes"),
    current: CurrentMembership = Depends(require_manager),
) -> Dict[str, Any]:
    """Get system performance history"""
    return system_monitor.get_performance_history(minutes)

@router.get("/health")
async def get_system_health(current: CurrentMembership = Depends(require_manager)) -> Dict[str, Any]:
    """Get system health status"""
    ai_health = await system_monitor.get_ai_service_health()
    performance = system_monitor.get_system_performance()
    
    # Determine overall system health
    overall_status = "healthy"
    unhealthy_services = []
    
    for service_name, health in ai_health.items():
        if health.get('status') != 'healthy':
            overall_status = "degraded"
            unhealthy_services.append(service_name)
    
    if performance.get('cpu_usage', 0) > 0.9 or performance.get('memory_usage', 0) > 0.9:
        overall_status = "critical"
    
    return {
        "overall_status": overall_status,
        "timestamp": performance.get('timestamp'),
        "system_uptime": performance.get('system_uptime', 0),
        "ai_services": ai_health,
        "performance": {
            "cpu_usage": performance.get('cpu_usage', 0),
            "memory_usage": performance.get('memory_usage', 0),
            "gpu_usage": performance.get('gpu_usage', 0)
        },
        "unhealthy_services": unhealthy_services
    }

@router.get("/metrics")
async def get_system_metrics(
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get comprehensive system metrics"""
    try:
        # Get AI service metrics
        ai_metrics = await system_monitor.get_ai_service_metrics()
        
        # Get system performance
        performance = system_monitor.get_system_performance()
        
        # Get camera statistics
        allowed_ids = {
            row[0]
            for row in db.query(CameraModel.id).filter(CameraModel.org_id == current.organization.id).all()
        }
        cameras = [cam for cam in camera_manager.list_cameras() if cam.get('camera_id') in allowed_ids]
        total_cameras = len(allowed_ids)
        active_cameras = sum(1 for cam in cameras if cam.get('running', False))
        total_people = sum(cam.get('current_count', 0) for cam in cameras)
        total_fps = sum(cam.get('fps', 0) for cam in cameras)
        
        # Get stream status
        from app.services.streaming_service import streaming_service
        stream_status = streaming_service.get_stream_status()
        stream_active = sum(status for cid, status in stream_status.items() if cid in allowed_ids)
        
        return {
            "timestamp": performance.get('timestamp'),
            "system": {
                "uptime": performance.get('system_uptime', 0),
                "cpu_usage": performance.get('cpu_usage', 0),
                "memory_usage": performance.get('memory_usage', 0),
                "gpu_usage": performance.get('gpu_usage', 0),
                "disk_usage": performance.get('disk_usage', 0)
            },
            "cameras": {
                "total": total_cameras,
                "active": active_cameras,
                "total_people": total_people,
                "total_fps": total_fps,
                "active_streams": stream_active,
            },
            "ai_services": ai_metrics,
            "device_info": system_monitor.get_device_info()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get system metrics: {str(e)}")

@router.get("/stats/summary")
def get_system_stats_summary(
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get system-wide statistics summary (scoped to organization)"""
    allowed_ids = {
        row[0]
        for row in db.query(CameraModel.id).filter(CameraModel.org_id == current.organization.id).all()
    }
    cameras = [cam for cam in camera_manager.list_cameras() if cam.get("camera_id") in allowed_ids]
    total_people = sum(cam.get("current_count", 0) for cam in cameras)
    active_cameras = sum(1 for cam in cameras if cam.get("running", False))

    from app.services.streaming_service import streaming_service

    stream_status = streaming_service.get_stream_status()
    active_streams = sum(status for cid, status in stream_status.items() if cid in allowed_ids)

    return {
        "total_cameras": len(allowed_ids),
        "active_cameras": active_cameras,
        "total_people": total_people,
        "active_streams": active_streams,
        "system_uptime": system_monitor.get_system_performance().get("system_uptime", 0),
    }

@router.get("/alerts")
def get_system_alerts(
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get current system alerts and warnings"""
    alerts = []
    warnings = []
    
    try:
        # Get current performance
        performance = system_monitor.get_system_performance()
        
        # Check CPU usage
        cpu_usage = performance.get('cpu_usage', 0)
        if cpu_usage > 0.9:
            alerts.append({
                "type": "critical",
                "message": f"High CPU usage: {cpu_usage:.1%}",
                "timestamp": performance.get('timestamp')
            })
        elif cpu_usage > 0.7:
            warnings.append({
                "type": "warning",
                "message": f"Elevated CPU usage: {cpu_usage:.1%}",
                "timestamp": performance.get('timestamp')
            })
        
        # Check memory usage
        memory_usage = performance.get('memory_usage', 0)
        if memory_usage > 0.9:
            alerts.append({
                "type": "critical",
                "message": f"High memory usage: {memory_usage:.1%}",
                "timestamp": performance.get('timestamp')
            })
        elif memory_usage > 0.8:
            warnings.append({
                "type": "warning",
                "message": f"Elevated memory usage: {memory_usage:.1%}",
                "timestamp": performance.get('timestamp')
            })
        
        # Check GPU usage
        gpu_usage = performance.get('gpu_usage', 0)
        if gpu_usage > 0.95:
            alerts.append({
                "type": "critical",
                "message": f"High GPU usage: {gpu_usage:.1%}",
                "timestamp": performance.get('timestamp')
            })
        
        # Check camera status
        allowed_ids = {
            row[0]
            for row in db.query(CameraModel.id).filter(CameraModel.org_id == current.organization.id).all()
        }
        cameras = [cam for cam in camera_manager.list_cameras() if cam.get('camera_id') in allowed_ids]
        offline_cameras = [cam for cam in cameras if not cam.get('running', False)]
        if offline_cameras:
            warnings.append({
                "type": "warning",
                "message": f"{len(offline_cameras)} camera(s) offline",
                "timestamp": performance.get('timestamp'),
                "details": [cam['camera_id'] for cam in offline_cameras]
            })
        
        return {
            "alerts": alerts,
            "warnings": warnings,
            "total_alerts": len(alerts),
            "total_warnings": len(warnings),
            "timestamp": performance.get('timestamp')
        }
        
    except Exception as e:
        return {
            "alerts": [{
                "type": "error",
                "message": f"Failed to get system alerts: {str(e)}",
                "timestamp": performance.get('timestamp', 'unknown')
            }],
            "warnings": [],
            "total_alerts": 1,
            "total_warnings": 0
        }

@router.get("/info")
def get_system_info(current: CurrentMembership = Depends(require_manager)) -> Dict[str, Any]:
    """Get comprehensive system information"""
    performance = system_monitor.get_system_performance()
    device_info = system_monitor.get_device_info()
    
    return {
        "system": {
            "platform": os.name,
            "python_version": os.sys.version,
            "uptime": performance.get('system_uptime', 0),
            "start_time": system_monitor.start_time
        },
        "hardware": {
            "cpu_count": os.cpu_count(),
            "memory_total_gb": performance.get('memory_total_gb', 0),
            "disk_total_gb": performance.get('disk_total_gb', 0)
        },
        "gpu": device_info,
        "services": {
            "note": "AI services can be configured and monitored here"
        }
    }
