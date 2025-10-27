import os
import time
import asyncio
import httpx
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import cv2
import numpy as np
import base64
from io import BytesIO

app = FastAPI(title="People Counting AI Service", version="0.1.0")

# Configuration
AI_CORE_URL = os.getenv("AI_CORE_URL", "http://localhost:8003")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Global state
active_cameras = {}
processing_stats = {
    "total_inferences": 0,
    "total_processing_time_ms": 0,
    "avg_processing_time_ms": 0,
    "last_update": datetime.now().isoformat()
}

class CounterUpdate(BaseModel):
    event: str = "counter_update"
    store_id: str
    camera_id: str
    zone_id: str
    value: int
    ts: str
    confidence: float = 1.0

class CameraConfig(BaseModel):
    camera_id: str
    store_id: str
    rtsp_url: str
    zones: List[Dict[str, Any]] = []  # List of zone configurations
    lines: List[Dict[str, Any]] = []  # List of line configurations
    model_name: str = "yolov8n.pt"
    device: str = "auto"
    conf_thresh: float = 0.5

class InferenceRequest(BaseModel):
    camera_id: str
    frame_data: str  # Base64 encoded image
    config: Optional[CameraConfig] = None

class InferenceResponse(BaseModel):
    camera_id: str
    store_id: str
    zones: List[Dict[str, Any]]
    lines: List[Dict[str, Any]]
    processing_time_ms: float
    timestamp: str

class AICoreClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def health(self) -> Dict[str, Any]:
        """Check AI Core service health"""
        try:
            response = await self.client.get(f"{self.base_url}/health")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"AI Core service unavailable: {str(e)}")
    
    def _encode_image(self, image: np.ndarray) -> str:
        """Encode OpenCV image to base64"""
        _, buffer = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 80])
        image_bytes = buffer.tobytes()
        return base64.b64encode(image_bytes).decode('utf-8')
    
    def _decode_image(self, image_data: str) -> np.ndarray:
        """Decode base64 image to OpenCV format"""
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    async def detect(self, image: np.ndarray, model_name: str = "yolov8n.pt", 
                    device: str = "auto", classes: List[int] = [0], 
                    conf_thresh: float = 0.5) -> tuple[List[Dict[str, Any]], float]:
        """Perform object detection"""
        payload = {
            "frame_data": self._encode_image(image),
            "model_name": model_name,
            "device": device,
            "classes": classes,
            "conf_thresh": conf_thresh
        }
        
        response = await self.client.post(f"{self.base_url}/detect", json=payload)
        response.raise_for_status()
        result = response.json()
        
        return result["detections"], result["processing_time_ms"]
    
    async def count_zone(self, image: np.ndarray, detections: List[Dict[str, Any]], 
                        zone_polygon: List[List[int]]) -> tuple[int, List[List[int]], np.ndarray]:
        """Count objects in a polygon zone"""
        payload = {
            "frame_data": self._encode_image(image),
            "detections": detections,
            "zone_polygon": zone_polygon
        }
        
        response = await self.client.post(f"{self.base_url}/count-zone", json=payload)
        response.raise_for_status()
        result = response.json()
        
        processed_image = self._decode_image(result["processed_frame_data"])
        return result["count"], result["ids_in_zone"], processed_image
    
    async def create_tracker(self, tracker_id: str, max_disappeared: int = 30, 
                           max_distance: int = 50) -> Dict[str, Any]:
        """Create a new tracker instance"""
        payload = {
            "tracker_id": tracker_id,
            "max_disappeared": max_disappeared,
            "max_distance": max_distance
        }
        
        response = await self.client.post(f"{self.base_url}/create-tracker", json=payload)
        response.raise_for_status()
        return response.json()
    
    async def count_line(self, image: np.ndarray, detections: List[Dict[str, Any]], 
                        line_p1: List[int], line_p2: List[int], 
                        tracker_id: str) -> tuple[int, int, np.ndarray]:
        """Count objects crossing a line"""
        payload = {
            "frame_data": self._encode_image(image),
            "detections": detections,
            "line_p1": line_p1,
            "line_p2": line_p2,
            "tracker_id": tracker_id
        }
        
        response = await self.client.post(f"{self.base_url}/count-line", json=payload)
        response.raise_for_status()
        result = response.json()
        
        processed_image = self._decode_image(result["processed_frame_data"])
        return result["count_in"], result["count_out"], processed_image

# Initialize AI Core client
ai_core = AICoreClient(AI_CORE_URL)

@app.get("/health")
async def health():
    """Health check endpoint"""
    try:
        # Check AI Core service health
        ai_core_health = await ai_core.health()
        return {
            "status": "ok", 
            "service": "people-counting",
            "ai_core_status": ai_core_health.get("status", "unknown")
        }
    except Exception as e:
        return {
            "status": "degraded", 
            "service": "people-counting",
            "ai_core_status": "unavailable",
            "error": str(e)
        }

@app.post("/camera/register")
async def register_camera(config: CameraConfig):
    """Register a new camera for people counting"""
    try:
        # Create tracker for this camera if it has line counting
        if config.lines:
            tracker_id = f"camera_{config.camera_id}"
            await ai_core.create_tracker(tracker_id)
        
        # Store camera configuration
        active_cameras[config.camera_id] = config
        
        return {
            "status": "ok",
            "camera_id": config.camera_id,
            "message": "Camera registered successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register camera: {str(e)}")

@app.post("/camera/{camera_id}/unregister")
async def unregister_camera(camera_id: str):
    """Unregister a camera"""
    if camera_id in active_cameras:
        del active_cameras[camera_id]
        return {"status": "ok", "message": f"Camera {camera_id} unregistered"}
    else:
        raise HTTPException(status_code=404, detail="Camera not found")

@app.post("/infer", response_model=InferenceResponse)
async def infer(request: InferenceRequest):
    """Perform people counting inference on a frame"""
    start_time = time.time()
    
    try:
        # Get camera configuration
        if request.config:
            config = request.config
        elif request.camera_id in active_cameras:
            config = active_cameras[request.camera_id]
        else:
            raise HTTPException(status_code=404, detail="Camera not registered")
        
        # Decode the input image
        image_bytes = base64.b64decode(request.frame_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image data")
        
        # Perform object detection
        detections, detection_time = await ai_core.detect(
            image, 
            model_name=config.model_name,
            device=config.device,
            classes=[0],  # person class
            conf_thresh=config.conf_thresh
        )
        
        # Process zones
        zone_results = []
        for zone in config.zones:
            zone_id = zone.get("id", "default")
            zone_polygon = zone.get("polygon", [])
            
            if zone_polygon:
                count, ids_in_zone, processed_image = await ai_core.count_zone(
                    image, detections, zone_polygon
                )
                
                zone_results.append({
                    "zone_id": zone_id,
                    "count": count,
                    "ids_in_zone": ids_in_zone,
                    "polygon": zone_polygon
                })
                
                # Send counter update event
                await send_counter_update(
                    config.store_id, 
                    config.camera_id, 
                    zone_id, 
                    count
                )
        
        # Process lines
        line_results = []
        for line in config.lines:
            line_id = line.get("id", "default")
            line_p1 = line.get("p1", [0, 0])
            line_p2 = line.get("p2", [100, 100])
            
            tracker_id = f"camera_{config.camera_id}"
            count_in, count_out, processed_image = await ai_core.count_line(
                image, detections, line_p1, line_p2, tracker_id
            )
            
            line_results.append({
                "line_id": line_id,
                "count_in": count_in,
                "count_out": count_out,
                "p1": line_p1,
                "p2": line_p2
            })
        
        # Update processing statistics
        total_time = (time.time() - start_time) * 1000
        processing_stats["total_inferences"] += 1
        processing_stats["total_processing_time_ms"] += total_time
        processing_stats["avg_processing_time_ms"] = (
            processing_stats["total_processing_time_ms"] / processing_stats["total_inferences"]
        )
        processing_stats["last_update"] = datetime.now().isoformat()
        
        return InferenceResponse(
            camera_id=config.camera_id,
            store_id=config.store_id,
            zones=zone_results,
            lines=line_results,
            processing_time_ms=total_time,
            timestamp=datetime.now().isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

async def send_counter_update(store_id: str, camera_id: str, zone_id: str, count: int):
    """Send counter update to backend API"""
    try:
        event = CounterUpdate(
            store_id=store_id,
            camera_id=camera_id,
            zone_id=zone_id,
            value=count,
            ts=datetime.now().isoformat()
        )
        
        # Send to backend API (if configured)
        if BACKEND_URL:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{BACKEND_URL}/api/events/counter-update",
                    json=event.dict(),
                    timeout=5.0
                )
    except Exception as e:
        print(f"Failed to send counter update: {e}")

@app.get("/metrics")
async def metrics():
    """Get service metrics"""
    try:
        # Get AI Core device info
        device_info = await ai_core.health()
        
        return {
            "service": "people-counting",
            "active_cameras": len(active_cameras),
            "processing_stats": processing_stats,
            "ai_core_status": device_info.get("status", "unknown"),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "service": "people-counting",
            "active_cameras": len(active_cameras),
            "processing_stats": processing_stats,
            "ai_core_status": "unavailable",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.get("/cameras")
async def list_cameras():
    """List all registered cameras"""
    return {
        "cameras": [
            {
                "camera_id": cam_id,
                "store_id": config.store_id,
                "rtsp_url": config.rtsp_url,
                "zones_count": len(config.zones),
                "lines_count": len(config.lines)
            }
            for cam_id, config in active_cameras.items()
        ]
    }

@app.get("/camera/{camera_id}")
async def get_camera_config(camera_id: str):
    """Get camera configuration"""
    if camera_id not in active_cameras:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    config = active_cameras[camera_id]
    return {
        "camera_id": config.camera_id,
        "store_id": config.store_id,
        "rtsp_url": config.rtsp_url,
        "zones": config.zones,
        "lines": config.lines,
        "model_name": config.model_name,
        "device": config.device,
        "conf_thresh": config.conf_thresh
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)