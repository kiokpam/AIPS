# 🔄 AIPS Hybrid Setup Guide

Hướng dẫn chạy hệ thống AIPS ở chế độ Hybrid:
- **Docker**: AI Service, Frontend, Notification Service, Database
- **Local**: Backend (để dễ debug và sửa code)

---

## 🎯 Lợi Ích Của Hybrid Setup

✅ **Backend chạy local**:
- Sửa code và thấy kết quả ngay lập tức (hot reload)
- Dễ debug với breakpoints
- Không cần rebuild Docker image
- Truy cập trực tiếp vào webcam/thiết bị local

✅ **Services khác chạy Docker**:
- AI Service cần GPU (dễ hơn với Docker)
- Frontend và Notification ổn định, ít thay đổi
- Database cần persistent storage

---

## 🚀 Cách 1: Sử Dụng Script Tự Động (Khuyên Dùng)

### Bước 1: Chạy script
```powershell
cd path\to\AIPS
.\run-hybrid.ps1
```

Script sẽ tự động:
- ✅ Kiểm tra Docker và Python
- ✅ Tạo thư mục cần thiết
- ✅ Start Docker services (DB, Frontend, AI, Notification)
- ✅ Đợi Database sẵn sàng
- ✅ Hiển thị hướng dẫn chạy Backend

### Bước 2: Chạy Backend (terminal mới)
```powershell
# Vào thư mục backend
cd path\to\AIPS\backend

# Cài đặt dependencies (chỉ cần làm 1 lần)
pip install -e .

# Chạy Backend với auto-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 🔧 Cách 2: Chạy Thủ Công (Chi Tiết)

### Bước 1: Start Docker Services

```powershell
cd path\to\AIPS

# Tạo thư mục
New-Item -ItemType Directory -Force -Path "backend\uploads"
New-Item -ItemType Directory -Force -Path "clips"

# Start Docker services
docker-compose -f docker-compose.hybrid.yml up -d --build
```

### Bước 2: Kiểm Tra Docker Services

```powershell
# Xem status
docker-compose -f docker-compose.hybrid.yml ps

# Xem logs
docker-compose -f docker-compose.hybrid.yml logs -f

# Kiểm tra Database
docker exec aips-db pg_isready -U aips
```

### Bước 3: Setup Backend Local

```powershell
# Vào thư mục backend
cd backend

# Tạo virtual environment (khuyên dùng)
python -m venv venv
.\venv\Scripts\Activate.ps1

# Cài đặt dependencies
pip install --upgrade pip
pip install -e .

# Kiểm tra cài đặt
pip list | Select-String "fastapi"
```

### Bước 4: Chạy Backend

```powershell
# Với auto-reload (development)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Hoặc không reload (nhanh hơn)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Output mong đợi**:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [12345] using WatchFiles
INFO:     Started server process [12346]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

---

## 🌐 Access Points

| Service | URL | Mô tả |
|---------|-----|-------|
| Frontend | http://localhost:3000 | Web UI |
| Backend | http://localhost:8000 | API Server (local) |
| API Docs | http://localhost:8000/docs | Swagger UI |
| Notification | http://localhost:8004 | Notification Service |
| Database | localhost:5432 | PostgreSQL |

---

## 🔍 Kiểm Tra Kết Nối

### 1. Kiểm tra Backend
```powershell
# Health check
curl http://localhost:8000/health

# Hoặc mở browser
start http://localhost:8000/docs
```

### 2. Kiểm tra Frontend kết nối Backend
```powershell
# Mở browser
start http://localhost:3000

# Kiểm tra console (F12) xem có lỗi kết nối không
```

### 3. Kiểm tra AI Service kết nối Backend
```powershell
# Xem logs AI Service
docker-compose -f docker-compose.hybrid.yml logs -f ai

# Tìm dòng: "Connected to Backend" hoặc "WebSocket connected"
```

---

## 🐛 Troubleshooting

### ❌ Backend không kết nối Database

**Lỗi**: `could not connect to server: Connection refused`

**Giải pháp**:
```powershell
# Kiểm tra Database đang chạy
docker ps | Select-String "aips-db"

# Kiểm tra port 5432
netstat -an | Select-String "5432"

# Restart Database
docker-compose -f docker-compose.hybrid.yml restart db
```

### ❌ AI Service không kết nối Backend

**Lỗi**: `Connection refused` hoặc `WebSocket connection failed`

**Giải pháp**:
1. Đảm bảo Backend đang chạy trên port 8000
2. Kiểm tra firewall không block port 8000
3. Xem logs AI Service:
```powershell
docker-compose -f docker-compose.hybrid.yml logs -f ai
```

### ❌ Frontend không load được

**Lỗi**: `Failed to fetch` hoặc `Network error`

**Giải pháp**:
```powershell
# Rebuild Frontend
docker-compose -f docker-compose.hybrid.yml up -d --build frontend

# Xem logs
docker-compose -f docker-compose.hybrid.yml logs -f frontend
```

### ❌ Backend lỗi "Module not found"

**Giải pháp**:
```powershell
cd backend
pip install -e .
```

---

## 📊 Xem Logs

```powershell
# Tất cả Docker services
docker-compose -f docker-compose.hybrid.yml logs -f

# Một service cụ thể
docker-compose -f docker-compose.hybrid.yml logs -f ai
docker-compose -f docker-compose.hybrid.yml logs -f frontend
docker-compose -f docker-compose.hybrid.yml logs -f notification

# Backend (local) - xem trực tiếp trong terminal đang chạy uvicorn
```

---

## 🛑 Stop Services

### Stop Docker Services
```powershell
docker-compose -f docker-compose.hybrid.yml down
```

### Stop Backend
```
Ctrl + C trong terminal đang chạy uvicorn
```

### Stop tất cả và xóa volumes
```powershell
docker-compose -f docker-compose.hybrid.yml down -v
```

---

## 🔄 Restart Services

### Restart một Docker service
```powershell
docker-compose -f docker-compose.hybrid.yml restart ai
docker-compose -f docker-compose.hybrid.yml restart frontend
```

### Restart Backend
```
Ctrl + C rồi chạy lại lệnh uvicorn
```

---

## 💡 Tips Development

### 1. Auto-reload Backend
Backend đã có `--reload` flag, mọi thay đổi code sẽ tự động reload.

### 2. Hot-reload Frontend
Frontend trong Docker đã mount volume, nhưng có thể chậm. Nếu muốn nhanh hơn:
```powershell
# Stop Frontend Docker
docker stop aips-frontend

# Chạy Frontend local
cd frontend
npm install
npm run dev
```

### 3. Debug Backend với VS Code
Tạo file `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": [
        "app.main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", "8000"
      ],
      "cwd": "${workspaceFolder}/backend",
      "env": {
        "DATABASE_URL": "postgresql://aips:aips@localhost:5432/aips"
      }
    }
  ]
}
```

Sau đó nhấn F5 để debug với breakpoints!

---

## 📝 Environment Variables

Backend local cần các biến môi trường. Tạo file `backend/.env`:

```env
# Database
DATABASE_URL=postgresql://aips:aips@localhost:5432/aips

# JWT
JWT_SECRET=dev-secret-change-me
JWT_EXPIRES_SECONDS=3600

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:8000

# Clips
CLIPS_DIR=../clips
```

---

## 🎯 Khi Nào Dùng Hybrid Setup?

✅ **Nên dùng khi**:
- Đang develop/debug Backend
- Cần access webcam/thiết bị local
- Muốn sửa code Backend nhanh
- Đang học và muốn hiểu Backend hoạt động như nào

❌ **Không nên dùng khi**:
- Deploy production (dùng full Docker)
- Cần consistency giữa các môi trường
- Chia sẻ với team (dùng full Docker dễ hơn)

---

## 🚀 Quay Lại Full Docker

Khi muốn chạy tất cả trong Docker:
```powershell
# Stop hybrid
docker-compose -f docker-compose.hybrid.yml down

# Start full Docker
docker-compose up -d --build
```

---

**Happy coding!** 🎉
