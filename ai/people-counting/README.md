# People Counting AI Service

A microservice dedicated to people counting functionality in the AIPS (AI-Powered Store Surveillance System). This service integrates with the AI Core service to provide real-time people counting using YOLO detection and advanced tracking algorithms.

## Features

- **Real-time People Counting**: YOLOv8-based person detection and counting
- **Zone-based Counting**: Count people within defined polygon zones
- **Line-based Counting**: Count people crossing defined lines (in/out tracking)
- **Multi-camera Support**: Handle multiple cameras simultaneously
- **Camera Management**: Register/unregister cameras dynamically
- **Event Streaming**: Send counter updates to backend API
- **Performance Metrics**: Track processing statistics and performance

## API Endpoints

### Health & Management
- `GET /health` - Service health check
- `GET /metrics` - Get service metrics and statistics
- `GET /cameras` - List all registered cameras
- `GET /camera/{camera_id}` - Get specific camera configuration

### Camera Management
- `POST /camera/register` - Register a new camera
- `POST /camera/{camera_id}/unregister` - Unregister a camera

### Inference
- `POST /infer` - Perform people counting inference on a frame

## Usage

### Using the Client Library

```python
from client import PeopleCountingClient
import cv2

# Initialize client
client = PeopleCountingClient("http://people-counting:8001")

# Register a camera with zones
zones = [
    {
        "id": "entrance_zone",
        "polygon": [[100, 100], [300, 100], [300, 300], [100, 300]]
    },
    {
        "id": "checkout_zone", 
        "polygon": [[400, 200], [600, 200], [600, 400], [400, 400]]
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
client.register_camera(
    camera_id="cam_001",
    store_id="store_001", 
    rtsp_url="rtsp://camera.example.com/stream",
    zones=zones,
    lines=lines,
    model_name="yolov8n.pt",
    device="auto",
    conf_thresh=0.5
)

# Perform inference
image = cv2.imread("test_frame.jpg")
result = client.infer("cam_001", image)

print(f"Zones: {result['zones']}")
print(f"Lines: {result['lines']}")
print(f"Processing time: {result['processing_time_ms']}ms")
```

### Direct API Usage

```python
import requests
import base64
import cv2

# Register camera
camera_config = {
    "camera_id": "cam_001",
    "store_id": "store_001",
    "rtsp_url": "rtsp://camera.example.com/stream",
    "zones": [
        {
            "id": "entrance",
            "polygon": [[100, 100], [300, 100], [300, 300], [100, 300]]
        }
    ],
    "lines": [
        {
            "id": "main_entrance",
            "p1": [200, 0],
            "p2": [200, 400]
        }
    ]
}

response = requests.post("http://people-counting:8001/camera/register", json=camera_config)

# Perform inference
image = cv2.imread("test.jpg")
_, buffer = cv2.imencode('.jpg', image)
image_data = base64.b64encode(buffer).decode('utf-8')

inference_request = {
    "camera_id": "cam_001",
    "frame_data": image_data
}

response = requests.post("http://people-counting:8001/infer", json=inference_request)
result = response.json()

print(f"People count in zones: {result['zones']}")
print(f"Line crossings: {result['lines']}")
```

## Configuration

### Environment Variables
- `AI_CORE_URL`: URL of the AI Core service (default: http://localhost:8003)
- `BACKEND_URL`: URL of the backend API for event streaming (default: http://localhost:8000)

### Camera Configuration
```json
{
    "camera_id": "unique_camera_id",
    "store_id": "store_identifier", 
    "rtsp_url": "rtsp://camera.url/stream",
    "zones": [
        {
            "id": "zone_name",
            "polygon": [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
        }
    ],
    "lines": [
        {
            "id": "line_name",
            "p1": [x1, y1],
            "p2": [x2, y2]
        }
    ],
    "model_name": "yolov8n.pt",
    "device": "auto",
    "conf_thresh": 0.5
}
```

## Response Format

### Inference Response
```json
{
    "camera_id": "cam_001",
    "store_id": "store_001",
    "zones": [
        {
            "zone_id": "entrance",
            "count": 5,
            "ids_in_zone": [[150, 150], [200, 180], ...],
            "polygon": [[100, 100], [300, 100], [300, 300], [100, 300]]
        }
    ],
    "lines": [
        {
            "line_id": "main_entrance",
            "count_in": 12,
            "count_out": 8,
            "p1": [200, 0],
            "p2": [200, 400]
        }
    ],
    "processing_time_ms": 45.2,
    "timestamp": "2024-01-15T10:30:00Z"
}
```

## Event Streaming

The service automatically sends counter update events to the backend API:

```json
{
    "event": "counter_update",
    "store_id": "store_001",
    "camera_id": "cam_001", 
    "zone_id": "entrance",
    "value": 5,
    "ts": "2024-01-15T10:30:00Z",
    "confidence": 1.0
}
```

## Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up people-counting

# Or build individually
docker build -t people-counting .
docker run -p 8001:8001 \
  -e AI_CORE_URL=http://ai-core:8003 \
  -e BACKEND_URL=http://backend:8000 \
  people-counting
```

## Dependencies

- **AI Core Service**: For YOLO detection and tracking
- **Backend API**: For event streaming and camera management
- **FastAPI**: Web framework
- **OpenCV**: Image processing
- **HTTPX**: Async HTTP client

## Performance Notes

- Processing time typically 30-100ms per frame
- Supports multiple cameras simultaneously
- Automatic GPU acceleration when available
- Efficient model caching through AI Core service
- Real-time event streaming to backend
