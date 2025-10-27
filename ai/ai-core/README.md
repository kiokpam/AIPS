# AI Core Service

A shared microservice that provides core AI functionality for the AIPS (AI-Powered Store Surveillance System). This service centralizes YOLO model management, object detection, tracking, and counting logic that can be used by other AI services.

## Features

- **Object Detection**: YOLOv8-based object detection with GPU/CPU support
- **Object Tracking**: Centroid-based multi-object tracking
- **Zone Counting**: Count objects within polygon zones
- **Line Counting**: Count objects crossing defined lines
- **Model Management**: Efficient model loading and caching
- **Device Management**: Automatic GPU/CPU device selection

## API Endpoints

### Health & Info
- `GET /health` - Service health check
- `GET /device-info` - Get available devices (GPU/CPU info)
- `GET /models` - List loaded models
- `GET /trackers` - List active trackers

### Detection
- `POST /detect` - Perform object detection on an image
- `POST /count-zone` - Count objects in a polygon zone
- `POST /count-line` - Count objects crossing a line

### Tracker Management
- `POST /create-tracker` - Create a new tracker instance
- `DELETE /tracker/{tracker_id}` - Delete a tracker instance

## Usage

### Using the Client Library

```python
from client import AICoreClient
import cv2

# Initialize client
client = AICoreClient("http://ai-core:8003")

# Load an image
image = cv2.imread("test_image.jpg")

# Perform detection
detections, processing_time = client.detect(image)
print(f"Found {len(detections)} objects in {processing_time}ms")

# Count in zone
zone_polygon = [[100, 100], [200, 100], [200, 200], [100, 200]]
count, ids_in_zone, processed_image = client.count_zone(image, detections, zone_polygon)
print(f"Count in zone: {count}")

# Create tracker and count line crossings
client.create_tracker("camera_1")
line_p1, line_p2 = [300, 0], [300, 480]
count_in, count_out, processed_image = client.count_line(image, detections, line_p1, line_p2, "camera_1")
print(f"Line crossings - In: {count_in}, Out: {count_out}")
```

### Direct API Usage

```python
import requests
import base64
import cv2

# Encode image
image = cv2.imread("test.jpg")
_, buffer = cv2.imencode('.jpg', image)
image_data = base64.b64encode(buffer).decode('utf-8')

# Detect objects
response = requests.post("http://ai-core:8003/detect", json={
    "frame_data": image_data,
    "model_name": "yolov8n.pt",
    "device": "auto",
    "classes": [0],  # person class
    "conf_thresh": 0.5
})

detections = response.json()["detections"]
```

## Configuration

### Environment Variables
- `CUDA_VISIBLE_DEVICES`: GPU device selection (default: 0)

### Model Files
- Models are automatically downloaded on first use
- YOLOv8 models are cached for performance
- Support for custom model paths

## Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up ai-core

# Or build individually
docker build -t ai-core .
docker run -p 8003:8003 --gpus all ai-core
```

## Dependencies

- FastAPI: Web framework
- Ultralytics: YOLO models
- OpenCV: Image processing
- PyTorch: Deep learning backend
- NumPy: Numerical operations

## Integration with Other Services

This service is designed to be used by:
- **People Counting Service**: For people detection and counting
- **Behavior Detection Service**: For object detection and tracking
- **Backend API**: For camera management and stream processing

## Performance Notes

- Models are loaded once and cached for efficiency
- GPU acceleration is automatically used when available
- Tracker instances are managed per camera/stream
- Base64 encoding/decoding is optimized for performance
