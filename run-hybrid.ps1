# Script chay he thong AIPS o che do Hybrid
# AI, Frontend, Notification: Docker
# Backend: Local (Python)

Write-Host "AIPS Hybrid Mode Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Kiem tra Docker
Write-Host "Checking Docker..." -ForegroundColor Yellow
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

# Kiem tra Docker dang chay
try {
    docker info | Out-Null
    Write-Host "OK: Docker is running" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Kiem tra Python
Write-Host ""
Write-Host "Checking Python..." -ForegroundColor Yellow
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Python not found. Please install Python 3.10+." -ForegroundColor Red
    exit 1
}
$pythonVersion = python --version
Write-Host "OK: $pythonVersion" -ForegroundColor Green

# Tao thu muc can thiet
Write-Host ""
Write-Host "Creating directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "backend\uploads" | Out-Null
New-Item -ItemType Directory -Force -Path "clips" | Out-Null
Write-Host "OK: Directories created" -ForegroundColor Green

# Start Docker services (DB, Frontend, AI, Notification)
Write-Host ""
Write-Host "Starting Docker services (DB, Frontend, AI, Notification)..." -ForegroundColor Yellow
docker-compose -f docker-compose.hybrid.yml up -d --build

# Doi Database khoi dong
Write-Host ""
Write-Host "Waiting for Database to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

$dbReady = $false
for ($i = 1; $i -le 10; $i++) {
    try {
        docker exec aips-db pg_isready -U aips | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $dbReady = $true
            break
        }
    } catch {}
    Write-Host "   Attempt $i/10..." -ForegroundColor Gray
    Start-Sleep -Seconds 3
}

if ($dbReady) {
    Write-Host "OK: Database is ready" -ForegroundColor Green
} else {
    Write-Host "WARNING: Database may not be ready yet" -ForegroundColor Yellow
}

# Huong dan chay Backend local
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Next Steps: Run Backend Locally" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Mo terminal moi va chay cac lenh sau:" -ForegroundColor White
Write-Host ""
Write-Host "# Buoc 1: Vao thu muc backend" -ForegroundColor Yellow
Write-Host 'cd "c:\Users\quang\OneDrive\Desktop\AIPS-master (1)\AIPS-master\backend"' -ForegroundColor Green
Write-Host ""
Write-Host "# Buoc 2: Cai dat dependencies (chi can lam 1 lan)" -ForegroundColor Yellow
Write-Host "pip install -e ." -ForegroundColor Green
Write-Host ""
Write-Host "# Buoc 3: Chay Backend" -ForegroundColor Yellow
Write-Host "uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor Green
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Access Points" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Frontend:        http://localhost:3000" -ForegroundColor White
Write-Host "Backend (local): http://localhost:8000" -ForegroundColor White
Write-Host "API Docs:        http://localhost:8000/docs" -ForegroundColor White
Write-Host "Notification:    http://localhost:8004" -ForegroundColor White
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Docker Services Status" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
docker-compose -f docker-compose.hybrid.yml ps
Write-Host ""
Write-Host "Tips:" -ForegroundColor Yellow
Write-Host "- Xem logs Docker: docker-compose -f docker-compose.hybrid.yml logs -f [service]" -ForegroundColor Gray
Write-Host "- Stop Docker: docker-compose -f docker-compose.hybrid.yml down" -ForegroundColor Gray
Write-Host "- Backend se auto-reload khi ban sua code (--reload flag)" -ForegroundColor Gray
Write-Host ""

