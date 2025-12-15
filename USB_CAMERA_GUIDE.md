# USB Camera Setup Guide

Quick reference for adding USB cameras to eliminate WiFi delays.

## TL;DR - Quick Setup

### Linux

```bash
# 1. Identify cameras
ls /dev/video*

# 2. Restart backend
docker-compose restart backend

# 3. Add camera via API
curl -X POST http://localhost:8000/api/cameras \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "USB Camera 1",
    "source": "/dev/video0",
    "store_id": "store-1",
    "ai_services": ["people_counting"]
  }'
```

### Windows

**Option 1: WSL2 + Linux (see DOCKER_SETUP.md)**

**Option 2: Run Backend Natively (Easiest)**

```bash
# Install Python packages
pip install -r backend/requirements.txt

# Run backend
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Add camera with device index instead of path
# source: "0" for Camera 0, "1" for Camera 1, etc.
```

### macOS

**Option 1: Use RTSP streams (recommended)**

**Option 2: Run Backend Natively (see DOCKER_SETUP.md)**

## Why This Matters

| Metric | WiFi RTSP | USB Direct |
|--------|-----------|-----------|
| Latency | 100-500ms | 10-50ms |
| Reliability | Packet loss | Direct connection |
| WiFi Dependent | Yes ❌ | No ✅ |
| Network Bandwidth | High | None |

**Result: USB cameras are 5-10x faster!**

## Source Format Reference

```javascript
// Linux: Use device path
"source": "/dev/video0"    // Camera 0
"source": "/dev/video1"    // Camera 1

// Windows: Use device index (if running natively)
"source": "0"              // First camera
"source": "1"              // Second camera

// Any OS: Network streams (if needed)
"source": "rtsp://ip:8554/stream"

// Any OS: Local video file (testing)
"source": "/path/to/video.mp4"
```

## Testing

### View Camera in Browser

1. Go to http://localhost:3000
2. Navigate to Cameras page
3. Select your USB camera
4. Should show live feed with no lag ✅

### Check Latency

Watch the bounding boxes from AI detections:
- **<100ms**: Perfect (USB direct)
- **100-300ms**: Good (local network)
- **>500ms**: Slow (WiFi/network issues)

## Common Issues

### Device Not Found

```bash
# Check devices exist
ls -la /dev/video*

# If empty: USB camera not detected by kernel
# Try: sudo dmesg | grep -i video
```

### Permission Denied

```bash
# Linux: Grant access
sudo chmod 666 /dev/video0

# Or Docker: Already configured with user: "0:0" in docker-compose.yml
```

### Laggy Performance

1. Check USB version: `lsusb -t | grep Video`
   - USB 2.0: Up to 30fps @ 1080p
   - USB 3.0: Up to 120fps @ 1080p

2. Lower resolution if possible

3. Increase `skip_frame`: `POST /api/cameras/{id}/config`
   ```json
   {"skip_frame": 3}
   ```

## Next Steps

✅ Setup USB device passthrough in docker-compose.yml (already done)  
✅ Restart backend to enable device access  
✅ Add camera via API with `/dev/video0` as source  
✅ Verify stream in web UI with no lag  
✅ Enjoy 5-10x faster video with no WiFi delays!

---

For full details, see [DOCKER_SETUP.md - USB Camera Setup](./DOCKER_SETUP.md#-usb-camera-setup-direct-access---no-wifirtsp-delay)
