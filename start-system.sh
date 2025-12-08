#!/bin/bash

# AIPS System Startup Script
echo "🚀 Starting AIPS - AI-Powered Store Surveillance System"
echo "=================================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install docker-compose first."
    exit 1
fi

# Create necessary directories
mkdir -p backend/uploads
mkdir -p clips

# Check AI model files
echo ""
echo "🔍 Checking AI model files..."
if [ -f "ai/models/yolov8n.onnx" ]; then
    echo "✅ YOLO model: Found"
else
    echo "⚠️  YOLO model: Missing (ai/models/yolov8n.onnx)"
fi

if [ -f "ai/models/mobilenet.onnx" ]; then
    echo "✅ MobileNet model: Found"
else
    echo "⚠️  MobileNet model: Missing (ai/models/mobilenet.onnx)"
fi

if [ -f "ai/videomae/videomae_runner.onnx" ] || [ -f "ai/videomae/videomae.onnx" ]; then
    echo "✅ VideoMAE model: Found"
    if [ -f "ai/videomae/videomae_runner.onnx" ]; then
        echo "   (Using videomae_runner.onnx)"
    else
        echo "   (Using videomae.onnx)"
    fi
else
    echo "⚠️  VideoMAE model: Missing (optional - ai/videomae/videomae_runner.onnx or videomae.onnx)"
fi

echo ""
echo "📦 Building and starting all services..."
echo "This may take a few minutes on first run..."

# Stop any existing containers first
docker-compose down 2>/dev/null

# Start the system
docker-compose up --build -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 20

# Check service health
echo ""
echo "🔍 Checking service health..."

# Function to check HTTP endpoint with retries
check_http_endpoint() {
    local url=$1
    local max_attempts=5
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f --max-time 5 "$url" > /dev/null 2>&1; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 3
    done
    return 1
}

# Check database
if docker-compose exec -T db pg_isready -U aips > /dev/null 2>&1; then
    echo "✅ Database: Ready"
else
    echo "❌ Database: Not ready"
fi

# Check backend
if check_http_endpoint "http://localhost:8000/health"; then
    echo "✅ Backend API: Ready"
else
    echo "⚠️  Backend API: Starting... (check logs with: docker-compose logs backend)"
fi

# Check frontend
if check_http_endpoint "http://localhost:3000"; then
    echo "✅ Frontend: Ready"
else
    echo "⚠️  Frontend: Starting... (check logs with: docker-compose logs frontend)"
fi

# Check AI service
if docker-compose ps ai 2>/dev/null | grep -q "Up"; then
    echo "✅ AI Service: Running"
else
    echo "⚠️  AI Service: Starting... (check logs with: docker-compose logs ai)"
fi

echo ""
echo "🎉 AIPS System is starting up!"
echo "=================================================="
echo ""
echo "🌐 Access Points:"
echo "   📱 Frontend:     http://localhost:3000"
echo "   🔧 Backend API:  http://localhost:8000"
echo "   📊 API Docs:     http://localhost:8000/docs"
echo ""
echo "🤖 AI Services:"
echo "   • In/Out Counting (requires 2 lines drawn on camera)"
echo "   • Behavior Detection (requires zone polygon on camera)"
echo ""
echo "📋 Docker Commands:"
echo "   View all logs:    docker-compose logs -f"
echo "   View AI logs:     docker-compose logs -f ai"
echo "   Stop system:      docker-compose down"
echo "   Restart service:  docker-compose restart [service-name]"
echo ""
echo "🎯 Quick Start:"
echo "   1. Open http://localhost:3000"
echo "   2. Register a new account (first user becomes manager)"
echo "   3. Create a store and add cameras"
echo "   4. Draw lines (In/Out) or zones (Behavior) on cameras"
echo "   5. Check dashboards for real-time AI analytics!"
echo ""
echo "Happy testing! 🚀"
