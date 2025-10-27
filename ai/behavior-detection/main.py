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

app = FastAPI(title="Behavior Detection AI Service", version="0.1.0")

# Configuration
AI_CORE_URL = os.getenv("AI_CORE_URL", "http://localhost:8003")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Global state
active_cameras = {}
processing_stats = {
    "total_inferences": 0,
    "total_processing_time_ms": 0,
    "avg_processing_time_ms": 0,
    "anomalies_detected": 0,
    "last_update": datetime.now().isoformat()
}

# Behavior detection thresholds
BEHAVIOR_THRESHOLDS = {
    "loitering": {"min_duration": 30, "confidence": 0.7},  # 30 seconds
    "crowd_gathering": {"min_people": 5, "confidence": 0.8},
    "fighting": {"confidence": 0.9},
    "theft": {"confidence": 0.85},
    "falling": {"confidence": 0.8}
}

class AnomalyDetected(BaseModel):
    event: str = "anomaly_detected"
    store_id: str
    camera_id: str
    type: str
    severity: float
    confidence: float
    bbox: Optional[List[int]] = None  # [x1, y1, x2, y2]
    clip_ref: Optional[str] = None
    ts: str

class BehaviorConfig(BaseModel):
    camera_id: str
    store_id: str
    rtsp_url: str
    enabled_behaviors: List[str] = ["loitering", "crowd_gathering", "fighting", "theft", "falling"]
    model_name: str = "yolov8n.pt"
    device: str = "auto"
    conf_thresh: float = 0.5
    detection_interval: int = 1  # Process every N frames

class InferenceRequest(BaseModel):
    camera_id: str
    frame_data: str  # Base64 encoded image
    config: Optional[BehaviorConfig] = None

class InferenceResponse(BaseModel):
    camera_id: str
    store_id: str
    anomalies: List[Dict[str, Any]]
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

# Initialize AI Core client
ai_core = AICoreClient(AI_CORE_URL)

# Behavior detection algorithms
class BehaviorAnalyzer:
    def __init__(self):
        self.tracking_history = {}  # camera_id -> {object_id: [positions]}
        self.loitering_timers = {}  # camera_id -> {object_id: start_time}
        self.crowd_history = {}     # camera_id -> [people_counts]
    
    def analyze_loitering(self, camera_id: str, detections: List[Dict[str, Any]], 
                         frame_time: float) -> List[Dict[str, Any]]:
        """Detect loitering behavior"""
        anomalies = []
        
        if camera_id not in self.loitering_timers:
            self.loitering_timers[camera_id] = {}
        
        current_objects = set()
        for det in detections:
            center = det['center']
            # Simple object ID based on position (in real implementation, use proper tracking)
            obj_id = f"{center[0]//50}_{center[1]//50}"
            current_objects.add(obj_id)
            
            if obj_id not in self.loitering_timers[camera_id]:
                self.loitering_timers[camera_id][obj_id] = frame_time
            else:
                duration = frame_time - self.loitering_timers[camera_id][obj_id]
                if duration > BEHAVIOR_THRESHOLDS["loitering"]["min_duration"]:
                    anomalies.append({
                        "type": "loitering",
                        "confidence": min(0.9, duration / 60.0),  # Higher confidence for longer duration
                        "bbox": det['bbox'],
                        "duration": duration,
                        "object_id": obj_id
                    })
        
        # Clean up old objects
        self.loitering_timers[camera_id] = {
            obj_id: start_time for obj_id, start_time in self.loitering_timers[camera_id].items()
            if obj_id in current_objects
        }
        
        return anomalies
    
    def analyze_crowd_gathering(self, camera_id: str, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Detect crowd gathering behavior"""
        anomalies = []
        
        if camera_id not in self.crowd_history:
            self.crowd_history[camera_id] = []
        
        people_count = len(detections)
        self.crowd_history[camera_id].append(people_count)
        
        # Keep only last 10 frames
        if len(self.crowd_history[camera_id]) > 10:
            self.crowd_history[camera_id] = self.crowd_history[camera_id][-10:]
        
        # Check if crowd is gathering
        if len(self.crowd_history[camera_id]) >= 5:
            recent_avg = sum(self.crowd_history[camera_id][-5:]) / 5
            if recent_avg >= BEHAVIOR_THRESHOLDS["crowd_gathering"]["min_people"]:
                # Check if crowd is growing
                if len(self.crowd_history[camera_id]) >= 10:
                    older_avg = sum(self.crowd_history[camera_id][-10:-5]) / 5
                    if recent_avg > older_avg * 1.5:  # 50% increase
                        anomalies.append({
                            "type": "crowd_gathering",
                            "confidence": min(0.9, recent_avg / 10.0),
                            "people_count": int(recent_avg),
                            "growth_rate": recent_avg / older_avg if older_avg > 0 else 1.0
                        })
        
        return anomalies
    
    def analyze_fighting(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Detect fighting behavior (simplified - based on proximity and movement)"""
        anomalies = []
        
        # Simple heuristic: if two people are very close and moving rapidly
        for i, det1 in enumerate(detections):
            for j, det2 in enumerate(detections[i+1:], i+1):
                center1, center2 = det1['center'], det2['center']
                distance = np.sqrt((center1[0] - center2[0])**2 + (center1[1] - center2[1])**2)
                
                # If people are very close (within 50 pixels)
                if distance < 50:
                    # Check if both have high confidence (indicating clear detection)
                    if det1['conf'] > 0.8 and det2['conf'] > 0.8:
                        anomalies.append({
                            "type": "fighting",
                            "confidence": 0.85,
                            "bbox": [
                                min(det1['bbox'][0], det2['bbox'][0]),
                                min(det1['bbox'][1], det2['bbox'][1]),
                                max(det1['bbox'][2], det2['bbox'][2]),
                                max(det1['bbox'][3], det2['bbox'][3])
                            ],
                            "distance": distance,
                            "participants": 2
                        })
        
        return anomalies
    
    def analyze_theft(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Detect potential theft behavior (simplified - based on movement patterns)"""
        anomalies = []
        
        # Simple heuristic: rapid movement with high confidence
        for det in detections:
            if det['conf'] > 0.9:  # Very confident detection
                bbox = det['bbox']
                bbox_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
                
                # If person is moving quickly (large bounding box changes)
                # This is a simplified approach - real implementation would track movement
                if bbox_area > 10000:  # Large bounding box might indicate rapid movement
                    anomalies.append({
                        "type": "theft",
                        "confidence": 0.8,
                        "bbox": bbox,
                        "movement_indicator": bbox_area
                    })
        
        return anomalies
    
    def analyze_falling(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Detect falling behavior (simplified - based on bounding box aspect ratio)"""
        anomalies = []
        
        for det in detections:
            bbox = det['bbox']
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            
            if height > 0:
                aspect_ratio = width / height
                
                # If person appears to be lying down (wide and short)
                if aspect_ratio > 1.5 and det['conf'] > 0.8:
                    anomalies.append({
                        "type": "falling",
                        "confidence": min(0.9, aspect_ratio / 2.0),
                        "bbox": bbox,
                        "aspect_ratio": aspect_ratio
                    })
        
        return anomalies

# Initialize behavior analyzer
behavior_analyzer = BehaviorAnalyzer()

@app.get("/health")
async def health():
    """Health check endpoint"""
    try:
        # Check AI Core service health
        ai_core_health = await ai_core.health()
        return {
            "status": "ok", 
            "service": "behavior-detection",
            "ai_core_status": ai_core_health.get("status", "unknown")
        }
    except Exception as e:
        return {
            "status": "degraded", 
            "service": "behavior-detection",
            "ai_core_status": "unavailable",
            "error": str(e)
        }

@app.post("/camera/register")
async def register_camera(config: BehaviorConfig):
    """Register a new camera for behavior detection"""
    try:
        # Store camera configuration
        active_cameras[config.camera_id] = config
        
        return {
            "status": "ok",
            "camera_id": config.camera_id,
            "message": "Camera registered for behavior detection"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register camera: {str(e)}")

@app.post("/camera/{camera_id}/unregister")
async def unregister_camera(camera_id: str):
    """Unregister a camera"""
    if camera_id in active_cameras:
        del active_cameras[camera_id]
        # Clean up tracking data
        if camera_id in behavior_analyzer.loitering_timers:
            del behavior_analyzer.loitering_timers[camera_id]
        if camera_id in behavior_analyzer.crowd_history:
            del behavior_analyzer.crowd_history[camera_id]
        return {"status": "ok", "message": f"Camera {camera_id} unregistered"}
    else:
        raise HTTPException(status_code=404, detail="Camera not found")

@app.post("/infer", response_model=InferenceResponse)
async def infer(request: InferenceRequest):
    """Perform behavior detection inference on a frame"""
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
        
        # Perform object detection using AI Core
        detections, detection_time = await ai_core.detect(
            image, 
            model_name=config.model_name,
            device=config.device,
            classes=[0],  # person class
            conf_thresh=config.conf_thresh
        )
        
        # Analyze behaviors
        all_anomalies = []
        frame_time = time.time()
        
        for behavior in config.enabled_behaviors:
            if behavior == "loitering":
                anomalies = behavior_analyzer.analyze_loitering(config.camera_id, detections, frame_time)
            elif behavior == "crowd_gathering":
                anomalies = behavior_analyzer.analyze_crowd_gathering(config.camera_id, detections)
            elif behavior == "fighting":
                anomalies = behavior_analyzer.analyze_fighting(detections)
            elif behavior == "theft":
                anomalies = behavior_analyzer.analyze_theft(detections)
            elif behavior == "falling":
                anomalies = behavior_analyzer.analyze_falling(detections)
            else:
                continue
            
            all_anomalies.extend(anomalies)
        
        # Send anomaly events for high-confidence detections
        for anomaly in all_anomalies:
            if anomaly["confidence"] >= BEHAVIOR_THRESHOLDS.get(anomaly["type"], {}).get("confidence", 0.7):
                await send_anomaly_event(
                    config.store_id,
                    config.camera_id,
                    anomaly["type"],
                    anomaly["confidence"],
                    anomaly.get("bbox"),
                    anomaly
                )
        
        # Update processing statistics
        total_time = (time.time() - start_time) * 1000
        processing_stats["total_inferences"] += 1
        processing_stats["total_processing_time_ms"] += total_time
        processing_stats["avg_processing_time_ms"] = (
            processing_stats["total_processing_time_ms"] / processing_stats["total_inferences"]
        )
        processing_stats["anomalies_detected"] += len(all_anomalies)
        processing_stats["last_update"] = datetime.now().isoformat()
        
        return InferenceResponse(
            camera_id=config.camera_id,
            store_id=config.store_id,
            anomalies=all_anomalies,
            processing_time_ms=total_time,
            timestamp=datetime.now().isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Behavior detection failed: {str(e)}")

async def send_anomaly_event(store_id: str, camera_id: str, anomaly_type: str, 
                           confidence: float, bbox: Optional[List[int]], 
                           anomaly_data: Dict[str, Any]):
    """Send anomaly detection event to backend API"""
    try:
        event = AnomalyDetected(
            store_id=store_id,
            camera_id=camera_id,
            type=anomaly_type,
            severity=confidence,
            confidence=confidence,
            bbox=bbox,
            clip_ref=f"clip_{int(time.time())}.mp4",
            ts=datetime.now().isoformat()
        )
        
        # Send to backend API (if configured)
        if BACKEND_URL:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{BACKEND_URL}/api/events/anomaly-detected",
                    json=event.dict(),
                    timeout=5.0
                )
    except Exception as e:
        print(f"Failed to send anomaly event: {e}")

@app.get("/metrics")
async def metrics():
    """Get service metrics"""
    try:
        # Get AI Core device info
        device_info = await ai_core.health()
        
        anomaly_rate = 0
        if processing_stats["total_inferences"] > 0:
            anomaly_rate = processing_stats["anomalies_detected"] / processing_stats["total_inferences"]
        
        return {
            "service": "behavior-detection",
            "active_cameras": len(active_cameras),
            "processing_stats": processing_stats,
            "anomaly_detection_rate": anomaly_rate,
            "ai_core_status": device_info.get("status", "unknown"),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "service": "behavior-detection",
            "active_cameras": len(active_cameras),
            "processing_stats": processing_stats,
            "anomaly_detection_rate": 0,
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
                "enabled_behaviors": config.enabled_behaviors
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
        "enabled_behaviors": config.enabled_behaviors,
        "model_name": config.model_name,
        "device": config.device,
        "conf_thresh": config.conf_thresh,
        "detection_interval": config.detection_interval
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)