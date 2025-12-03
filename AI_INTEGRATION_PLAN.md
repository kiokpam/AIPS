# AI Services Integration Plan

## Overview

This document describes how to integrate the AI services (In/Out Counting + Behavior Detection) into the AIPS system **without modifying the original AI code**.

## AI Services Summary

### Service 1: In/Out Counting
- **Location**: `ai/inout_pkg/`
- **Input**: Two lines (Line A, Line B)
- **Logic**: Track crossing A→B = OUT, B→A = IN
- **Output**: `count_in`, `count_out` numbers

### Service 2: Zone Behavior Detection
- **Location**: `ai/ai/` + `ai/buffers/`
- **Input**: Polygon zone, video frames
- **Pipeline**:
  1. YOLO detects persons
  2. DeepSORT tracks each person
  3. MobileNet screens behavior every 2 frames (fast)
  4. If suspicious → VideoMAE analyzes (detailed)
- **Output**: Behavior label (normal/shoplifting/violence), confidence, video clip

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DOCKER NETWORK                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     Backend (FastAPI)                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │ Camera      │  │ AI         │  │ Events API          │   │   │
│  │  │ Manager     │  │ Integration │  │ - /counter-update   │   │   │
│  │  │ (Streams)   │  │ API         │  │ - /inout-update     │   │   │
│  │  └─────────────┘  └─────────────┘  │ - /anomaly-detected │   │   │
│  │                                    └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│           │                              ▲                           │
│           │ GET /api/ai/cameras/{id}/frame                          │
│           │ GET /api/ai/cameras/{id}/config                         │
│           ▼                              │ POST /api/events/*        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     AI Service (CoreAI)                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │ Frame       │→ │ YOLO        │→ │ DeepSORT            │   │   │
│  │  │ Puller      │  │ Detector    │  │ Tracker             │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │
│  │                         │                   │                 │   │
│  │           ┌─────────────┴───────────────────┘                │   │
│  │           ▼                                                   │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────────┐    │   │
│  │  │ InOut Counter   │  │ Behavior Detector               │    │   │
│  │  │ (Line A/B)      │  │ MobileNet → VideoMAE            │    │   │
│  │  └─────────────────┘  └─────────────────────────────────┘    │   │
│  │           │                         │                         │   │
│  │           └─────────────────────────┘                         │   │
│  │                         │                                     │   │
│  │                         ▼ POST results to backend             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## What Needs to Change

### 1. Backend Changes (Minimal)

#### A. Add InOut Count Model
```python
# backend/app/models/timeseries.py - ADD
class InOutCount(Base):
    __tablename__ = "inout_counts"
    
    time: Mapped[str] = mapped_column(DateTime, primary_key=True)
    camera_id: Mapped[str] = mapped_column(String, primary_key=True)
    store_id: Mapped[str] = mapped_column(String, nullable=False)
    count_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    count_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    org_id: Mapped[str] = mapped_column(String, nullable=False)
```

#### B. Add InOut Event Endpoint
```python
# backend/app/api/events.py - ADD
@router.post("/inout-update")
def receive_inout_update(event: InOutUpdateEvent, db: Session = Depends(get_db)):
    """Receive in/out count updates from AI service"""
    # Store in inout_counts table
    pass
```

#### C. Update AI Config Endpoint
```python
# backend/app/api/ai_integration.py - MODIFY
@router.get("/cameras/{camera_id}/config")
def get_camera_config_for_ai(...):
    # ADD: Return counting lines from database
    lines = db.query(CountingLine).filter(
        CountingLine.camera_id == camera_id,
        CountingLine.is_active == True
    ).all()
    
    return {
        # ... existing fields ...
        "lines": [
            {
                "id": line.id,
                "name": line.name,
                "line_a": {"p1": line.p1, "p2": line.p2},
                "line_b": {"p1": line.p2_alt, "p2": line.p2_alt2}  # Need second line
            }
            for line in lines
        ]
    }
```

### 2. AI Service Wrapper (New File)

Create `ai/service_mode.py` that wraps the original AI code:

```python
"""
AI Service Mode - Wraps CoreAI for integration with AIPS backend.
Pulls frames from backend API instead of cv2.VideoCapture.
Pushes results back to backend via REST API.
"""
import requests
import time
import logging
from typing import Dict, List, Optional
import numpy as np
import cv2

# Import original AI modules (unchanged)
from detectors.yolo_onnx_detector import YOLOONNXDetector
from detectors.deepsort_tracker import DeepSortTracker
from ai.mobilenet_runner import MobileNetRunner
from ai.videomae_onnx_runner import VideoMAEONNXRunner
from inout_pkg.inout_api import InOutAPI
from buffers.person_buffer import PersonBuffer
from zone.zone import point_in_polygon, bbox_center

BACKEND_URL = "http://backend:8000"
LOGGER = logging.getLogger("ai-service")

class CameraProcessor:
    """Process a single camera's frames."""
    
    def __init__(self, camera_id: str, config: dict, models: dict):
        self.camera_id = camera_id
        self.config = config
        self.models = models
        
        # Initialize tracking state
        self.buffers: Dict[int, PersonBuffer] = {}
        self.tracker = models['tracker']
        
        # Initialize InOut counter if lines are configured
        if config.get('lines'):
            line = config['lines'][0]  # Use first line pair
            line_a = (tuple(line['p1']), tuple(line['p2']))
            line_b = (tuple(line['p1_alt']), tuple(line['p2_alt']))
            self.inout_api = InOutAPI(line_a, line_b)
        else:
            self.inout_api = None
        
        # Zone polygon
        self.zone = None
        if config.get('zones'):
            zone = config['zones'][0]  # Use first zone
            self.zone = [(p[0], p[1]) for p in zone['polygon']]
    
    def pull_frame(self) -> Optional[np.ndarray]:
        """Pull latest frame from backend."""
        try:
            resp = requests.get(
                f"{BACKEND_URL}/api/ai/cameras/{self.camera_id}/frame",
                timeout=5
            )
            if resp.status_code == 200:
                # Decode JPEG to numpy array
                arr = np.frombuffer(resp.content, np.uint8)
                return cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception as e:
            LOGGER.warning(f"Failed to pull frame for {self.camera_id}: {e}")
        return None
    
    def process_frame(self, frame: np.ndarray) -> dict:
        """Run AI pipeline on frame."""
        results = {
            'detections': [],
            'inout': None,
            'behaviors': []
        }
        
        # 1. YOLO detection
        dets = self.models['yolo'].detect(frame)
        
        # 2. DeepSORT tracking
        tracks = self.tracker.update(dets, frame=frame)
        
        # 3. In/Out counting
        if self.inout_api:
            current_ids = set(tid for tid, _ in tracks)
            prev_ids = set(self.inout_api.get_state_ids())
            lost = list(prev_ids - current_ids)
            self.inout_api.process_tracks(tracks, lost_ids=lost)
            cin, cout = self.inout_api.get_counts()
            results['inout'] = {'in': cin, 'out': cout}
        
        # 4. Zone behavior detection
        for tid, xyxy in tracks:
            cx, cy = bbox_center(xyxy)
            
            # Check if inside zone
            if self.zone and not point_in_polygon((cx, cy), self.zone):
                continue
            
            # Buffer management
            if tid not in self.buffers:
                self.buffers[tid] = PersonBuffer(tid, max_frames=50)
            
            self.buffers[tid].append(frame, xyxy)
            
            # Run MobileNet screening (every N frames)
            crop = self.buffers[tid].get_latest_crop()
            if crop is not None:
                label, prob = self.models['mobilenet'].predict_on_crop(crop)
                if label != 'Normal' and prob > 0.5:
                    results['behaviors'].append({
                        'track_id': tid,
                        'label': label,
                        'confidence': prob,
                        'bbox': xyxy
                    })
        
        return results
    
    def push_results(self, results: dict):
        """Push results to backend."""
        try:
            # Push in/out counts
            if results.get('inout'):
                requests.post(
                    f"{BACKEND_URL}/api/events/inout-update",
                    json={
                        'camera_id': self.camera_id,
                        'store_id': self.config['store_id'],
                        'count_in': results['inout']['in'],
                        'count_out': results['inout']['out'],
                        'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ')
                    },
                    timeout=5
                )
            
            # Push behavior alerts
            for behavior in results.get('behaviors', []):
                requests.post(
                    f"{BACKEND_URL}/api/events/anomaly-detected",
                    json={
                        'camera_id': self.camera_id,
                        'store_id': self.config['store_id'],
                        'type': behavior['label'].lower(),
                        'severity': behavior['confidence'],
                        'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ')
                    },
                    timeout=5
                )
        except Exception as e:
            LOGGER.error(f"Failed to push results: {e}")


def main():
    """Main service loop."""
    logging.basicConfig(level=logging.INFO)
    
    # Initialize AI models (once, shared across cameras)
    LOGGER.info("Loading AI models...")
    models = {
        'yolo': YOLOONNXDetector('models/yolov8n.onnx', device='cuda'),
        'tracker': DeepSortTracker(max_age=30, use_embedder=False),
        'mobilenet': MobileNetRunner('models/mobilenet_pytorch_best.pth', device='cuda'),
        'videomae': VideoMAEONNXRunner('videomae', device='cuda')
    }
    LOGGER.info("AI models loaded!")
    
    processors: Dict[str, CameraProcessor] = {}
    
    while True:
        try:
            # Poll for active cameras
            resp = requests.get(f"{BACKEND_URL}/api/ai/cameras", timeout=10)
            if resp.status_code != 200:
                time.sleep(5)
                continue
            
            cameras = resp.json()
            
            # Update processor list
            current_ids = {cam['camera_id'] for cam in cameras}
            
            # Remove processors for stopped cameras
            for cam_id in list(processors.keys()):
                if cam_id not in current_ids:
                    del processors[cam_id]
            
            # Add processors for new cameras
            for cam in cameras:
                cam_id = cam['camera_id']
                if cam_id not in processors:
                    # Get full config
                    cfg_resp = requests.get(
                        f"{BACKEND_URL}/api/ai/cameras/{cam_id}/config",
                        timeout=5
                    )
                    if cfg_resp.status_code == 200:
                        config = cfg_resp.json()
                        processors[cam_id] = CameraProcessor(cam_id, config, models)
                        LOGGER.info(f"Added processor for camera: {cam_id}")
            
            # Process each camera
            for cam_id, processor in processors.items():
                frame = processor.pull_frame()
                if frame is not None:
                    results = processor.process_frame(frame)
                    processor.push_results(results)
            
            # Small delay between cycles
            time.sleep(0.1)
            
        except Exception as e:
            LOGGER.exception(f"Service loop error: {e}")
            time.sleep(5)


if __name__ == '__main__':
    main()
```

### 3. AI Dockerfile

```dockerfile
# ai/Dockerfile
FROM nvidia/cuda:11.8-cudnn8-runtime-ubuntu22.04

# Install Python
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
RUN pip3 install requests

# Copy AI code
COPY . .

# Run service mode
CMD ["python3", "service_mode.py"]
```

### 4. Docker Compose Update

```yaml
# docker-compose.yml - ADD
services:
  # ... existing services ...
  
  ai:
    build:
      context: ./ai
      dockerfile: Dockerfile
    container_name: aips-ai
    restart: unless-stopped
    depends_on:
      - backend
    environment:
      - BACKEND_URL=http://backend:8000
      - NVIDIA_VISIBLE_DEVICES=all
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    volumes:
      - ./ai/models:/app/models:ro
      - ./ai/videomae:/app/videomae:ro
      - ./clips:/app/clips  # For saved video clips
    networks:
      - aips-network
```

---

## Database Schema Updates

### New Table: inout_counts
```sql
CREATE TABLE inout_counts (
    time TIMESTAMPTZ NOT NULL,
    camera_id VARCHAR NOT NULL,
    store_id VARCHAR NOT NULL,
    count_in INTEGER NOT NULL DEFAULT 0,
    count_out INTEGER NOT NULL DEFAULT 0,
    org_id VARCHAR NOT NULL,
    PRIMARY KEY (time, camera_id)
);

-- For TimescaleDB (optional but recommended)
SELECT create_hypertable('inout_counts', 'time', if_not_exists => TRUE);
```

### Modify counting_lines Table
```sql
-- Add second line endpoints for In/Out detection
ALTER TABLE counting_lines ADD COLUMN p1_alt JSON;  -- Second line point 1
ALTER TABLE counting_lines ADD COLUMN p2_alt JSON;  -- Second line point 2
```

---

## Frontend Updates

### 1. In/Out Dashboard (`app/dashboard/in-out/page.tsx`)
- Replace mock data with API calls to `/api/events/inout-counts`
- Show real-time IN/OUT counts per camera/store

### 2. Behavior Dashboard (`app/dashboard/behavior/page.tsx`)
- Replace mock events with API calls to `/api/events/alerts`
- Show real behavior detection events (shoplifting, violence)
- Add video clip playback when available

### 3. Camera Page (`app/cameras/page.tsx`)
- Add UI to draw counting lines (Line A, Line B)
- Add UI to draw behavior detection zone (polygon)
- Store coordinates via backend API

---

## Model Files Required

The AI developers need to provide these model files:

```
ai/
├── models/
│   ├── yolov8n.onnx          ✓ (already present)
│   ├── yolov8n.pt            ✓ (already present)
│   └── mobilenet_pytorch_best.pth  ✓ (already present)
│
└── videomae/
    ├── videomae.onnx         ❌ (needs to be downloaded)
    ├── videomae.onnx.data    ❌ (needs to be downloaded)
    ├── configs.json          ❌ (needs to be provided)
    └── preprocessor_config.json  ❌ (optional)
```

---

## Testing Plan

1. **Unit Test AI Integration API**
   - Test frame pulling endpoint
   - Test config endpoint returns zones/lines

2. **Integration Test**
   - Start backend + AI service
   - Add camera with zones/lines
   - Verify counts appear in database
   - Verify alerts appear for suspicious behavior

3. **Load Test**
   - Test with multiple cameras (4-8)
   - Monitor GPU memory usage
   - Verify frame rate is acceptable

---

## Summary

| Component | Change Required | Effort |
|-----------|-----------------|--------|
| AI Code | None (kept as-is) | 0 |
| Backend | Add InOut model + endpoint | Low |
| AI Service Wrapper | New file `service_mode.py` | Medium |
| Docker | Add AI service | Low |
| Frontend | Connect to real APIs | Medium |

The key insight is that the AI code is **already well-structured** with clean interfaces:
- `InOutAPI` for counting
- `MobileNetRunner` and `VideoMAEONNXRunner` for behavior
- Standard input/output formats

We just need to wrap it in a service that pulls frames from the backend and pushes results back.

