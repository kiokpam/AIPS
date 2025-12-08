# AIPS – AI‑Powered Store Surveillance

End‑to‑end retail video analytics platform with camera management, live video preview/streaming, zone/line counting tools, AI microservices, and a modern web UI.

This README explains the system flow, how to develop and run it, and where to add features.

---

## High‑level Architecture

Services (Dockerized):

- backend/ (FastAPI)
  - REST API for cameras, tasks (zones/lines), frames, preview, health.
  - Manages `CameraWorker` instances (OpenCV capture, overlays, AI integration).
  - TimescaleDB/Postgres via SQLAlchemy models with automatic table creation.

- frontend/ (Next.js 14)
  - Web UI for camera CRUD, live preview, drawing zones/lines, and configuration.
  - Auth placeholder (localStorage), dark black‑blue design system.

- ai/people-counting, ai/behavior-detection (FastAPI)
  - Example AI microservices (can be swapped with your models).


Data Store:

- TimescaleDB/Postgres for core entities (cameras, counting zones/lines, time‑series people counts).

---

## Repository Layout

```
backend/                # FastAPI backend service
  app/
    api/                # FastAPI routers: cameras, tasks, preview, events
    models/             # SQLAlchemy models (Camera, CountingZone, Alert, VideoClip, …)
    schemas/            # Pydantic schemas
    services/
      camera_manager.py # CameraWorker, frame processing, AI integration
      streaming_service.py # MJPEG generation and preview helpers
    main.py             # App factory, CORS, router wiring

frontend/               # Next.js frontend application
  app/                  # Next.js app router pages
  src/                  # Components, contexts, utilities

ai/                     # AI microservices (ready for integration)
  ai-core/              # Core AI service (detection, tracking)
  people-counting/      # People counting service (example)
  behavior-detection/   # Behavior detection service (example)

shared/                 # Shared schemas and definitions
  events-json/          # Event JSON schemas
docker-compose.yml      # Orchestrates services
```

---

## Authentication & RBAC

- New multi-tenant auth model with organizations and role-based access:
  - `manager`: full access within organization (manage cameras, tasks, members)
  - `member`: read/monitor permissions as granted by managers
- Key REST endpoints:
  - `POST /api/auth/signup` – create organization and manager user
  - `POST /api/auth/login` – obtain org-scoped JWT
  - `POST /api/auth/switch-org` – switch active organization for users with multiple memberships
  - `GET /api/auth/me` – profile with memberships
  - `GET /api/auth/orgs/{org_id}/members` – list members (manager only)
  - `POST /api/auth/orgs/{org_id}/members` – add/update members (manager only)
- JWT access tokens now include `sub`, `org_id`, and `role` claims. All protected endpoints enforce organization scoping and role checks.
- Set environment variables (or `.env`) for JWT configuration:
  - `JWT_SECRET` (default `dev-secret-change-me`)
  - `JWT_EXPIRES_SECONDS` (default `3600`)

---

## Core User Flows

1) Add a camera
- Frontend calls `POST /api/cameras/` with name, source (RTSP/file), model params.
- Backend persists a `Camera`, the worker can be started via `POST /api/cameras/{id}/start`.
- UI marks camera as active optimistically and polls stats.

2) Live preview (before saving camera)
- Frontend hits `GET /api/preview/test?source=...` to validate connectivity (OpenCV one‑shot test).
- Frontend can open `GET /api/preview/stream?source=...` (MJPEG) for quick pre‑add preview.

3) Drawing zones/lines (people counting)
- On the Add Camera modal, the UI draws on an HTML5 canvas placed over the media element.
- Points are stored in normalized space (fractions `[0,1]`) relative to the content box (letterboxing aware).
- On save, UI fetches an actual frame to get `naturalWidth/Height` and converts fractions → exact frame pixels.
- UI calls `POST /api/tasks/camera/{id}/set` with `CountingZoneCreate[]` and/or `CountingLineCreate[]`.
- Backend updates DB and calls `camera_worker.update_task_config()`, enabling overlays and AI logic.

4) Live stream with overlays
- UI displays `GET /api/cameras/{id}/stream?overlay=true` (MJPEG) inside `<img>`. Backend draws stored zones/lines.

5) People counting/behavior detection
- `CameraWorker` can periodically send frames to AI services; results update `current_count` and/or events.

---

## Default Credentials & Setup

After signing up via `POST /api/auth/signup`, use the returned token for subsequent requests. Production deployments must set a strong `JWT_SECRET`.

---

## Coordinate Mapping Details

Why normalized coordinates?
- Keeps drawing resolution‑independent and robust to scaling/letterboxing.

Flow:
- During click: compute `(fx, fy)` in `[0,1]` inside the content box; store both pixel `(x, y)` for preview and `(fx, fy)` for saving.
- On save: fetch `frameWidth/Height`, convert `[fx*W, fy*H]` (rounded) → backend `polygon` / `p1,p2`.
- Backend overlays use the saved frame pixels, ensuring alignment with live video.

---

## Running the System

Prereqs: Docker Desktop + Compose. On Windows with WSL, LF line endings are important for YAMLs.

### Option 1 – Using the helper script (`start-system.sh`)

This script wraps `docker-compose` and basic health checks for you.

```bash
cd /path/to/AIPS               # e.g. /mnt/d/Capstone/github/AIPS on WSL
chmod +x start-system.sh       # first time only
./start-system.sh
```

What it does:
- Verifies Docker and `docker-compose` are available.
- Creates `models/` and `backend/uploads/` directories if missing.
- Runs `docker-compose up --build -d`.
- Waits briefly, then checks:
  - DB readiness
  - Backend: `http://localhost:8000/api/healthz`
  - Frontend: `http://localhost:3000`

On Windows without WSL, you can use the batch script instead:

```powershell
cd D:\Capstone\github\AIPS
start-system.bat
```

### Quick Start (Docker Compose)

Bring up the full stack (backend, frontend, db, AI services, optional stream gateway):

```bash
docker-compose up -d --build
```

Open apps:
- Frontend: http://localhost:3000
- Backend:  http://localhost:8000/api/healthz → `{ "status": "ok" }`
- API docs: http://localhost:8000/docs

Stop everything:

```bash
docker-compose down
```

Rebuild just one service (e.g., frontend) after code changes:

```bash
docker-compose build frontend
docker-compose up -d frontend
```

### Run Each Service Individually (Dev Mode)

Backend (FastAPI with reload):

```bash
cd backend
pip install -r requirements-dev.txt || pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend (Next.js dev server):

```bash
cd frontend
npm install
npm run dev
# open http://localhost:3000
```

AI – People Counting (example):

```bash
cd ai/people-counting
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

AI – Behavior Detection (example):

```bash
cd ai/behavior-detection
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8002
```

---

## Key API Endpoints (selection)

Health
- `GET /api/healthz`

Cameras
- `GET /api/cameras/`
- `POST /api/cameras/` { name, source, ai_services, … }
- `POST /api/cameras/{id}/start` | `POST /api/cameras/{id}/stop`
- `GET /api/cameras/{id}/stats` – fps, running, worker stats
- `GET /api/cameras/{id}/frame?overlay=false` – single JPEG frame
- `GET /api/cameras/{id}/stream?overlay=true` – MJPEG

Tasks (zones/lines)
- `GET /api/tasks/camera/{id}/config`
- `POST /api/tasks/camera/{id}/set` { task_type: 'zone'|'line'|'both', zones, lines }
- `POST /api/tasks/camera/{id}/clear`

Preview
- `GET /api/preview/test?source=...` – reachability check (OpenCV one‑shot; times out with friendly message)
- `GET /api/preview/stream?source=...` – ad‑hoc MJPEG stream for quick inspection

---

## Development

Frontend (Next.js):
```bash
cd frontend
npm install
npm run dev
```

Backend (FastAPI):
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Database setup:
```bash
# Database tables are automatically created on backend startup
# No manual migration steps required
```

AI services (examples):
```bash
cd ai/people-counting
uvicorn main:app --reload --port 8001

cd ai/behavior-detection
uvicorn main:app --reload --port 8002
```

---

## Theming & UI

- Global dark black‑blue style in `frontend/src/styles/globals.css`.
- `app-layout.tsx` defines sidebar/topbar. Brand logo at `/public/logo.svg`.
- Language toggle (EN/VI) in header and homepage; translation is wired in `app/page.tsx`.

---

## Troubleshooting

Preview “Connection timeout – video source not responding”
- Test directly:
```bash
curl -s "http://localhost:8000/api/preview/test?source=<RTSP>"
```
- If false: verify camera online, RTSP path/credentials, network/firewall, and that the backend host can reach the camera.

Canvas overlay misalignment
- Ensure normalized coordinates are saved; the UI fetches a real frame and scales `[fx, fy]` → frame pixels on save.

CORS
- Backend `CORSMiddleware` allows `http://localhost:3000` with credentials. Adjust `app/main.py` if needed.

---

## Where to Add New Features

- New AI rule (e.g., loitering):
  - Backend event processor in `camera_manager.py` (counter/time in zone) + endpoint to fetch events.
  - Frontend Events page with filters and evidence snapshots.

- Access control or intercom integrations:
  - Create a new router under `backend/app/api/` and service module under `services/`.

- More translations:
  - Add keys in `app/page.tsx` dictionary (or move to a shared i18n module), wire into other pages.

---

## License

MIT

