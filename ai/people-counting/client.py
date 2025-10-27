"""
People Counting Service Client
Client library for interacting with the People Counting AI Service
"""

import requests
import base64
import cv2
import numpy as np
from typing import List, Dict, Any, Optional
from datetime import datetime

class PeopleCountingClient:
    def __init__(self, base_url: str = "http://localhost:8001"):
        self.base_url = base_url.rstrip('/')
    
    def _encode_image(self, image: np.ndarray) -> str:
        """Encode OpenCV image to base64"""
        _, buffer = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 80])
        image_bytes = buffer.tobytes()
        return base64.b64encode(image_bytes).decode('utf-8')
    
    def health(self) -> Dict[str, Any]:
        """Check service health"""
        response = requests.get(f"{self.base_url}/health")
        response.raise_for_status()
        return response.json()
    
    def register_camera(self, 
                       camera_id: str, 
                       store_id: str, 
                       rtsp_url: str,
                       zones: List[Dict[str, Any]] = None,
                       lines: List[Dict[str, Any]] = None,
                       model_name: str = "yolov8n.pt",
                       device: str = "auto",
                       conf_thresh: float = 0.5) -> Dict[str, Any]:
        """Register a camera for people counting"""
        payload = {
            "camera_id": camera_id,
            "store_id": store_id,
            "rtsp_url": rtsp_url,
            "zones": zones or [],
            "lines": lines or [],
            "model_name": model_name,
            "device": device,
            "conf_thresh": conf_thresh
        }
        
        response = requests.post(f"{self.base_url}/camera/register", json=payload)
        response.raise_for_status()
        return response.json()
    
    def unregister_camera(self, camera_id: str) -> Dict[str, Any]:
        """Unregister a camera"""
        response = requests.post(f"{self.base_url}/camera/{camera_id}/unregister")
        response.raise_for_status()
        return response.json()
    
    def infer(self, 
              camera_id: str, 
              image: np.ndarray,
              config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Perform people counting inference on an image"""
        payload = {
            "camera_id": camera_id,
            "frame_data": self._encode_image(image)
        }
        
        if config:
            payload["config"] = config
        
        response = requests.post(f"{self.base_url}/infer", json=payload)
        response.raise_for_status()
        return response.json()
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get service metrics"""
        response = requests.get(f"{self.base_url}/metrics")
        response.raise_for_status()
        return response.json()
    
    def list_cameras(self) -> Dict[str, Any]:
        """List all registered cameras"""
        response = requests.get(f"{self.base_url}/cameras")
        response.raise_for_status()
        return response.json()
    
    def get_camera_config(self, camera_id: str) -> Dict[str, Any]:
        """Get camera configuration"""
        response = requests.get(f"{self.base_url}/camera/{camera_id}")
        response.raise_for_status()
        return response.json()

# Example usage
if __name__ == "__main__":
    client = PeopleCountingClient()
    
    # Check health
    print("Health:", client.health())
    
    # Register a camera with zones
    zones = [
        {
            "id": "entrance",
            "polygon": [[100, 100], [300, 100], [300, 300], [100, 300]]
        }
    ]
    
    lines = [
        {
            "id": "main_entrance",
            "p1": [200, 0],
            "p2": [200, 400]
        }
    ]
    
    # Register camera
    result = client.register_camera(
        camera_id="cam_001",
        store_id="store_001",
        rtsp_url="rtsp://example.com/stream",
        zones=zones,
        lines=lines
    )
    print("Camera registered:", result)
    
    # Example inference with a test image
    # test_image = np.zeros((480, 640, 3), dtype=np.uint8)
    # inference_result = client.infer("cam_001", test_image)
    # print("Inference result:", inference_result)
