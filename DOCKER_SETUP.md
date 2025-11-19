# 🐳 Docker Setup Guide for AIPS System

This guide will help you run the entire AIPS (AI-Powered Store Surveillance System) using Docker.

## 📋 Prerequisites

### Required Software
- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux)
- **Docker Compose** (usually included with Docker Desktop)
- **Git** (to clone the repository)

### System Requirements
- **RAM**: Minimum 8GB, Recommended 16GB+
- **Storage**: At least 10GB free space
- **GPU**: NVIDIA GPU with CUDA support (optional, for AI acceleration)
- **OS**: Windows 10+, macOS 10.15+, or Linux

## 🚀 Quick Start

### Option 1: Automated Startup (Recommended)

**For Windows:**
```bash
# Double-click the file or run in Command Prompt
start-system.bat
```

**For Linux/Mac:**
```bash
# Make script executable and run
chmod +x start-system.sh
./start-system.sh
```

### Option 2: Manual Docker Commands

```bash
# 1. Build and start all services
docker-compose up --build -d

# 2. Check service status
docker-compose ps

# 3. View logs
docker-compose logs -f
```

## 🏗️ System Architecture

The AIPS system consists of 7 microservices:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Frontend   │    │   Backend   │    │  Database   │
│ (Next.js)   │◄──►│  (FastAPI)  │◄──►│(TimescaleDB)│
│ Port: 3000  │    │ Port: 8000  │    │ Port: 5432  │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │
       │                   ├──► People Counting (8001)
       │                   ├──► Behavior Detection (8002)
       │                   └──► AI Core (8003)
       │
       └──► Stream Gateway (1935, 8554, 8888, 8889)
```

## 🔧 Service Details

### 1. **Frontend** (Port 3000)
- **Technology**: Next.js with TypeScript
- **Purpose**: User interface for camera management and analytics
- **URL**: http://localhost:3000

### 2. **Backend** (Port 8000)
- **Technology**: FastAPI with Python
- **Purpose**: Main API server and business logic
- **URL**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### 3. **Database** (Port 5432)
- **Technology**: TimescaleDB (PostgreSQL extension)
- **Purpose**: Data storage for cameras, stores, and analytics
- **Credentials**: aips/aips

### 4. **People Counting** (Port 8001)
- **Technology**: Python with YOLOv8
- **Purpose**: Real-time people counting and tracking
- **URL**: http://localhost:8001

### 5. **Behavior Detection** (Port 8002)
- **Technology**: Python with AI models
- **Purpose**: Anomaly detection and behavior analysis
- **URL**: http://localhost:8002

### 6. **AI Core** (Port 8003)
- **Technology**: Python with shared AI components
- **Purpose**: Centralized AI model management
- **URL**: http://localhost:8003
- **GPU**: Requires NVIDIA GPU with CUDA

### 7. **Stream Gateway** (Multiple Ports)
- **Technology**: MediaMTX
- **Purpose**: Video streaming and processing
- **Ports**: 1935 (RTMP), 8554 (RTSP), 8888 (HLS), 8889 (WebRTC)

## 🎯 Access Points

After starting the system, you can access:

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Main application interface |
| **Backend API** | http://localhost:8000 | REST API endpoints |
| **API Documentation** | http://localhost:8000/docs | Interactive API docs |
| **People Counting** | http://localhost:8001 | AI service for people counting |
| **Behavior Detection** | http://localhost:8002 | AI service for behavior analysis |
| **AI Core** | http://localhost:8003 | Centralized AI components |

## 🔐 Demo Credentials

Use these sample credentials to test the system:

```
Email:    manager@example.com
Password: StrongPass123!
```

## 📋 Common Commands

### System Management
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart a specific service
docker-compose restart [service-name]

# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f [service-name]

# Rebuild and restart
docker-compose down && docker-compose up --build -d
```

### Development Commands
```bash
# Start in development mode (with hot reload)
docker-compose -f docker-compose.dev.yml up --build

# Access service shell
docker-compose exec [service-name] /bin/bash

# View service status
docker-compose ps

# Check resource usage
docker stats
```

### Database Commands
```bash
# Access database
docker-compose exec db psql -U aips -d aips

# Run database migrations
docker-compose exec backend alembic upgrade head

# Backup database
docker-compose exec db pg_dump -U aips aips > backup.sql
```

## 🐛 Troubleshooting

### Common Issues

#### 1. **Port Already in Use**
```bash
# Check what's using the port
netstat -tulpn | grep :3000

# Kill process using port
sudo kill -9 [PID]

# Or change ports in docker-compose.yml
```

#### 2. **Docker Build Fails**
```bash
# Clean Docker cache
docker system prune -a

# Rebuild without cache
docker-compose build --no-cache
```

#### 3. **Services Not Starting**
```bash
# Check service logs
docker-compose logs [service-name]

# Check service status
docker-compose ps

# Restart specific service
docker-compose restart [service-name]
```

#### 4. **Database Connection Issues**
```bash
# Check database logs
docker-compose logs db

# Restart database
docker-compose restart db

# Wait for database to be ready
docker-compose exec db pg_isready -U aips
```

#### 5. **Frontend Not Loading**
```bash
# Check frontend logs
docker-compose logs frontend

# Rebuild frontend
docker-compose build frontend

# Check if backend is accessible
curl http://localhost:8000/api/healthz
```

### GPU Issues (AI Services)

#### Check GPU Support
```bash
# Check if NVIDIA Docker is installed
docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi

# Check GPU in container
docker-compose exec ai-core nvidia-smi
```

#### Fallback to CPU
If GPU is not available, edit `docker-compose.yml` and remove the GPU deployment section:
```yaml
# Remove or comment out this section
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

## 📊 Monitoring

### Health Checks
```bash
# Check all services
curl http://localhost:8000/api/healthz
curl http://localhost:8001/healthz
curl http://localhost:8002/healthz
curl http://localhost:8003/healthz
```

### Resource Monitoring
```bash
# View resource usage
docker stats

# View disk usage
docker system df

# View container sizes
docker images
```

## 🔄 Development Workflow

### 1. **Make Changes**
- Edit code in your IDE
- Changes are automatically reflected (with volume mounts)

### 2. **Test Changes**
- Access the application at http://localhost:3000
- Check API endpoints at http://localhost:8000/docs

### 3. **Debug Issues**
```bash
# View logs
docker-compose logs -f [service-name]

# Access container
docker-compose exec [service-name] /bin/bash

# Restart service
docker-compose restart [service-name]
```

## 🚀 Production Deployment

For production deployment:

1. **Update Environment Variables**
   ```bash
   # Create production environment file
   cp .env.example .env.production
   ```

2. **Use Production Docker Compose**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Set up Reverse Proxy** (Nginx/Traefik)
4. **Configure SSL Certificates**
5. **Set up Monitoring** (Prometheus/Grafana)

## 📞 Support

If you encounter issues:

1. **Check the logs**: `docker-compose logs -f`
2. **Verify prerequisites**: Docker, Docker Compose, system requirements
3. **Check service health**: Use the health check endpoints
4. **Review this guide**: Common issues and solutions

## 🎯 Next Steps

After successful startup:

1. **Open Frontend**: http://localhost:3000
2. **Login**: Use demo credentials
3. **Explore Dashboard**: View analytics and system status
4. **Add Cameras**: Test camera management features
5. **Monitor System**: Check AI services and performance

Happy testing! 🚀
