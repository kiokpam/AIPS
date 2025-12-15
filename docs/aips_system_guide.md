# 📚 Hướng Dẫn Hiểu Hệ Thống AIPS - Dành Cho Người Mới Học Full-Stack AI

> **Mục đích**: Tài liệu này giúp bạn hiểu rõ cách hệ thống AIPS hoạt động, từ kiến trúc tổng thể đến cách các service kết nối với nhau, và cách deploy trong thực tế.

---

## 🎯 Tổng Quan Hệ Thống

**AIPS** (AI-Powered Store Surveillance System) là một hệ thống giám sát cửa hàng thông minh sử dụng AI để:
- Phát hiện hành vi bất thường (trộm cắp, bạo lực)
- Đếm số người vào/ra cửa hàng
- Quản lý camera và streaming video real-time
- Gửi cảnh báo qua Email, Telegram, WebSocket

---

## 🏗️ Kiến Trúc Hệ Thống

### Sơ Đồ Tổng Thể

```mermaid
graph TB
    subgraph "Client Layer"
        Browser["🌐 Web Browser<br/>(Người dùng)"]
    end
    
    subgraph "Frontend Service"
        NextJS["⚛️ Next.js 14<br/>Port 3000<br/>(React, TypeScript)"]
    end
    
    subgraph "Backend Service"
        FastAPI["🚀 FastAPI<br/>Port 8000<br/>(Python)"]
        CameraWorker["📹 Camera Worker<br/>(OpenCV)"]
    end
    
    subgraph "AI Service"
        AIService["🤖 AI Service<br/>(Python + GPU)"]
        YOLO["YOLO Detection"]
        DeepSORT["DeepSORT Tracking"]
        VideoMAE["VideoMAE Analysis"]
    end
    
    subgraph "Notification Service"
        NotifService["📧 Notification<br/>Port 8004<br/>(FastAPI)"]
        Email["Email SMTP"]
        Telegram["Telegram Bot"]
    end
    
    subgraph "Database"
        TimescaleDB["🗄️ TimescaleDB<br/>Port 5432<br/>(PostgreSQL)"]
    end
    
    subgraph "External"
        Camera["📷 RTSP Camera"]
    end
    
    Browser -->|HTTP/WS| NextJS
    NextJS -->|REST API| FastAPI
    NextJS -->|WebSocket| NotifService
    FastAPI -->|SQL| TimescaleDB
    FastAPI -->|WebSocket| AIService
    FastAPI -->|HTTP| NotifService
    CameraWorker -->|Read Stream| Camera
    AIService -->|HTTP| FastAPI
    AIService --> YOLO
    AIService --> DeepSORT
    AIService --> VideoMAE
    NotifService --> Email
    NotifService --> Telegram
    
    style Browser fill:#e1f5ff
    style NextJS fill:#61dafb
    style FastAPI fill:#009688
    style AIService fill:#ff6f00
    style NotifService fill:#7c4dff
    style TimescaleDB fill:#336791
```

### Giải Thích Các Service

#### 1️⃣ **Frontend Service** (Next.js)
- **Công nghệ**: Next.js 14, React, TypeScript, TailwindCSS
- **Port**: 3000
- **Vai trò**: Giao diện người dùng
- **Chức năng**:
  - Quản lý camera (thêm, xóa, start/stop)
  - Vẽ zone và line để đếm người
  - Hiển thị video stream real-time
  - Dashboard theo dõi hành vi và số người
  - Đa ngôn ngữ (EN/VI)

#### 2️⃣ **Backend Service** (FastAPI)
- **Công nghệ**: FastAPI, SQLAlchemy, OpenCV, Python
- **Port**: 8000
- **Vai trò**: API server và quản lý camera
- **Chức năng**:
  - REST API cho CRUD operations
  - WebSocket cho real-time updates
  - Quản lý `CameraWorker` (đọc stream từ camera)
  - Xác thực JWT và phân quyền RBAC
  - Lưu trữ dữ liệu vào database

#### 3️⃣ **AI Service** (Python + GPU)
- **Công nghệ**: PyTorch, ONNX Runtime, YOLO, DeepSORT
- **Vai trò**: Xử lý AI và phân tích video
- **Chức năng**:
  - **YOLO**: Phát hiện người trong frame
  - **DeepSORT**: Tracking người qua nhiều frame
  - **MobileNet**: Lọc nhanh hành vi đáng ngờ
  - **VideoMAE**: Phân tích chi tiết hành vi (trộm cắp, bạo lực)
  - Lưu video clip khi phát hiện bất thường

#### 4️⃣ **Notification Service** (FastAPI)
- **Công nghệ**: FastAPI, WebSocket, SMTP, Telegram API
- **Port**: 8004
- **Vai trò**: Gửi thông báo
- **Chức năng**:
  - WebSocket server cho frontend
  - Gửi email qua SMTP
  - Gửi thông báo qua Telegram bot
  - Broadcast alerts đến tất cả client đang kết nối

#### 5️⃣ **Database** (TimescaleDB)
- **Công nghệ**: PostgreSQL + TimescaleDB extension
- **Port**: 5432
- **Vai trò**: Lưu trữ dữ liệu
- **Dữ liệu lưu trữ**:
  - Organizations, Users, Stores
  - Cameras, Tasks (zones/lines)
  - Alerts, Video Clips
  - Time-series people counts

---

## 🔌 Cách Các Service Kết Nối Với Nhau

### 1. Luồng Dữ Liệu Chính

```mermaid
sequenceDiagram
    participant U as User Browser
    participant F as Frontend
    participant B as Backend
    participant A as AI Service
    participant N as Notification
    participant D as Database
    
    U->>F: Truy cập http://localhost:3000
    F->>B: GET /api/cameras (lấy danh sách camera)
    B->>D: Query cameras
    D-->>B: Return camera data
    B-->>F: JSON response
    F-->>U: Hiển thị danh sách camera
    
    U->>F: Click "Start Camera"
    F->>B: POST /api/cameras/{id}/start
    B->>B: Khởi động CameraWorker
    B->>A: WebSocket connection
    
    loop Real-time Processing
        B->>A: Send frame qua WebSocket
        A->>A: YOLO Detection
        A->>A: DeepSORT Tracking
        A->>A: VideoMAE Analysis
        A->>B: Send detection results
        B->>D: Save alerts (nếu có)
        B->>N: POST /api/notifications/send
        N->>U: WebSocket broadcast alert
    end
```

### 2. Ví Dụ Thực Tế: Phát Hiện Trộm Cắp

**Bước 1**: Camera ghi hình người trong cửa hàng
```
RTSP Camera → Backend CameraWorker (OpenCV đọc stream)
```

**Bước 2**: Backend gửi frame cho AI Service
```
Backend → AI Service (qua WebSocket)
Frame: 1920x1080 RGB image
```

**Bước 3**: AI xử lý
```python
# Trong AI Service
1. YOLO phát hiện: "Có 2 người trong frame"
   → Bounding boxes: [(x1,y1,w1,h1), (x2,y2,w2,h2)]

2. DeepSORT tracking: "Person ID #5 đang di chuyển"
   → Lưu lịch sử 16 frames của person #5

3. MobileNet lọc nhanh: "Person #5 có hành vi đáng ngờ"
   → Confidence: 0.85

4. VideoMAE phân tích chi tiết:
   → Kết quả: "Shoplifting" (Confidence: 0.92)
```

**Bước 4**: AI gửi kết quả về Backend
```json
{
  "camera_id": 1,
  "person_id": 5,
  "behavior": "shoplifting",
  "confidence": 0.92,
  "timestamp": "2025-12-15T19:30:45",
  "clip_path": "/app/clips/camera1_shoplifting_20251215_193045.mp4"
}
```

**Bước 5**: Backend lưu alert và gửi notification
```
Backend → Database: Lưu alert
Backend → Notification Service: POST /api/notifications/send
Notification Service → Email: Gửi email cảnh báo
Notification Service → Telegram: Gửi video clip + message
Notification Service → Frontend: WebSocket broadcast
```

**Bước 6**: Frontend hiển thị alert real-time
```
User thấy popup: "⚠️ Phát hiện trộm cắp tại Camera 1"
```

---

## 🐳 Docker và Docker Compose

### Docker Là Gì?

**Docker** giống như một "container" (thùng chứa) để đóng gói ứng dụng cùng tất cả dependencies (thư viện, môi trường) vào một package duy nhất.

**Ví dụ thực tế**:
- Không dùng Docker: "Code chạy được trên máy tôi nhưng không chạy trên máy bạn" 😢
- Dùng Docker: "Container này chạy được ở đâu cũng giống nhau" ✅

### Docker Compose Là Gì?

**Docker Compose** là công cụ để chạy nhiều container cùng lúc và kết nối chúng với nhau.

**File `docker-compose.yml`** định nghĩa:
- Service nào cần chạy
- Port nào cần expose
- Volume nào cần mount
- Environment variables
- Network giữa các service

### Phân Tích File `docker-compose.yml`

```yaml
services:
  # Service 1: Database
  db:
    image: timescale/timescaledb-ha:pg15-latest  # Image có sẵn từ Docker Hub
    container_name: aips-db
    ports:
      - "5432:5432"  # Port máy host:Port trong container
    environment:
      - POSTGRES_USER=aips
      - POSTGRES_PASSWORD=aips
    volumes:
      - db_data:/var/lib/postgresql/data  # Lưu data vào volume (không mất khi restart)
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aips"]  # Kiểm tra DB đã sẵn sàng chưa
```

**Giải thích**:
- `image`: Sử dụng image TimescaleDB có sẵn
- `ports`: Map port 5432 của container ra port 5432 của máy host
- `volumes`: Lưu data vào volume `db_data` để không mất data khi restart
- `healthcheck`: Kiểm tra xem PostgreSQL đã chạy chưa

```yaml
  # Service 2: Backend
  backend:
    build: ./backend  # Build từ Dockerfile trong thư mục backend
    container_name: aips-backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://aips:aips@db:5432/aips
    depends_on:
      - db  # Đợi db start xong mới start backend
```

**Lưu ý quan trọng**:
- `host.docker.internal`: Địa chỉ đặc biệt để container truy cập vào máy host
- `db:5432`: Trong Docker network, các container gọi nhau bằng tên service

---

## 📄 File .toml Là Gì?

### TOML (Tom's Obvious, Minimal Language)

**TOML** là định dạng file config dễ đọc, thường dùng cho Python projects.

### Phân Tích `pyproject.toml`

```toml
[project]
name = "aips-backend"
version = "0.1.0"
requires-python = ">=3.10"  # Yêu cầu Python 3.10 trở lên

dependencies = [
    "fastapi>=0.115.0",      # Web framework
    "uvicorn[standard]>=0.30.0",  # ASGI server
    "SQLAlchemy>=2.0.32",    # ORM cho database
    "opencv-python>=4.8.0",  # Xử lý video
]
```

**Mục đích**:
- Định nghĩa metadata của project (tên, version)
- Liệt kê dependencies (thư viện cần thiết)
- Cấu hình tools (pytest, coverage)

**So sánh với `requirements.txt`**:
- `requirements.txt`: Chỉ list dependencies
- `pyproject.toml`: Chuẩn mới của Python, chứa cả metadata + config tools

**Cách sử dụng**:
```bash
# Cài đặt project với dependencies
pip install -e .

# Cài đặt với optional dependencies (test)
pip install -e ".[test]"
```

---

## 📜 File .sh Là Gì?

### Shell Script

**File .sh** là shell script (bash script) - file chứa các lệnh Linux/Unix để tự động hóa tasks.

### Phân Tích `start-system.sh`

```bash
#!/bin/bash
# Dòng đầu tiên: Chỉ định interpreter (bash)

# Kiểm tra Docker có chạy không
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running"
    exit 1
fi

# Tạo thư mục cần thiết
mkdir -p backend/uploads
mkdir -p clips

# Kiểm tra model files
if [ -f "ai/models/yolov8n.onnx" ]; then
    echo "✅ YOLO model: Found"
else
    echo "⚠️  YOLO model: Missing"
fi

# Start hệ thống
docker-compose up --build -d

# Đợi services khởi động
sleep 20

# Kiểm tra health
if curl -s -f "http://localhost:8000/health" > /dev/null; then
    echo "✅ Backend API: Ready"
fi
```

**Giải thích**:
- `#!/bin/bash`: Shebang - chỉ định dùng bash để chạy script
- `if ! docker info`: Kiểm tra Docker có chạy không
- `mkdir -p`: Tạo thư mục (không báo lỗi nếu đã tồn tại)
- `> /dev/null 2>&1`: Ẩn output và error
- `docker-compose up --build -d`: 
  - `--build`: Build lại images
  - `-d`: Detached mode (chạy background)

**Cách chạy**:
```bash
# Cấp quyền thực thi
chmod +x start-system.sh

# Chạy script
./start-system.sh
```

---

## 📜 File .ps1 Là Gì? (PowerShell Script)

### PowerShell Script - Windows Automation

**File .ps1** là PowerShell script - file chứa các lệnh PowerShell để tự động hóa tasks trên Windows.

**PowerShell vs CMD**:
- **CMD (.bat)**: Shell cũ của Windows, cú pháp đơn giản nhưng hạn chế
- **PowerShell (.ps1)**: Shell hiện đại, mạnh mẽ hơn, hỗ trợ object-oriented programming

### Phân Tích `run-hybrid.ps1`

```powershell
# Comment - Dòng này là ghi chú, không thực thi

# Hiển thị text màu xanh
Write-Host "AIPS Hybrid Mode Setup" -ForegroundColor Cyan

# Kiểm tra command có tồn tại không
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker not found" -ForegroundColor Red
    exit 1  # Thoát với error code 1
}

# Try-catch để xử lý lỗi
try {
    docker info | Out-Null  # Chạy lệnh, ẩn output
    Write-Host "OK: Docker is running" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker is not running" -ForegroundColor Red
    exit 1
}

# Lưu output vào biến
$pythonVersion = python --version
Write-Host "OK: $pythonVersion" -ForegroundColor Green

# Tạo thư mục (không báo lỗi nếu đã tồn tại)
New-Item -ItemType Directory -Force -Path "backend\uploads" | Out-Null

# Chạy lệnh bình thường
docker-compose -f docker-compose.hybrid.yml up -d --build

# Đợi 10 giây
Start-Sleep -Seconds 10

# Vòng lặp for
for ($i = 1; $i -le 10; $i++) {
    Write-Host "Attempt $i/10..."
    Start-Sleep -Seconds 3
}
```

**Giải thích các thành phần**:

| Thành phần | Ý nghĩa | Ví dụ |
|------------|---------|-------|
| `Write-Host` | In text ra console | `Write-Host "Hello" -ForegroundColor Green` |
| `Get-Command` | Kiểm tra command có tồn tại | `Get-Command docker` |
| `-ErrorAction SilentlyContinue` | Không hiển thị lỗi | Dùng khi kiểm tra command |
| `\| Out-Null` | Ẩn output | `docker info \| Out-Null` |
| `$variable` | Biến | `$name = "AIPS"` |
| `exit 1` | Thoát với error code | `exit 0` = success, `exit 1` = error |
| `try-catch` | Xử lý lỗi | Giống try-catch trong Python/Java |
| `for` | Vòng lặp | `for ($i=1; $i -le 10; $i++)` |
| `if (-not ...)` | Điều kiện phủ định | `if (-not $exists)` |

### Tại Sao Dùng PowerShell?

**Ưu điểm**:
- ✅ Mạnh mẽ hơn CMD/Batch
- ✅ Hỗ trợ object-oriented
- ✅ Tích hợp sẵn trong Windows 10/11
- ✅ Có thể gọi .NET libraries
- ✅ Quản lý errors tốt hơn

**Nhược điểm**:
- ❌ Chỉ chạy trên Windows (có PowerShell Core cho Linux/Mac nhưng ít dùng)
- ❌ Execution policy có thể block script

### Execution Policy (Vấn Đề Thường Gặp)

**Lỗi**: `cannot be loaded because running scripts is disabled on this system`

**Nguyên nhân**: Windows block chạy PowerShell scripts để bảo mật

**Giải pháp**:
```powershell
# Kiểm tra policy hiện tại
Get-ExecutionPolicy

# Cho phép chạy script (chỉ cho session hiện tại)
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process

# Hoặc cho phép vĩnh viễn (cần admin)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Cách chạy an toàn hơn**:
```powershell
# Chạy mà không thay đổi policy
powershell -ExecutionPolicy Bypass -File .\run-hybrid.ps1
```

### So Sánh .sh vs .ps1

| Tính năng | .sh (Bash) | .ps1 (PowerShell) |
|-----------|------------|-------------------|
| **Platform** | Linux/Mac | Windows |
| **Cú pháp** | Unix-style | .NET-style |
| **Biến** | `$name` | `$name` |
| **Điều kiện** | `if [ -f file ]; then` | `if (Test-Path file) {` |
| **Vòng lặp** | `for i in {1..10}; do` | `for ($i=1; $i -le 10; $i++)` |
| **Pipe** | `\|` | `\|` |
| **Comment** | `#` | `#` |

### Ví Dụ Thực Tế: Tương Đương Giữa .sh và .ps1

**Bash (.sh)**:
```bash
#!/bin/bash

# Kiểm tra Docker
if ! command -v docker &> /dev/null; then
    echo "Docker not found"
    exit 1
fi

# Tạo thư mục
mkdir -p backend/uploads

# Chạy Docker
docker-compose up -d --build

# Đợi
sleep 10

echo "Done!"
```

**PowerShell (.ps1)**:
```powershell
# Kiểm tra Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker not found"
    exit 1
}

# Tạo thư mục
New-Item -ItemType Directory -Force -Path "backend\uploads"

# Chạy Docker
docker-compose up -d --build

# Đợi
Start-Sleep -Seconds 10

Write-Host "Done!"
```

### Các Cmdlets Thường Dùng

| Cmdlet | Mô tả | Ví dụ |
|--------|-------|-------|
| `Get-Command` | Tìm command | `Get-Command docker` |
| `Get-Process` | List processes | `Get-Process \| Where-Object {$_.Name -eq "docker"}` |
| `Get-Service` | List services | `Get-Service docker` |
| `Test-Path` | Kiểm tra file/folder tồn tại | `Test-Path "backend\uploads"` |
| `New-Item` | Tạo file/folder | `New-Item -ItemType Directory -Path "clips"` |
| `Copy-Item` | Copy file | `Copy-Item "file.txt" "backup.txt"` |
| `Remove-Item` | Xóa file | `Remove-Item "temp.txt"` |
| `Start-Process` | Chạy process | `Start-Process notepad` |
| `Invoke-WebRequest` | HTTP request | `Invoke-WebRequest http://localhost:8000` |

### Tips Viết PowerShell Script

**1. Sử dụng Verb-Noun naming**:
```powershell
# ✅ Good
Get-Process
New-Item
Start-Service

# ❌ Bad
process
newitem
```

**2. Xử lý errors**:
```powershell
try {
    docker info | Out-Null
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
```

**3. Sử dụng parameters**:
```powershell
param(
    [string]$Environment = "dev",
    [switch]$Verbose
)

if ($Verbose) {
    Write-Host "Running in $Environment mode"
}
```

**4. Functions**:
```powershell
function Check-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        return $false
    }
    return $true
}

if (Check-Docker) {
    Write-Host "Docker is available"
}
```

### Debug PowerShell Script

```powershell
# Chạy với verbose output
.\run-hybrid.ps1 -Verbose

# Chạy từng dòng (interactive)
powershell -NoExit -File .\run-hybrid.ps1

# Xem giá trị biến
Write-Host "Debug: pythonVersion = $pythonVersion"

# Breakpoint (trong ISE hoặc VS Code)
Set-PSBreakpoint -Script .\run-hybrid.ps1 -Line 10
```

---

## 🌐 Các Công Nghệ Được Sử Dụng

### Frontend Stack

| Công nghệ | Vai trò | Tại sao dùng |
|-----------|---------|--------------|
| **Next.js 14** | React framework | SSR, routing, optimization tự động |
| **TypeScript** | Type-safe JavaScript | Giảm bugs, autocomplete tốt hơn |
| **TailwindCSS** | CSS framework | Styling nhanh, responsive dễ dàng |
| **WebSocket** | Real-time communication | Nhận alerts và updates ngay lập tức |

**Ví dụ code Frontend**:
```typescript
// lib/api.ts - API client
export async function getCameras() {
  const response = await fetch('http://localhost:8000/api/cameras');
  return response.json();
}

// WebSocket connection
const ws = new WebSocket('ws://localhost:8000/api/ws/alerts');
ws.onmessage = (event) => {
  const alert = JSON.parse(event.data);
  showNotification(alert);
};
```

### Backend Stack

| Công nghệ | Vai trò | Tại sao dùng |
|-----------|---------|--------------|
| **FastAPI** | Web framework | Nhanh, async, auto docs (Swagger) |
| **SQLAlchemy** | ORM | Làm việc với DB bằng Python objects |
| **OpenCV** | Computer vision | Đọc video stream, xử lý frames |
| **Pydantic** | Data validation | Validate request/response tự động |
| **JWT** | Authentication | Stateless auth, scalable |

**Ví dụ code Backend**:
```python
# app/api/cameras.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter()

@router.get("/api/cameras/")
async def get_cameras(db: Session = Depends(get_db)):
    cameras = db.query(Camera).all()
    return cameras

@router.post("/api/cameras/{id}/start")
async def start_camera(id: int, db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == id).first()
    # Khởi động CameraWorker
    worker = CameraWorker(camera)
    worker.start()
    return {"status": "started"}
```

### AI Stack

| Công nghệ | Vai trò | Tại sao dùng |
|-----------|---------|--------------|
| **PyTorch** | Deep learning framework | Training và inference models |
| **ONNX Runtime** | Model inference | Chạy models nhanh hơn, GPU support |
| **YOLO** | Object detection | Phát hiện người real-time |
| **DeepSORT** | Object tracking | Track người qua nhiều frames |
| **VideoMAE** | Video understanding | Phân tích hành vi từ video |

**Ví dụ code AI**:
```python
# ai/service_mode.py
import onnxruntime as ort

# Load YOLO model
session = ort.InferenceSession("models/yolov8n.onnx")

# Inference
def detect_persons(frame):
    # Preprocess
    input_tensor = preprocess(frame)
    
    # Run inference
    outputs = session.run(None, {"images": input_tensor})
    
    # Postprocess
    boxes = postprocess(outputs)
    return boxes
```

---

## 🚀 Deploy Thực Tế: Tách Service Ra Nhiều Server

### Kịch Bản: Deploy Lên Production

Giả sử bạn có 3 servers:
- **Server 1** (192.168.1.10): Database
- **Server 2** (192.168.1.20): Backend + Notification
- **Server 3** (192.168.1.30): AI Service (có GPU)
- **Server 4** (192.168.1.40): Frontend

### Bước 1: Cấu Hình Database (Server 1)

```yaml
# docker-compose.yml trên Server 1
services:
  db:
    image: timescale/timescaledb-ha:pg15-latest
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=aips
      - POSTGRES_PASSWORD=secure_password_here
    volumes:
      - /data/postgres:/var/lib/postgresql/data
```

**Lưu ý bảo mật**:
```bash
# Cấu hình firewall chỉ cho phép Server 2 kết nối
sudo ufw allow from 192.168.1.20 to any port 5432
```

### Bước 2: Cấu Hình Backend (Server 2)

```yaml
# docker-compose.yml trên Server 2
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      # Kết nối đến DB trên Server 1
      - DATABASE_URL=postgresql://aips:secure_password@192.168.1.10:5432/aips
      - CORS_ORIGINS=http://192.168.1.40:3000
    extra_hosts:
      - "host.docker.internal:192.168.1.20"

  notification:
    build: ./notification-service
    ports:
      - "8004:8004"
    environment:
      - BACKEND_URL=http://192.168.1.20:8000
      - SMTP_HOST=smtp.gmail.com
      - SMTP_USERNAME=your-email@gmail.com
      - SMTP_PASSWORD=your-app-password
```

### Bước 3: Cấu Hình AI Service (Server 3)

```yaml
# docker-compose.yml trên Server 3
services:
  ai:
    build: ./ai
    environment:
      # Kết nối đến Backend trên Server 2
      - BACKEND_URL=http://192.168.1.20:8000
      - AI_DEVICE=cuda
    volumes:
      - /data/clips:/app/clips
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

**Cách AI Service kết nối với Backend**:
```python
# ai/service_mode.py
import websockets

BACKEND_URL = os.getenv("BACKEND_URL", "http://192.168.1.20:8000")

async def connect_to_backend():
    # WebSocket connection
    ws_url = BACKEND_URL.replace("http", "ws") + "/api/ws/detections/ai/1"
    async with websockets.connect(ws_url) as websocket:
        # Nhận frame từ backend
        frame_data = await websocket.recv()
        
        # Xử lý AI
        results = process_frame(frame_data)
        
        # Gửi kết quả về backend
        await websocket.send(json.dumps(results))
```

### Bước 4: Cấu Hình Frontend (Server 4)

```yaml
# docker-compose.yml trên Server 4
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      # Trỏ đến Backend trên Server 2
      - NEXT_PUBLIC_API_URL=http://192.168.1.20:8000
      - NEXT_PUBLIC_NOTIFICATION_URL=http://192.168.1.20:8004
```

### Bước 5: Cấu Hình Reverse Proxy (Nginx)

**Tại sao cần Nginx?**
- Expose ra ngoài internet với domain name
- SSL/TLS encryption (HTTPS)
- Load balancing
- Caching

```nginx
# /etc/nginx/sites-available/aips
server {
    listen 80;
    server_name aips.yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://192.168.1.40:3000;
        proxy_set_header Host $host;
    }

    # Backend API
    location /api/ {
        proxy_pass http://192.168.1.20:8000;
        proxy_set_header Host $host;
    }

    # WebSocket
    location /api/ws/ {
        proxy_pass http://192.168.1.20:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Notification WebSocket
    location /notifications/ws {
        proxy_pass http://192.168.1.20:8004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**Cài đặt SSL với Let's Encrypt**:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d aips.yourdomain.com
```

### Sơ Đồ Deploy Production

```mermaid
graph TB
    subgraph "Internet"
        User["👤 Users"]
    end
    
    subgraph "DMZ - Public"
        Nginx["🔒 Nginx Reverse Proxy<br/>SSL Termination<br/>aips.yourdomain.com"]
    end
    
    subgraph "Server 4 - Frontend"
        Frontend["⚛️ Next.js<br/>192.168.1.40:3000"]
    end
    
    subgraph "Server 2 - Application"
        Backend["🚀 FastAPI Backend<br/>192.168.1.20:8000"]
        Notification["📧 Notification Service<br/>192.168.1.20:8004"]
    end
    
    subgraph "Server 3 - AI Processing"
        AI["🤖 AI Service<br/>192.168.1.30<br/>NVIDIA GPU"]
    end
    
    subgraph "Server 1 - Database"
        DB["🗄️ TimescaleDB<br/>192.168.1.10:5432"]
    end
    
    User -->|HTTPS| Nginx
    Nginx -->|HTTP| Frontend
    Nginx -->|HTTP/WS| Backend
    Nginx -->|WS| Notification
    Frontend -.->|API Calls| Backend
    Backend -->|SQL| DB
    Backend <-->|WebSocket| AI
    Backend -->|HTTP| Notification
    
    style User fill:#e1f5ff
    style Nginx fill:#00c853
    style Frontend fill:#61dafb
    style Backend fill:#009688
    style AI fill:#ff6f00
    style DB fill:#336791
```

---

## 🔐 Bảo Mật Khi Deploy

### 1. Environment Variables

**❌ Không nên**:
```yaml
environment:
  - POSTGRES_PASSWORD=123456  # Hard-code password
```

**✅ Nên làm**:
```bash
# .env file (không commit lên Git)
POSTGRES_PASSWORD=super_secure_random_password_here
JWT_SECRET=another_random_secret_key
SMTP_PASSWORD=gmail_app_password

# docker-compose.yml
environment:
  - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
  - JWT_SECRET=${JWT_SECRET}
```

### 2. Network Isolation

```yaml
# docker-compose.yml
networks:
  frontend-network:
  backend-network:
  database-network:

services:
  frontend:
    networks:
      - frontend-network
  
  backend:
    networks:
      - frontend-network
      - backend-network
      - database-network
  
  db:
    networks:
      - database-network  # Chỉ backend mới access được
```

### 3. Firewall Rules

```bash
# Chỉ cho phép Nginx kết nối đến Frontend
sudo ufw allow from <nginx-ip> to any port 3000

# Chỉ cho phép Backend kết nối đến Database
sudo ufw allow from 192.168.1.20 to any port 5432

# Block tất cả traffic khác
sudo ufw default deny incoming
sudo ufw enable
```

---

## 📊 Monitoring và Logging

### 1. Xem Logs

```bash
# Xem logs tất cả services
docker-compose logs -f

# Xem logs một service cụ thể
docker-compose logs -f backend

# Xem 100 dòng cuối
docker-compose logs --tail=100 ai

# Lọc logs theo thời gian
docker-compose logs --since 2025-12-15T10:00:00
```

### 2. Health Checks

```yaml
# docker-compose.yml
services:
  backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### 3. Resource Monitoring

```bash
# Xem resource usage
docker stats

# Output:
CONTAINER ID   NAME              CPU %   MEM USAGE / LIMIT
abc123         aips-backend      15.2%   512MB / 2GB
def456         aips-ai           85.3%   3.5GB / 8GB
```

---

## 🎓 Tổng Kết: Roadmap Học Full-Stack AI

### 1. Frontend (2-3 tháng)
- [ ] HTML/CSS/JavaScript cơ bản
- [ ] React fundamentals
- [ ] Next.js framework
- [ ] TypeScript
- [ ] WebSocket client
- [ ] State management (Context API, Zustand)

### 2. Backend (2-3 tháng)
- [ ] Python cơ bản
- [ ] FastAPI framework
- [ ] SQLAlchemy ORM
- [ ] PostgreSQL
- [ ] JWT authentication
- [ ] WebSocket server
- [ ] RESTful API design

### 3. AI/ML (3-4 tháng)
- [ ] Python for Data Science (NumPy, Pandas)
- [ ] Computer Vision (OpenCV)
- [ ] Deep Learning (PyTorch)
- [ ] Object Detection (YOLO)
- [ ] Object Tracking (DeepSORT)
- [ ] Model deployment (ONNX)

### 4. DevOps (1-2 tháng)
- [ ] Docker basics
- [ ] Docker Compose
- [ ] Linux command line
- [ ] Nginx reverse proxy
- [ ] CI/CD (GitHub Actions)
- [ ] Cloud deployment (AWS/GCP)

---

## 💡 Tips Học Tập

### 1. Học Từng Phần Nhỏ
Đừng cố học hết một lúc. Bắt đầu với:
1. Chạy được hệ thống local
2. Hiểu flow một feature (ví dụ: thêm camera)
3. Sửa một bug nhỏ
4. Thêm một feature đơn giản

### 2. Debug Hiệu Quả
```bash
# Kiểm tra service có chạy không
docker-compose ps

# Vào trong container để debug
docker exec -it aips-backend bash

# Kiểm tra network giữa containers
docker exec aips-backend ping aips-db

# Kiểm tra logs real-time
docker-compose logs -f backend | grep ERROR
```

### 3. Tài Nguyên Học Tập
- **Frontend**: [Next.js Tutorial](https://nextjs.org/learn)
- **Backend**: [FastAPI Documentation](https://fastapi.tiangolo.com/)
- **Docker**: [Docker Get Started](https://docs.docker.com/get-started/)
- **AI**: [PyTorch Tutorials](https://pytorch.org/tutorials/)

---

## ❓ FAQ

### Q1: Tại sao dùng WebSocket thay vì HTTP polling?
**A**: WebSocket cho phép server push data đến client ngay lập tức, không cần client liên tục hỏi. Tiết kiệm bandwidth và giảm latency.

### Q2: TimescaleDB khác gì PostgreSQL?
**A**: TimescaleDB là extension của PostgreSQL, tối ưu cho time-series data (dữ liệu theo thời gian). Phù hợp cho việc lưu people counts theo giờ/ngày.

### Q3: Tại sao AI Service cần GPU?
**A**: Deep learning models (YOLO, VideoMAE) chạy nhanh hơn 10-100 lần trên GPU so với CPU. Cần thiết cho real-time processing.

### Q4: Có thể chạy hệ thống mà không có GPU không?
**A**: Có, nhưng sẽ chậm hơn nhiều. Thay đổi `AI_DEVICE=cpu` trong docker-compose.yml.

### Q5: Làm sao để scale hệ thống khi có nhiều camera?
**A**: 
- Chạy nhiều AI Service instances (horizontal scaling)
- Dùng message queue (RabbitMQ, Redis) để distribute tasks
- Load balancer cho Backend

---

## 📞 Kết Luận

Hệ thống AIPS là một ví dụ tuyệt vời về full-stack AI application, bao gồm:
- ✅ Modern frontend (Next.js)
- ✅ Scalable backend (FastAPI)
- ✅ Real-time communication (WebSocket)
- ✅ AI/ML integration (YOLO, DeepSORT, VideoMAE)
- ✅ Containerization (Docker)
- ✅ Production-ready architecture

Chúc bạn học tập hiệu quả! 🚀
