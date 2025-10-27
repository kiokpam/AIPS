from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import numpy as np
import cv2
import base64
from io import BytesIO

from models import get_model, get_device_info
from detector import detect_frame
from tracker import CentroidTracker
from business_models import count_in_zone, count_line_inout, LineInOutState

app = FastAPI(title="AI Core Service", version="0.1.0")

# Global model cache
_models = {}
_trackers = {}

class DetectionRequest(BaseModel):
    frame_data: str  # Base64 encoded image
    model_name: str = "yolov8n.pt"
    device: str = "auto"
    classes: List[int] = [0]  # Default to person class
    conf_thresh: float = 0.5

class DetectionResponse(BaseModel):
    detections: List[Dict[str, Any]]
    processing_time_ms: float

class ZoneCountRequest(BaseModel):
    frame_data: str
    detections: List[Dict[str, Any]]
    zone_polygon: List[List[int]]  # [[x1,y1], [x2,y2], ...]

class ZoneCountResponse(BaseModel):
    count: int
    ids_in_zone: List[List[int]]
    processed_frame_data: str  # Base64 encoded processed frame

class LineCountRequest(BaseModel):
    frame_data: str
    detections: List[Dict[str, Any]]
    line_p1: List[int]  # [x, y]
    line_p2: List[int]  # [x, y]
    tracker_id: str

class LineCountResponse(BaseModel):
    count_in: int
    count_out: int
    processed_frame_data: str

class TrackerCreateRequest(BaseModel):
    tracker_id: str
    max_disappeared: int = 30
    max_distance: int = 50

def decode_base64_image(image_data: str) -> np.ndarray:
    """Decode base64 image to OpenCV format"""
    try:
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Invalid image data")
        return image
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode image: {str(e)}")

def encode_image_to_base64(image: np.ndarray) -> str:
    """Encode OpenCV image to base64"""
    try:
        _, buffer = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 80])
        image_bytes = buffer.tobytes()
        return base64.b64encode(image_bytes).decode('utf-8')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to encode image: {str(e)}")

@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-core"}

@app.get("/device-info")
def device_info():
    """Get information about available devices"""
    return get_device_info()

@app.post("/detect", response_model=DetectionResponse)
def detect(request: DetectionRequest):
    """Perform object detection on a frame"""
    import time
    start_time = time.time()
    
    try:
        # Decode image
        frame = decode_base64_image(request.frame_data)
        
        # Get or load model
        model_key = f"{request.model_name}_{request.device}"
        if model_key not in _models:
            _models[model_key] = get_model(request.model_name, request.device)
        
        model = _models[model_key]
        
        # Perform detection
        detections = detect_frame(
            model, 
            frame, 
            classes=request.classes, 
            conf_thresh=request.conf_thresh
        )
        
        processing_time = (time.time() - start_time) * 1000
        
        return DetectionResponse(
            detections=detections,
            processing_time_ms=processing_time
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")

@app.post("/count-zone", response_model=ZoneCountResponse)
def count_zone(request: ZoneCountRequest):
    """Count objects in a polygon zone"""
    try:
        # Decode image
        frame = decode_base64_image(request.frame_data)
        
        # Convert zone polygon to numpy array
        zone_polygon = np.array(request.zone_polygon, np.int32)
        
        # Perform zone counting
        processed_frame, count, ids_in_zone = count_in_zone(
            frame, 
            request.detections, 
            zone_polygon
        )
        
        # Encode processed frame
        processed_frame_data = encode_image_to_base64(processed_frame)
        
        return ZoneCountResponse(
            count=count,
            ids_in_zone=ids_in_zone,
            processed_frame_data=processed_frame_data
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Zone counting failed: {str(e)}")

@app.post("/create-tracker")
def create_tracker(request: TrackerCreateRequest):
    """Create a new tracker instance"""
    try:
        tracker = CentroidTracker(
            max_disappeared=request.max_disappeared,
            max_distance=request.max_distance
        )
        _trackers[request.tracker_id] = tracker
        return {"status": "ok", "tracker_id": request.tracker_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create tracker: {str(e)}")

@app.post("/count-line", response_model=LineCountResponse)
def count_line(request: LineCountRequest):
    """Count objects crossing a line"""
    try:
        # Decode image
        frame = decode_base64_image(request.frame_data)
        
        # Get tracker
        if request.tracker_id not in _trackers:
            raise HTTPException(status_code=404, detail="Tracker not found")
        
        tracker = _trackers[request.tracker_id]
        
        # Create line state if not exists
        line_state_key = f"{request.tracker_id}_line_state"
        if line_state_key not in _trackers:
            _trackers[line_state_key] = LineInOutState(
                tuple(request.line_p1), 
                tuple(request.line_p2)
            )
        
        line_state = _trackers[line_state_key]
        
        # Perform line counting
        processed_frame, counts = count_line_inout(
            frame, 
            request.detections, 
            tracker, 
            line_state
        )
        
        # Encode processed frame
        processed_frame_data = encode_image_to_base64(processed_frame)
        
        return LineCountResponse(
            count_in=counts[0],
            count_out=counts[1],
            processed_frame_data=processed_frame_data
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Line counting failed: {str(e)}")

@app.delete("/tracker/{tracker_id}")
def delete_tracker(tracker_id: str):
    """Delete a tracker instance"""
    if tracker_id in _trackers:
        del _trackers[tracker_id]
    if f"{tracker_id}_line_state" in _trackers:
        del _trackers[f"{tracker_id}_line_state"]
    return {"status": "ok", "tracker_id": tracker_id}

@app.get("/trackers")
def list_trackers():
    """List all active trackers"""
    return {"trackers": list(_trackers.keys())}

@app.get("/models")
def list_models():
    """List all loaded models"""
    return {"models": list(_models.keys())}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
