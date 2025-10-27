"""
AI Core Service Client
Simple client library for interacting with the AI Core service
"""

import requests
import base64
import cv2
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
import io

class AICoreClient:
    def __init__(self, base_url: str = "http://localhost:8003"):
        self.base_url = base_url.rstrip('/')
    
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
    
    def health(self) -> Dict[str, Any]:
        """Check service health"""
        response = requests.get(f"{self.base_url}/health")
        response.raise_for_status()
        return response.json()
    
    def device_info(self) -> Dict[str, Any]:
        """Get device information"""
        response = requests.get(f"{self.base_url}/device-info")
        response.raise_for_status()
        return response.json()
    
    def detect(self, 
               image: np.ndarray, 
               model_name: str = "yolov8n.pt",
               device: str = "auto",
               classes: List[int] = [0],
               conf_thresh: float = 0.5) -> Tuple[List[Dict[str, Any]], float]:
        """
        Perform object detection on an image
        
        Returns:
            Tuple of (detections, processing_time_ms)
        """
        payload = {
            "frame_data": self._encode_image(image),
            "model_name": model_name,
            "device": device,
            "classes": classes,
            "conf_thresh": conf_thresh
        }
        
        response = requests.post(f"{self.base_url}/detect", json=payload)
        response.raise_for_status()
        result = response.json()
        
        return result["detections"], result["processing_time_ms"]
    
    def count_zone(self, 
                   image: np.ndarray, 
                   detections: List[Dict[str, Any]], 
                   zone_polygon: List[List[int]]) -> Tuple[int, List[List[int]], np.ndarray]:
        """
        Count objects in a polygon zone
        
        Returns:
            Tuple of (count, ids_in_zone, processed_image)
        """
        payload = {
            "frame_data": self._encode_image(image),
            "detections": detections,
            "zone_polygon": zone_polygon
        }
        
        response = requests.post(f"{self.base_url}/count-zone", json=payload)
        response.raise_for_status()
        result = response.json()
        
        processed_image = self._decode_image(result["processed_frame_data"])
        return result["count"], result["ids_in_zone"], processed_image
    
    def create_tracker(self, 
                      tracker_id: str, 
                      max_disappeared: int = 30, 
                      max_distance: int = 50) -> Dict[str, Any]:
        """Create a new tracker instance"""
        payload = {
            "tracker_id": tracker_id,
            "max_disappeared": max_disappeared,
            "max_distance": max_distance
        }
        
        response = requests.post(f"{self.base_url}/create-tracker", json=payload)
        response.raise_for_status()
        return response.json()
    
    def count_line(self, 
                   image: np.ndarray, 
                   detections: List[Dict[str, Any]], 
                   line_p1: List[int], 
                   line_p2: List[int], 
                   tracker_id: str) -> Tuple[int, int, np.ndarray]:
        """
        Count objects crossing a line
        
        Returns:
            Tuple of (count_in, count_out, processed_image)
        """
        payload = {
            "frame_data": self._encode_image(image),
            "detections": detections,
            "line_p1": line_p1,
            "line_p2": line_p2,
            "tracker_id": tracker_id
        }
        
        response = requests.post(f"{self.base_url}/count-line", json=payload)
        response.raise_for_status()
        result = response.json()
        
        processed_image = self._decode_image(result["processed_frame_data"])
        return result["count_in"], result["count_out"], processed_image
    
    def delete_tracker(self, tracker_id: str) -> Dict[str, Any]:
        """Delete a tracker instance"""
        response = requests.delete(f"{self.base_url}/tracker/{tracker_id}")
        response.raise_for_status()
        return response.json()
    
    def list_trackers(self) -> Dict[str, Any]:
        """List all active trackers"""
        response = requests.get(f"{self.base_url}/trackers")
        response.raise_for_status()
        return response.json()
    
    def list_models(self) -> Dict[str, Any]:
        """List all loaded models"""
        response = requests.get(f"{self.base_url}/models")
        response.raise_for_status()
        return response.json()

# Example usage
if __name__ == "__main__":
    client = AICoreClient()
    
    # Check health
    print("Health:", client.health())
    
    # Get device info
    print("Device Info:", client.device_info())
    
    # Example with a test image
    # test_image = np.zeros((480, 640, 3), dtype=np.uint8)
    # detections, processing_time = client.detect(test_image)
    # print(f"Detections: {detections}, Processing time: {processing_time}ms")
