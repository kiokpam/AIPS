# AIPS – AI‑Powered Store Surveillance System

End‑to‑end retail video analytics platform with real-time AI-powered behavior detection, people counting, camera management, live video streaming, and a modern web UI.

This README explains the system architecture, how to run it, and key features.

---

## 🏗️ High‑level Architecture

**Services (Dockerized):**

- **backend/** (FastAPI)
  - REST API for cameras, stores, organizations, members, tasks (zones/lines), events, alerts
  - WebSocket endpoints for real-time updates (detections, in/out counts, alerts)
  - Manages `CameraWorker` instances (OpenCV capture, overlays, AI integration)
  - TimescaleDB/Postgres via SQLAlchemy models with automatic table creation
  - File upload service for video testing

- **frontend/** (Next.js 14)
  - Modern web UI with dark theme
  - Camera management, live preview, zone/line drawing
  - Real-time dashboards (behavior detection, in/out counting)
  - Multi-language support (EN/VI)
  - WebSocket integration for live updates

- **ai/** (Python AI Service)
  - Unified AI service (`service_mode.py`) running YOLO detection, DeepSORT tracking
  - MobileNet filtering for suspicious behavior screening
  - VideoMAE analysis for detailed behavior detection (shoplifting, violence)
  - Per-camera processing with WebSocket communication to backend
  - GPU-accelerated (CUDA) with CPU fallback

- **notification-service/** (FastAPI)
  - WebSocket server for alert broadcasting to frontend clients
  - Email notifications (SMTP)
  - Telegram bot integration (optional)
  - Receives alerts from backend and broadcasts to connected clients

**Data Store:**
- TimescaleDB/Postgres for core entities (cameras, stores, organizations, members, counting zones/lines, alerts, video clips, time‑series people counts)

---

## 📁 Repository Layout

```
backend/                    # FastAPI backend service
  app/
    api/                    # FastAPI routers: cameras, stores, auth, events, clips, ws
    models/                 # SQLAlchemy models (Camera, Store, Alert, VideoClip, ...)
    schemas/                # Pydantic schemas
    services/
      camera_manager.py     # CameraWorker, frame processing, AI integration
      streaming_service.py  # MJPEG generation and preview helpers
      websocket_manager.py  # WebSocket connection management
    main.py                 # App factory, CORS, router wiring

frontend/                   # Next.js frontend application
  app/                      # Next.js app router pages
    cameras/                # Camera management page
    dashboard/              # Behavior, in-out dashboards
    videos/                 # Saved video clips page
  components/               # Reusable components
  lib/                      # API client, WebSocket manager
  src/                      # Contexts, i18n, utilities

ai/                         # Unified AI service
  ai/                       # AI model runners (YOLO, MobileNet, VideoMAE)
  detectors/                # YOLO detector, DeepSORT tracker
  inout_pkg/                # In/Out counting logic
  zone/                     # Zone detection utilities
  models/                   # ONNX model files (YOLO, MobileNet)
  videomae/                 # VideoMAE model files
  service_mode.py           # Main AI service loop
  main.py                   # Standalone mode (for testing)

notification-service/       # Notification service
  app/
    api/                    # REST API, WebSocket endpoints
    services/               # Email, Telegram, notification router
    models/                 # Notification models

clips/                      # Video clips saved by AI (anomaly detection)
backend/uploads/            # Uploaded video files (for testing)
docker-compose.yml          # Orchestrates all services
start-system.sh             # Startup script (Linux/Mac)
start-system.bat            # Startup script (Windows)
```

---

## 🔐 Authentication & RBAC

Multi-tenant authentication with organizations and role-based access:

- **`manager`**: Full access within organization (manage cameras, stores, members, tasks)
- **`member`**: Read/monitor permissions as granted by managers

**Key REST endpoints:**
- `POST /api/auth/signup` – Create organization and manager user
- `POST /api/auth/login` – Obtain org-scoped JWT
- `POST /api/auth/switch-org` – Switch active organization
- `GET /api/auth/me` – Profile with memberships
- `GET /api/auth/orgs/{org_id}/members` – List members (manager only)
- `POST /api/auth/orgs/{org_id}/members` – Add/update members (manager only)

JWT tokens include `sub`, `org_id`, and `role` claims. All endpoints enforce organization scoping.

**Environment variables:**
- `JWT_SECRET` (default: `dev-secret-change-me`)
- `JWT_EXPIRES_SECONDS` (default: `3600`)

---

## 🚀 Core Features

### 1. Camera Management
- Add cameras with RTSP URLs or file sources
- Live preview before saving
- Start/stop camera processing
- Real-time streaming with overlays

### 2. Zone & Line Configuration
- Draw counting zones (polygons) for behavior detection
- Draw counting lines (Line A + Line B) for in/out counting
- Visual overlay on live stream
- Persistent configuration in database

### 3. AI-Powered Analytics
- **People Detection**: YOLO object detection
- **Tracking**: DeepSORT multi-object tracking
- **Behavior Detection**: 
  - MobileNet filtering (fast screening)
  - VideoMAE analysis (detailed behavior classification)
  - Detects: shoplifting, violence, normal behavior
- **People Counting**: In/Out counting via line crossings
- **Real-time Metrics**: FPS, inference times, processing stats

### 4. Real-time Dashboards
- **Behavior Dashboard**: View detected anomalies (shoplifting, violence)
- **In/Out Dashboard**: Track people entering/exiting stores
- **Live Updates**: WebSocket-powered real-time data

### 5. Alerts & Notifications
- Real-time alert notifications via WebSocket
- Email notifications (SMTP)
- Telegram bot integration (optional)
- Alert acknowledgment and management

### 6. Video Clips
- Automatic clip saving for detected anomalies
- View and download saved clips
- Clip metadata (behavior type, confidence, timestamp)

---

## 🖥️ System Requirements

**Hardware:**
- **GPU**: NVIDIA GeForce RTX 3050 (4 GB VRAM) or better
- **RAM**: Minimum 8GB, Recommended 16GB+
- **Storage**: Sufficient space for video clips and models

**Software:**
- Docker Desktop + Docker Compose
- NVIDIA Docker runtime (for GPU acceleration)
- CUDA 12.3+ compatible drivers

**Models Required:**
- `ai/models/yolov8n.onnx` - YOLO detection model
- `ai/models/mobilenet.onnx` - MobileNet filtering model
- `ai/videomae/videomae_runner.onnx` or `videomae.onnx` - VideoMAE behavior model (optional)

---

## 🏃 Running the System

### Option 1: Using the Startup Script

**Linux/Mac:**
```bash
cd /path/to/AIPS
chmod +x start-system.sh
./start-system.sh
```

**Windows:**
```powershell
cd D:\Capstone\github\AIPS
start-system.bat
```

**What it does:**
- Verifies Docker and `docker-compose` availability
- Checks for required AI model files
- Creates necessary directories (`backend/uploads/`, `clips/`)
- Runs `docker-compose up --build -d`
- Performs health checks on services

### Option 2: Docker Compose Directly

```bash
docker-compose up -d --build
```

**Access points:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Notification Service: http://localhost:8004

**Stop system:**
```bash
docker-compose down
```

**View logs:**
```bash
docker-compose logs -f [service-name]  # e.g., ai, backend, frontend
```

---

## 🔌 Key API Endpoints

### Health
- `GET /health` - Service health check

### Cameras
- `GET /api/cameras/` - List cameras
- `POST /api/cameras/` - Create camera
- `POST /api/cameras/{id}/start` - Start camera processing
- `POST /api/cameras/{id}/stop` - Stop camera processing
- `GET /api/cameras/{id}/stats` - Camera statistics
- `GET /api/cameras/{id}/stream?overlay=true` - MJPEG stream

### Tasks (Zones/Lines)
- `GET /api/tasks/camera/{id}/config` - Get camera configuration
- `POST /api/tasks/camera/{id}/set` - Set zones/lines
- `POST /api/tasks/camera/{id}/clear` - Clear configuration

### Events & Alerts
- `GET /api/events/alerts` - List alerts
- `POST /api/events/anomaly-detected` - Report anomaly (AI service)
- `POST /api/events/acknowledge/{alert_id}` - Acknowledge alert

### Video Clips
- `GET /api/clips/` - List saved video clips
- `GET /api/clips/{filename}` - Download clip

### WebSocket Endpoints
- `WS /api/ws/detections` - Real-time detection updates (bounding boxes, metrics)
- `WS /api/ws/inout` - Real-time in/out count updates
- `WS /api/ws/alerts` - Real-time alert notifications
- `WS /api/ws/detections/ai/{camera_id}` - AI service connection (internal)

### AI Integration
- `GET /api/ai/cameras` - List cameras for AI processing
- `GET /api/ai/cameras/{id}/frame` - Get camera frame (AI service)
- `GET /api/ai/cameras/{id}/config` - Get camera config (zones, lines)

---

## 🧪 Development Mode

### Backend (FastAPI)
```bash
cd backend
pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

### AI Service
```bash
cd ai
pip install -r requirements.txt
python service_mode.py --backend-url http://localhost:8000 --device cuda
```

### Notification Service
```bash
cd notification-service
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8004
```

---

## 📊 AI Pipeline Performance

The full pipeline—including YOLO detection, DeepSORT tracking, per-identity buffer updates, lightweight MobileNet filtering, and asynchronous VideoMAE analysis—is executed on a live camera stream using an NVIDIA GeForce RTX 3050 (4 GB VRAM).

**Performance Metrics:**
- YOLO Inference: ~35-45ms per frame
- DeepSORT Tracking: ~12-20ms per frame
- MobileNet Filtering: ~15-20ms per crop (async)
- VideoMAE Analysis: ~280-425ms per clip (16 frames)
- Overall Pipeline FPS: ~7-20 FPS (depending on camera count and load)

---

## 🔧 Configuration

### Environment Variables

**Backend** (`docker-compose.yml`):
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `CORS_ORIGINS` - Allowed CORS origins
- `CLIPS_DIR` - Directory for saved video clips

**AI Service** (`docker-compose.yml`):
- `BACKEND_URL` - Backend API URL
- `AI_DEVICE` - `cuda` or `cpu`
- `CLIPS_DIR` - Directory for saving clips

**Frontend** (`docker-compose.yml`):
- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_NOTIFICATION_URL` - Notification service URL (optional)

**Notification Service** (`docker-compose.yml`):
- `BACKEND_URL` - Backend API URL
- `EMAIL_PROVIDER` - Email service provider
- `TELEGRAM_BOT_TOKEN` - Telegram bot token (optional)

---

## 🐛 Troubleshooting

**Preview "Connection timeout"**
- Verify camera RTSP URL is accessible
- Check network connectivity
- Test with: `curl "http://localhost:8000/api/preview/test?source=<RTSP_URL>"`

**AI Service not detecting behaviors**
- Check GPU availability: `nvidia-smi`
- Verify models are present: `ls ai/models/`
- Check AI service logs: `docker-compose logs -f ai`

**WebSocket connection issues**
- Verify backend/notification service is running
- Check browser console for WebSocket errors
- Ensure JWT token is valid

**Database connection errors**
- Verify PostgreSQL container is running: `docker-compose ps db`
- Check database logs: `docker-compose logs db`
- Ensure `DATABASE_URL` is correct

---

## 🧪 Testing

The project includes comprehensive test suites for all components. See [TESTING.md](TESTING.md) for detailed testing documentation.

### Quick Start

**Backend Tests:**
```bash
cd backend
pip install -e ".[test]"
pytest
```

**Frontend Tests:**
```bash
cd frontend
npm install
npm test
```

**AI Service Tests:**
```bash
cd ai
pip install pytest numpy
pytest tests/
```

### Test Coverage

- **Unit Tests**: Core services and utilities (>80% coverage goal)
- **Integration Tests**: API endpoints and database interactions
- **End-to-End Tests**: Complete user workflows

Run tests with coverage:
```bash
# Backend
pytest --cov=app --cov-report=html

# Frontend
npm run test:coverage
```

---

## 🧪 Testing

The project includes comprehensive test suites. **Tests run independently** of your running system and don't interfere with it.

### Quick Start

**First time setup:**
```bash
# Install python3-venv if needed (Ubuntu/Debian)
sudo apt install python3.10-venv

# Run setup script
./setup-testing.sh
```

**Run tests:**
```bash
# Activate virtual environment
source venv/bin/activate

# Run all tests
./run-all-tests.sh
```

**Run individual service tests:**
```bash
# Backend
cd backend && pytest

# Frontend  
cd frontend && npm test

# AI Service
cd ai && pytest tests/
```

See [QUICK_START_TESTING.md](QUICK_START_TESTING.md) for quick setup guide and [TESTING.md](TESTING.md) for detailed documentation.

---

## 📝 Adding New Features

**New AI behavior detection:**
- Modify `ai/service_mode.py` to add new behavior types
- Update VideoMAE model or add custom detection logic
- Add alert types in backend `Alert` model

**New dashboard:**
- Create new page in `frontend/app/dashboard/`
- Add WebSocket subscription for real-time updates
- Use existing API endpoints or add new ones

**New notification channel:**
- Add service in `notification-service/app/services/`
- Register in `notification_router.py`
- Update frontend to use new channel

---

## 📄 License

MIT
