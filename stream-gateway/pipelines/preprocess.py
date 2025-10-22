#!/usr/bin/env python3
"""
Simple preprocessing pipeline for AI services
Simulates frame processing: decode, resize, ROI crop, snapshot extraction
"""

import cv2
import numpy as np
import time
import requests
import json
from datetime import datetime

class PreprocessPipeline:
    def __init__(self, backend_url="http://backend:8000"):
        self.backend_url = backend_url
        self.ai_services = {
            "people_counting": "http://people-counting:8001",
            "behavior_detection": "http://behavior-detection:8002"
        }
    
    def process_frame(self, frame_data):
        """Simulate frame preprocessing"""
        # Simulate decode, resize, ROI crop
        processed_frame = {
            "timestamp": datetime.now().isoformat(),
            "width": 640,
            "height": 480,
            "format": "RGB"
        }
        return processed_frame
    
    def send_to_ai_services(self, frame_data):
        """Send processed frames to AI services"""
        results = {}
        
        for service_name, service_url in self.ai_services.items():
            try:
                # Simulate inference call
                response = requests.post(f"{service_url}/infer", timeout=5)
                if response.status_code == 200:
                    results[service_name] = response.json()
            except Exception as e:
                print(f"Error calling {service_name}: {e}")
                results[service_name] = None
        
        return results
    
    def forward_events_to_backend(self, events):
        """Forward AI events to backend"""
        for event in events:
            if event and event.get("event") == "counter_update":
                try:
                    requests.post(
                        f"{self.backend_url}/api/events/counter-update",
                        json=event,
                        timeout=5
                    )
                except Exception as e:
                    print(f"Error forwarding counter update: {e}")
            
            elif event and event.get("event") == "anomaly_detected":
                try:
                    requests.post(
                        f"{self.backend_url}/api/events/anomaly-detected",
                        json=event,
                        timeout=5
                    )
                except Exception as e:
                    print(f"Error forwarding anomaly: {e}")
    
    def run_simulation(self):
        """Run simulation of video processing pipeline"""
        print("Starting preprocessing pipeline simulation...")
        
        while True:
            try:
                # Simulate receiving frame
                frame_data = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
                
                # Process frame
                processed = self.process_frame(frame_data)
                
                # Send to AI services
                ai_results = self.send_to_ai_services(processed)
                
                # Forward events to backend
                events = [ai_results.get("people_counting"), ai_results.get("behavior_detection")]
                self.forward_events_to_backend(events)
                
                # Wait before next frame
                time.sleep(2)  # Simulate 0.5 FPS
                
            except KeyboardInterrupt:
                print("Pipeline stopped")
                break
            except Exception as e:
                print(f"Pipeline error: {e}")
                time.sleep(5)

if __name__ == "__main__":
    pipeline = PreprocessPipeline()
    pipeline.run_simulation()
