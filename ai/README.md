# AI Services Directory

This directory is reserved for AI service implementations.

## Integration Guide

AI engineers can integrate their services into the AIPS system by following these steps:

### 1. Service Structure

Create your AI service in a subdirectory (e.g., `ai/your-service-name/`):

```
ai/
  your-service-name/
    Dockerfile
    main.py
    requirements.txt
    README.md
```

### 2. Service API Requirements

Your AI service should expose the following endpoints:

#### Health Check (Required)
```
GET /health
Response: {"status": "healthy", ...}
```

#### Inference Endpoint (Optional)
```
POST /infer
Request: {
  "camera_id": "string",
  "frame_data": "base64_encoded_image",
  "config": {...}
}
Response: {...}
```

### 3. Docker Compose Integration

Add your service to `docker-compose.yml`:

```yaml
your-service-name:
  build: ./ai/your-service-name
  ports:
    - "800X:800X"
  environment:
    - BACKEND_URL=http://backend:8000
  depends_on:
    - backend
```

### 4. Backend Integration

The backend provides hooks for AI service integration:

- **Camera Manager** (`backend/app/services/camera_manager.py`):
  - Extend `CameraWorker._run()` method to process frames with your service
  - Use `self.ai_services` list to check if your service is enabled
  - Access frame data and camera configuration

- **System Monitor** (`backend/app/services/system_monitor.py`):
  - Extend `get_ai_service_health()` to monitor your service
  - Extend `get_ai_service_metrics()` to collect metrics

- **Event Endpoints** (`backend/app/api/events.py`):
  - Use `/events/counter-update` for counting events
  - Use `/events/anomaly-detected` for anomaly detection events

### 5. Camera Configuration

Cameras have an `ai_services` field that lists enabled services. Your service name should be added to this list when configuring cameras.

### 6. Example Integration

See the existing event endpoints in `backend/app/api/events.py` for examples of how AI services can send data to the backend.

## Notes

- The `ai_services` field in the Camera model is a JSON array that can contain any service names
- Frame processing happens in `CameraWorker._run()` - you can extend this method
- All AI service communication should use HTTP/HTTPS
- Services should be stateless and handle multiple cameras concurrently

