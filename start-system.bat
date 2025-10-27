@echo off
echo 🚀 Starting AIPS - AI-Powered Store Surveillance System
echo ==================================================

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker first.
    pause
    exit /b 1
)

REM Check if docker-compose is available
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ docker-compose is not installed. Please install docker-compose first.
    pause
    exit /b 1
)

REM Create models directory if it doesn't exist
if not exist "models" mkdir models

REM Create uploads directory for backend
if not exist "backend\uploads" mkdir backend\uploads

echo 📦 Building and starting all services...
echo This may take a few minutes on first run...

REM Start the system
docker-compose up --build -d

echo.
echo ⏳ Waiting for services to be ready...
timeout /t 10 /nobreak >nul

echo.
echo 🔍 Checking service health...

REM Check database
docker-compose exec -T db pg_isready -U aips >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Database: Ready
) else (
    echo ❌ Database: Not ready
)

REM Check backend
curl -s http://localhost:8000/api/healthz >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Backend API: Ready
) else (
    echo ❌ Backend API: Not ready
)

REM Check frontend
curl -s http://localhost:3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Frontend: Ready
) else (
    echo ❌ Frontend: Not ready
)

REM Check AI services
curl -s http://localhost:8001/healthz >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ People Counting: Ready
) else (
    echo ❌ People Counting: Not ready
)

curl -s http://localhost:8002/healthz >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Behavior Detection: Ready
) else (
    echo ❌ Behavior Detection: Not ready
)

curl -s http://localhost:8003/healthz >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ AI Core: Ready
) else (
    echo ❌ AI Core: Not ready
)

echo.
echo 🎉 AIPS System is starting up!
echo ==================================================
echo 📱 Frontend:     http://localhost:3000
echo 🔧 Backend API:  http://localhost:8000
echo 📊 API Docs:     http://localhost:8000/docs
echo 📹 People Count: http://localhost:8001
echo 🧠 Behavior:     http://localhost:8002
echo 🤖 AI Core:      http://localhost:8003
echo.
echo 🔐 Demo Login Credentials:
echo    Email:    admin@aips.com
echo    Password: password123
echo.
echo 📋 Useful Commands:
echo    View logs:     docker-compose logs -f [service-name]
echo    Stop system:   docker-compose down
echo    Restart:       docker-compose restart [service-name]
echo    Full rebuild:  docker-compose down ^&^& docker-compose up --build
echo.
echo 🎯 Next Steps:
echo    1. Open http://localhost:3000 in your browser
echo    2. Click 'Sign In' and use demo credentials
echo    3. Explore the dashboard and camera management
echo.
echo Happy testing! 🚀
pause
