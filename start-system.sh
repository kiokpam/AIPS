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

# Create models directory if it doesn't exist
mkdir -p models

# Create uploads directory for backend
mkdir -p backend/uploads

echo "📦 Building and starting all services..."
echo "This may take a few minutes on first run..."

# Start the system
docker-compose up --build -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo ""
echo "🔍 Checking service health..."

# Check database
if docker-compose exec -T db pg_isready -U aips > /dev/null 2>&1; then
    echo "✅ Database: Ready"
else
    echo "❌ Database: Not ready"
fi

# Check backend
if curl -s http://localhost:8000/api/healthz > /dev/null 2>&1; then
    echo "✅ Backend API: Ready"
else
    echo "❌ Backend API: Not ready"
fi

# Check frontend
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend: Ready"
else
    echo "❌ Frontend: Not ready"
fi

# Check AI services
if curl -s http://localhost:8001/healthz > /dev/null 2>&1; then
    echo "✅ People Counting: Ready"
else
    echo "❌ People Counting: Not ready"
fi

if curl -s http://localhost:8002/healthz > /dev/null 2>&1; then
    echo "✅ Behavior Detection: Ready"
else
    echo "❌ Behavior Detection: Not ready"
fi

if curl -s http://localhost:8003/healthz > /dev/null 2>&1; then
    echo "✅ AI Core: Ready"
else
    echo "❌ AI Core: Not ready"
fi

echo ""
echo "🎉 AIPS System is starting up!"
echo "=================================================="
echo "📱 Frontend:     http://localhost:3000"
echo "🔧 Backend API:  http://localhost:8000"
echo "📊 API Docs:     http://localhost:8000/docs"
echo "📹 People Count: http://localhost:8001"
echo "🧠 Behavior:     http://localhost:8002"
echo "🤖 AI Core:      http://localhost:8003"
echo ""
echo "🔐 Demo Login Credentials:"
echo "   Email:    admin@aips.com"
echo "   Password: password123"
echo ""
echo "📋 Useful Commands:"
echo "   View logs:     docker-compose logs -f [service-name]"
echo "   Stop system:   docker-compose down"
echo "   Restart:       docker-compose restart [service-name]"
echo "   Full rebuild:  docker-compose down && docker-compose up --build"
echo ""
echo "🎯 Next Steps:"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Click 'Sign In' and use demo credentials"
echo "   3. Explore the dashboard and camera management"
echo ""
echo "Happy testing! 🚀"
