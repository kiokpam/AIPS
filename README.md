# AIPS – AI‑Powered Store Surveillance System

End‑to‑end retail video analytics platform with AI-based behavior detection, people counting, camera management, live video streaming, and a web UI.

This README explains the system architecture, how to run it, and key features.

---

## 🎬 Demo

Screenshots and a short demo video are coming soon.

---

## 👥 Team & Roles

AIPS was built as a graduation project (September–December 2025) by a team of four.

- **Mai Anh Quan ([Qcymaq](https://github.com/Qcymaq))** – Project Lead. Wrote almost all of the FastAPI backend, the Next.js frontend, the AI integration service (`ai/service_mode.py`), the notification service, the Docker/Compose files, and the tests.
- **Gia Huy** – Core computer-vision modules: YOLO ONNX detector, DeepSORT tracker wrapper, in/out line counter, person buffer, MobileNet and VideoMAE ONNX runners, and ONNX export.
- **Truong Quang Phat** – An early Telegram notifier and an early Flask dashboard (kept in `archive/codedash_ai/`).
- **kiokpam** – Repository owner.

---

## 🏗️ High‑level Architecture

**Services:**

- **backend/** (FastAPI) – runs on the host machine in the current setup (see [Quick Start](#-quick-start))
  - REST API for cameras, stores, organizations, members, tasks (zones/lines), events, alerts
  - WebSocket endpoints for real-time updates (detections, in/out counts, alerts)
  - Manages `CameraWorker` instances (OpenCV capture, overlays, AI integration)
  - TimescaleDB/Postgres via SQLAlchemy models with automatic table creation
  - File upload service for video testing

- **frontend/** (Next.js 14) – Docker
  - Web UI with dark theme
  - Camera management, live preview, zone/line drawing
  - Real-time dashboards (behavior detection, in/out counting)
  - Multi-language support (EN/VI)
  - WebSocket integration for live updates

- **ai/** (Python AI service) – Docker (NVIDIA GPU) or host
  - Unified AI service (`service_mode.py`) running YOLO detection and DeepSORT tracking
  - MobileNet screening of person crops for suspicious behavior (runs asynchronously in a thread pool)
  - VideoMAE classification (shoplifting, violence) that runs only on tracks MobileNet flags as suspicious
  - Pulls frames from the backend and pushes results back over WebSocket/HTTP
  - GPU-accelerated (CUDA) with CPU fallback

- **notification-service/** (FastAPI) – Docker
  - WebSocket server for alert broadcasting to frontend clients
  - Email notifications (SMTP)
  - Telegram bot integration (optional)
  - Receives alerts from backend and broadcasts to connected clients

**Data Store:**
- TimescaleDB/Postgres (Docker) for core entities (cameras, stores, organizations, members, counting zones/lines, alerts, video clips, time‑series people counts)

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
  ai/                       # AI model runners (MobileNet, VideoMAE)
  detectors/                # YOLO detector, DeepSORT tracker
  inout_pkg/                # In/Out counting logic
  zone/                     # Zone detection utilities
  models/                   # ONNX model files (YOLO, MobileNet)
  videomae/                 # VideoMAE config and export script (weights not included)
  service_mode.py           # Main AI service loop
  main.py                   # Standalone mode (for testing)

notification-service/       # Notification service
  app/
    api/                    # REST API, WebSocket endpoints
    services/               # Email, Telegram, notification router
    models/                 # Notification models

archive/                    # Early prototypes, not used by the current system
clips/                      # Video clips saved by AI (anomaly detection)
backend/uploads/            # Uploaded video files (for testing)
.env.example                # Example environment variables (copy to .env)
docker-compose.yml          # Docker services: db, frontend, notification, ai (no backend)
docker-compose.hybrid.yml   # Same services, with live-mounted notification code
```

---

## 🔐 Authentication & RBAC

Multi-tenant authentication with organizations and role-based access:

- **`manager`**: Full access within organization (manage cameras, stores, members, tasks)
- **`member`**: Read/monitor permissions as granted by managers

**Key REST endpoints:**
- `POST /api/auth/signup/manager` – Create organization and manager user
- `POST /api/auth/signup/member` – Join an organization as a member (invite or join code)
- `POST /api/auth/login` – Obtain org-scoped JWT
- `POST /api/auth/switch-org` – Switch active organization
- `GET /api/auth/me` – Profile with memberships
- `GET /api/auth/orgs/{org_id}/members` – List members (manager only)
- `POST /api/auth/orgs/{org_id}/members` – Add/update members (manager only)

JWT tokens include `sub`, `org_id`, and `role` claims. All endpoints enforce organization scoping.

**Environment variables:**
- `JWT_SECRET` – secret used to sign tokens. If it is not set, the backend uses a public development secret and logs a security warning. With `ENV=production` the backend refuses to start without it.
- `JWT_EXPIRES_SECONDS` (default: `2592000`, 30 days)

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
  - MobileNet screening of person crops (fast, asynchronous)
  - VideoMAE classification of a short clip, only for tracks MobileNet flags as suspicious
  - Detects: shoplifting, violence, normal behavior (requires the VideoMAE weights, see [Models](#models))
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
- **GPU**: NVIDIA GPU for the AI service in Docker (the team used a GeForce RTX 3050, 4 GB VRAM). Without a GPU, run the AI service on the host with `--device cpu` (slower).
- **RAM**: Minimum 8GB, Recommended 16GB+
- **Storage**: Sufficient space for video clips and models

**Software:**
- Docker Desktop or Docker Engine with Docker Compose
- NVIDIA Container Toolkit and CUDA 12 compatible drivers (for the GPU AI container)
- Python 3.10+ (the backend runs on the host)

### Models

- `ai/models/yolov8n.onnx` – YOLO detection model (included)
- `ai/models/mobilenet.onnx` – MobileNet screening model (included)
- `ai/videomae/videomae_runner.onnx` or `ai/videomae/videomae.onnx` – VideoMAE behavior model (**not included**)

The VideoMAE weights are not included in this repository. Without them the AI service still runs detection, tracking, in/out counting and MobileNet screening, but the shoplifting/violence feature is disabled: no behavior alerts or clips are created. To enable it, place a VideoMAE ONNX file at one of the paths above.

---

## 🏃 Quick Start

The current setup is **hybrid**: the database, frontend, notification service and AI service run in Docker, and the **backend runs on the host**. `docker-compose.yml` does not contain a backend service.

### 1. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set at least `JWT_SECRET` to a long random value:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Optionally set `AI_SERVICE_TOKEN` to protect the internal AI endpoints (see [Security Notes](#-security-notes)).

### 2. Start the Docker services

```bash
mkdir -p clips backend/uploads
docker compose up -d --build        # db, frontend, notification, ai
```

The `ai` service needs an NVIDIA GPU. Without one, start the other services only and run the AI service on the host later (see [Running Services Individually](#-running-services-individually)):

```bash
docker compose up -d --build db frontend notification
```

(Older Docker installs use `docker-compose` instead of `docker compose`.)

### 3. Run the backend on the host

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\Activate.ps1
pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --env-file ../.env
```

`--env-file ../.env` loads the same `.env` file, so the backend uses your `JWT_SECRET`, the local database URL and the host-side notification URL.

### 4. Open the app

- Frontend: http://localhost:3000 (register a manager account; this also creates your organization)
- Backend API: http://localhost:8000
- API docs (Swagger): http://localhost:8000/docs
- Notification service: http://localhost:8004

Then create a store, add a camera, and draw lines (in/out) or a zone (behavior) on it.

**Helper scripts:** `start-system.sh`, `start-system.bat`, `run-hybrid.ps1` and `start-system-no-backend.ps1` only start the Docker services. You still start the backend yourself as in step 3. [HYBRID_SETUP.md](HYBRID_SETUP.md) (Vietnamese) has more detail and troubleshooting.

**Stop everything:**
```bash
docker compose down        # stop Docker services
# then press Ctrl+C in the terminal running uvicorn
```

**View logs:**
```bash
docker compose logs -f [service-name]  # e.g., ai, frontend, notification, db
```

> `docker-compose.dev.yml` and [DOCKER_SETUP.md](DOCKER_SETUP.md) describe an older all-in-Docker layout and are partly outdated.

---

## 🔒 Security Notes

- **`JWT_SECRET`**: required for any real deployment. The built-in fallback is public and only for local development; the backend logs a warning when it is used and refuses to start when `ENV=production`.
- **`AI_SERVICE_TOKEN`** (optional): the AI service calls internal backend endpoints that have no user login (`/api/ai/*`, the AI event endpoints under `/api/events`, and the `/api/ws/detections/ai/{camera_id}` WebSocket). When `AI_SERVICE_TOKEN` is set for both the backend and the AI service, the backend only accepts these calls with a matching `X-Service-Token` header, and the AI service sends it automatically. When it is not set, these endpoints stay open and the backend logs a warning.
- **Database credentials**: the `aips`/`aips` Postgres user in the compose files and `.env.example` is for local development only.
- **Camera URLs**: camera sources (RTSP URLs, which often include passwords) are not returned by the internal AI endpoints.

---

## 🔌 Key API Endpoints

The full, up-to-date list is in the Swagger UI at http://localhost:8000/docs.

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
- `GET /api/cameras/{id}/tasks` - Get zones/lines for a camera
- `POST /api/cameras/{id}/tasks` - Set zones/lines
- `POST /api/cameras/{id}/tasks/clear` - Clear zones/lines

### Events & Alerts
- `GET /api/events/alerts` - List alerts
- `PUT /api/events/alerts/{alert_id}/acknowledge` - Acknowledge alert
- `POST /api/events/anomaly-detected` - Report anomaly (internal, AI service)

### Video Clips
- `GET /api/clips` - List saved video clips
- `GET /api/clips/{filename}` - Download clip
- `DELETE /api/clips/{filename}` - Delete clip (manager of the owning organization)

### WebSocket Endpoints
- `WS /api/ws/detections` - Real-time detection updates (bounding boxes, metrics)
- `WS /api/ws/inout` - Real-time in/out count updates
- `WS /api/ws/alerts` - Real-time alert notifications
- `WS /api/ws/detections/ai/{camera_id}` - AI service connection (internal)

### AI Integration (internal, used by the AI service)
- `GET /api/ai/cameras` - List cameras for AI processing
- `GET /api/ai/cameras/{id}/frame` - Get camera frame
- `GET /api/ai/cameras/{id}/config` - Get camera config (zones, lines)

---

## 💻 Running Services Individually

### Backend (FastAPI)
```bash
cd backend
pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --env-file ../.env
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
python service_mode.py --backend-url http://localhost:8000 --device cuda   # or --device cpu
```

If you set `AI_SERVICE_TOKEN` for the backend, export the same value in this shell before starting the AI service.

### Notification Service
```bash
cd notification-service
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8004
```

---

## 📊 AI Pipeline Performance

The pipeline runs YOLO detection and DeepSORT tracking on each processed frame and keeps a short frame buffer for every tracked person. MobileNet screens person crops in a background thread pool (asynchronous). VideoMAE runs only on tracks that MobileNet flags as suspicious; it runs synchronously inside the frame-processing loop, so frame processing pauses while a VideoMAE call is running.

The numbers below were measured by the team on their development machine (NVIDIA GeForce RTX 3050, 4 GB VRAM) with a live camera stream. They are approximate figures from development; no benchmark logs are committed to this repository.

- YOLO Inference: ~35-45ms per frame
- DeepSORT Tracking: ~12-20ms per frame
- MobileNet Screening: ~15-20ms per crop (async)
- VideoMAE Analysis: ~280-425ms per clip (16 frames), only for suspicious tracks
- Overall Pipeline FPS: ~7-20 FPS (depending on camera count and load)

---

## 🔧 Configuration

### Environment Variables

See [.env.example](.env.example) for all values with comments.

**Backend** (host, loaded with `--env-file ../.env`):
- `ENV` - `dev` (default) or `production`
- `JWT_SECRET` - JWT signing secret (required in production)
- `DATABASE_URL` - PostgreSQL connection string
- `CORS_ORIGINS` - Allowed CORS origins
- `CLIPS_DIR` - Directory for saved video clips
- `NOTIFICATION_SERVICE_URL` - Notification service URL (use `http://localhost:8004` when the backend runs on the host)
- `AI_SERVICE_TOKEN` - Optional shared token for internal AI endpoints

**AI Service** (`docker-compose.yml`):
- `BACKEND_URL` - Backend API URL
- `AI_DEVICE` - `cuda` or `cpu`
- `CLIPS_DIR` - Directory for saving clips
- `AI_SERVICE_TOKEN` - Must match the backend value when used

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
- Check that the VideoMAE weights are present (see [Models](#models)); without them no behavior alerts are created
- Check GPU availability: `nvidia-smi`
- Verify models are present: `ls ai/models/ ai/videomae/`
- Check AI service logs: `docker compose logs -f ai`

**AI Service gets 401 errors**
- `AI_SERVICE_TOKEN` must have the same value for the backend and the AI service (or be unset for both). A mismatch shows up as 401 responses and an HTTP 403 WebSocket handshake error in the AI service log

**WebSocket connection issues**
- Verify backend/notification service is running
- Check browser console for WebSocket errors
- Ensure JWT token is valid

**Database connection errors**
- Verify PostgreSQL container is running: `docker compose ps db`
- Check database logs: `docker compose logs db`
- Ensure `DATABASE_URL` is correct

---

## 🧪 Testing

The repository has unit, integration and end-to-end tests for the backend, unit tests for the AI modules, and a few frontend tests. Tests do not need the running system. See [TESTING.md](TESTING.md) for details.

**Backend tests:**
```bash
cd backend
pip install -e ".[test]"
pytest
```

**Frontend tests:**
```bash
cd frontend
npm install
npm test
```

**AI service tests:**
```bash
cd ai
pip install -r requirements.txt pytest
pytest tests/
```

**Coverage reports:**
```bash
# Backend
pytest --cov=app --cov-report=html

# Frontend
npm run test:coverage
```

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

No license has been chosen yet. Please contact the repository owner before reusing this code.
