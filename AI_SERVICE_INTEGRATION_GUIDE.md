# AI Service Integration Improvements

## 🎯 **Overview**

This document outlines the improvements made to ensure smooth AI service integration with the camera system.

## ✅ **Improvements Implemented**

### 1. **New AI Integration API Endpoints** (`/api/ai/`)

#### **GET `/api/ai/cameras/{camera_id}/frame`**
- **Purpose**: AI services can pull frames from cameras
- **Formats**: 
  - `format=jpeg` (default): Returns JPEG binary
  - `format=base64`: Returns JSON with base64-encoded frame
- **Headers**: Includes frame dimensions in response headers
- **No Authentication**: Designed for trusted internal network use
- **Example**:
  ```bash
  # Get JPEG frame
  curl http://backend:8000/api/ai/cameras/cam-123/frame
  
  # Get base64 frame
  curl http://backend:8000/api/ai/cameras/cam-123/frame?format=base64
  ```

#### **GET `/api/ai/cameras/{camera_id}/config`**
- **Purpose**: Get camera configuration including zones, lines, AI services
- **Returns**: Complete camera config for AI processing setup
- **Example**:
  ```json
  {
    "camera_id": "cam-123",
    "store_id": "store-456",
    "name": "Entrance Camera",
    "source": "rtsp://...",
    "ai_services": ["people_counting", "behavior_detection"],
    "skip_frame": 3,
    "is_active": true,
    "zones": [...],
    "lines": [...]
  }
  ```

#### **GET `/api/ai/cameras/{camera_id}/health`**
- **Purpose**: Check camera health and frame availability
- **Returns**: Health status, FPS, frame count, errors
- **Use Case**: AI services can verify camera is ready before processing

#### **GET `/api/ai/cameras`**
- **Purpose**: List all cameras available for AI processing
- **Filters**:
  - `store_id`: Filter by store
  - `ai_service`: Filter by enabled AI service
  - `active_only`: Only return active cameras
- **Example**:
  ```bash
  # Get all active cameras with people_counting enabled
  curl "http://backend:8000/api/ai/cameras?ai_service=people_counting&active_only=true"
  ```

### 2. **Improved Logging**

- ✅ Replaced `print()` with proper `logging` in:
  - Camera worker task configuration updates
  - Event handlers (counter updates, anomaly detection)
  - Error handling with proper log levels

### 3. **Better Error Handling**

- ✅ HTTPException handling in event endpoints
- ✅ Proper rollback on database errors
- ✅ Detailed error logging for debugging

### 4. **Frame Processing Hooks**

- ✅ Clear documentation in `CameraWorker._run()` about how AI services can access frames
- ✅ Frame timing tracking for FPS calculation
- ✅ Comments explaining pull-based vs push-based integration

## 📋 **How AI Services Should Integrate**

### **Option 1: Pull-Based (Recommended)**

AI services poll for frames:

```python
import requests
import base64
import cv2
import numpy as np

# 1. Get camera list
cameras = requests.get("http://backend:8000/api/ai/cameras?ai_service=people_counting").json()

# 2. For each camera, poll for frames
for camera in cameras:
    camera_id = camera["camera_id"]
    
    # Get frame
    response = requests.get(f"http://backend:8000/api/ai/cameras/{camera_id}/frame?format=base64")
    frame_data = response.json()
    
    # Decode frame
    frame_bytes = base64.b64decode(frame_data["data"])
    nparr = np.frombuffer(frame_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Process frame with AI
    result = your_ai_model.process(frame)
    
    # Send results back
    requests.post("http://backend:8000/api/events/counter-update", json={
        "store_id": camera["store_id"],
        "zone_id": "zone-1",
        "value": result.count,
        "ts": datetime.now().isoformat()
    })
```

### **Option 2: Push-Based (Advanced)**

AI services can extend `CameraWorker._run()` method for direct frame access:

```python
# In your AI service integration
def process_frame_with_ai(camera_worker, frame):
    # Your AI processing logic
    pass

# Hook into camera worker
camera_worker._run = lambda: your_custom_run_method(camera_worker)
```

## 🔄 **Event Flow**

```
Camera → Frame Available
    ↓
AI Service polls /api/ai/cameras/{id}/frame
    ↓
AI Service processes frame
    ↓
AI Service sends results to /api/events/counter-update or /api/events/anomaly-detected
    ↓
Backend stores event in database
    ↓
Frontend receives updates via polling or WebSocket (future)
```

## 🛡️ **Error Handling Best Practices**

1. **Check Camera Health First**:
   ```python
   health = requests.get(f"http://backend:8000/api/ai/cameras/{camera_id}/health").json()
   if not health["healthy"]:
       # Skip this camera
       continue
   ```

2. **Handle Frame Unavailable**:
   ```python
   try:
       response = requests.get(f"http://backend:8000/api/ai/cameras/{camera_id}/frame")
       if response.status_code == 503:
           # Camera not ready, retry later
           time.sleep(1)
           continue
   except Exception as e:
       logger.error(f"Error getting frame: {e}")
       continue
   ```

3. **Retry Logic**:
   - Implement exponential backoff for failed requests
   - Check camera health before retrying
   - Log errors for monitoring

## 📊 **Monitoring & Observability**

### **Camera Health Monitoring**
```python
# Check camera health
health = requests.get(f"http://backend:8000/api/ai/cameras/{camera_id}/health").json()
print(f"FPS: {health['fps']}, Errors: {health['errors']}")
```

### **Event Logging**
- All events are logged with proper log levels
- Errors include stack traces for debugging
- Success events logged at debug level

## 🚀 **Performance Considerations**

1. **Frame Polling Rate**:
   - Don't poll faster than camera FPS
   - Use `skip_frame` setting to reduce processing load
   - Consider frame buffering for high-frequency AI services

2. **Concurrent Processing**:
   - Multiple AI services can process same camera
   - Each service gets independent frame access
   - No blocking between services

3. **Resource Management**:
   - Camera limit: 20 concurrent cameras
   - Frame encoding: JPEG quality 85 (good balance)
   - Frame size: Automatically handled by camera manager

## 🔐 **Security Notes**

- AI integration endpoints are **not authenticated** (trusted network)
- Event endpoints validate store/camera ownership
- Organization isolation maintained in event storage
- Consider adding API key authentication for production

## 📝 **Configuration Updates**

AI services should poll for configuration changes:

```python
# Poll for config updates every 30 seconds
config = requests.get(f"http://backend:8000/api/ai/cameras/{camera_id}/config").json()
zones = config["zones"]
lines = config["lines"]

# Update your AI service configuration
update_ai_config(zones, lines)
```

## ✅ **What's Ready**

- ✅ Frame delivery endpoints
- ✅ Configuration access
- ✅ Health monitoring
- ✅ Event submission
- ✅ Error handling
- ✅ Logging improvements
- ✅ Camera listing with filters

## 🔮 **Future Enhancements (Optional)**

1. **WebSocket Frame Streaming**: Real-time frame push to AI services
2. **Webhook Registration**: AI services register callbacks for config changes
3. **Frame Queue**: Buffer frames for async processing
4. **API Key Authentication**: Secure AI service endpoints
5. **Rate Limiting**: Protect against AI service overload
6. **Metrics Endpoint**: AI service performance metrics

## 📚 **Example AI Service Integration**

See `ai/README.md` for complete integration guide and examples.

