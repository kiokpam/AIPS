# 💻 Ví Dụ Code Thực Tế - AIPS Service Communication

> Tài liệu này cung cấp các ví dụ code cụ thể về cách các service trong AIPS giao tiếp với nhau.

---

## 📋 Mục Lục

1. [Frontend → Backend (REST API)](#1-frontend--backend-rest-api)
2. [Frontend → Backend (WebSocket)](#2-frontend--backend-websocket)
3. [Backend → Database (SQLAlchemy)](#3-backend--database-sqlalchemy)
4. [Backend ↔ AI Service (WebSocket)](#4-backend--ai-service-websocket)
5. [Backend → Notification Service (HTTP)](#5-backend--notification-service-http)
6. [Notification → Telegram/Email](#6-notification--telegramemail)

---

## 1. Frontend → Backend (REST API)

### Ví dụ: Lấy danh sách cameras

**Frontend Code** (`frontend/lib/api.ts`):
```typescript
// API client sử dụng fetch
export async function getCameras(): Promise<Camera[]> {
  const response = await fetch('http://localhost:8000/api/cameras/', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`, // JWT token
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data;
}

// Sử dụng trong React component
import { useEffect, useState } from 'react';

export default function CameraList() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCameras() {
      try {
        const data = await getCameras();
        setCameras(data);
      } catch (error) {
        console.error('Failed to load cameras:', error);
      } finally {
        setLoading(false);
      }
    }

    loadCameras();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {cameras.map(camera => (
        <div key={camera.id}>
          <h3>{camera.name}</h3>
          <p>Status: {camera.status}</p>
        </div>
      ))}
    </div>
  );
}
```

**Backend Code** (`backend/app/api/cameras.py`):
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import Camera
from app.schemas import CameraResponse
from app.auth import get_current_user

router = APIRouter()

@router.get("/api/cameras/", response_model=List[CameraResponse])
async def get_cameras(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Lấy danh sách tất cả cameras của organization hiện tại
    """
    # Filter cameras theo organization của user
    cameras = db.query(Camera).filter(
        Camera.store.has(organization_id=current_user.org_id)
    ).all()
    
    return cameras
```

**Request/Response Flow**:
```
1. User clicks "Cameras" page
2. Frontend gửi: GET http://localhost:8000/api/cameras/
   Headers: {
     "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   }

3. Backend nhận request:
   - Verify JWT token
   - Extract user info (org_id)
   - Query database
   
4. Database trả về cameras

5. Backend response:
   Status: 200 OK
   Body: [
     {
       "id": 1,
       "name": "Camera Entrance",
       "rtsp_url": "rtsp://...",
       "status": "active"
     },
     ...
   ]

6. Frontend render danh sách cameras
```

---

## 2. Frontend → Backend (WebSocket)

### Ví dụ: Nhận alerts real-time

**Frontend Code** (`frontend/lib/websocket.ts`):
```typescript
export class AlertWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(onAlert: (alert: Alert) => void) {
    const token = getToken();
    const wsUrl = `ws://localhost:8000/api/ws/alerts?token=${token}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      const alert = JSON.parse(event.data);
      console.log('🔔 New alert:', alert);
      onAlert(alert);
    };

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('🔌 WebSocket closed');
      this.reconnect(onAlert);
    };
  }

  private reconnect(onAlert: (alert: Alert) => void) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect(onAlert), 3000);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Sử dụng trong React component
import { useEffect } from 'react';
import { toast } from 'react-hot-toast';

export default function AlertListener() {
  useEffect(() => {
    const alertWs = new AlertWebSocket();

    alertWs.connect((alert) => {
      // Hiển thị notification
      toast.error(`⚠️ ${alert.behavior} detected at ${alert.camera_name}`, {
        duration: 5000,
        icon: '🚨',
      });

      // Play sound
      const audio = new Audio('/alert-sound.mp3');
      audio.play();
    });

    return () => alertWs.disconnect();
  }, []);

  return null; // Component này chỉ lắng nghe, không render gì
}
```

**Backend Code** (`backend/app/api/websocket.py`):
```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import List

router = APIRouter()

# Quản lý các WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"✅ Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print(f"🔌 Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Gửi message đến tất cả clients đang kết nối"""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"❌ Failed to send to client: {e}")

manager = ConnectionManager()

@router.websocket("/api/ws/alerts")
async def websocket_alerts(
    websocket: WebSocket,
    token: str = None
):
    # Verify token
    if not token or not verify_token(token):
        await websocket.close(code=1008)  # Policy violation
        return

    await manager.connect(websocket)
    
    try:
        # Keep connection alive
        while True:
            # Đợi message từ client (ping/pong)
            data = await websocket.receive_text()
            
            if data == "ping":
                await websocket.send_text("pong")
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Function để broadcast alert (được gọi từ nơi khác)
async def send_alert_to_clients(alert: dict):
    """
    Gọi function này khi có alert mới
    """
    await manager.broadcast({
        "type": "alert",
        "data": alert
    })
```

**WebSocket Flow**:
```
1. Frontend mở WebSocket connection:
   ws://localhost:8000/api/ws/alerts?token=xxx

2. Backend accept connection và lưu vào active_connections list

3. Khi có alert mới (từ AI Service):
   - Backend gọi send_alert_to_clients(alert)
   - Broadcast đến TẤT CẢ clients đang kết nối

4. Frontend nhận message:
   {
     "type": "alert",
     "data": {
       "id": 123,
       "behavior": "shoplifting",
       "camera_name": "Camera 1",
       "confidence": 0.92
     }
   }

5. Frontend hiển thị notification + play sound
```

---

## 3. Backend → Database (SQLAlchemy)

### Ví dụ: Lưu alert vào database

**Model Definition** (`backend/app/models/alert.py`):
```python
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=False)
    behavior = Column(String, nullable=False)  # "shoplifting", "violence", etc.
    confidence = Column(Float, nullable=False)
    clip_path = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    acknowledged = Column(Boolean, default=False)

    # Relationship
    camera = relationship("Camera", back_populates="alerts")

    def __repr__(self):
        return f"<Alert {self.id}: {self.behavior} at Camera {self.camera_id}>"
```

**CRUD Operations** (`backend/app/services/alert_service.py`):
```python
from sqlalchemy.orm import Session
from app.models import Alert, Camera
from datetime import datetime, timedelta

class AlertService:
    def __init__(self, db: Session):
        self.db = db

    def create_alert(self, camera_id: int, behavior: str, confidence: float, clip_path: str = None):
        """
        Tạo alert mới
        """
        alert = Alert(
            camera_id=camera_id,
            behavior=behavior,
            confidence=confidence,
            clip_path=clip_path,
            timestamp=datetime.utcnow()
        )
        
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)  # Lấy ID sau khi insert
        
        print(f"✅ Alert created: {alert.id}")
        return alert

    def get_recent_alerts(self, hours: int = 24, limit: int = 100):
        """
        Lấy alerts trong X giờ gần đây
        """
        since = datetime.utcnow() - timedelta(hours=hours)
        
        alerts = self.db.query(Alert)\
            .filter(Alert.timestamp >= since)\
            .order_by(Alert.timestamp.desc())\
            .limit(limit)\
            .all()
        
        return alerts

    def acknowledge_alert(self, alert_id: int):
        """
        Đánh dấu alert đã xem
        """
        alert = self.db.query(Alert).filter(Alert.id == alert_id).first()
        
        if not alert:
            raise ValueError(f"Alert {alert_id} not found")
        
        alert.acknowledged = True
        self.db.commit()
        
        return alert

    def get_alert_stats(self, camera_id: int = None):
        """
        Thống kê alerts theo behavior type
        """
        query = self.db.query(
            Alert.behavior,
            func.count(Alert.id).label('count'),
            func.avg(Alert.confidence).label('avg_confidence')
        )
        
        if camera_id:
            query = query.filter(Alert.camera_id == camera_id)
        
        stats = query.group_by(Alert.behavior).all()
        
        return [
            {
                "behavior": stat.behavior,
                "count": stat.count,
                "avg_confidence": round(stat.avg_confidence, 2)
            }
            for stat in stats
        ]
```

**Sử dụng trong API** (`backend/app/api/events.py`):
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.alert_service import AlertService

router = APIRouter()

@router.post("/api/events/anomaly-detected")
async def anomaly_detected(
    camera_id: int,
    behavior: str,
    confidence: float,
    clip_path: str = None,
    db: Session = Depends(get_db)
):
    """
    Endpoint này được AI Service gọi khi phát hiện anomaly
    """
    # Tạo alert service
    alert_service = AlertService(db)
    
    # Lưu alert vào database
    alert = alert_service.create_alert(
        camera_id=camera_id,
        behavior=behavior,
        confidence=confidence,
        clip_path=clip_path
    )
    
    # Broadcast đến WebSocket clients
    await send_alert_to_clients({
        "id": alert.id,
        "camera_id": camera_id,
        "behavior": behavior,
        "confidence": confidence,
        "timestamp": alert.timestamp.isoformat()
    })
    
    # Gửi notification
    await send_notification(alert)
    
    return {"status": "success", "alert_id": alert.id}
```

**SQL Queries Generated**:
```sql
-- create_alert()
INSERT INTO alerts (camera_id, behavior, confidence, clip_path, timestamp, acknowledged)
VALUES (1, 'shoplifting', 0.92, '/app/clips/camera1_shoplifting.mp4', '2025-12-15 19:30:45', false)
RETURNING id;

-- get_recent_alerts(hours=24)
SELECT * FROM alerts
WHERE timestamp >= '2025-12-14 19:30:45'
ORDER BY timestamp DESC
LIMIT 100;

-- acknowledge_alert(alert_id=123)
UPDATE alerts
SET acknowledged = true
WHERE id = 123;

-- get_alert_stats()
SELECT behavior, COUNT(id) as count, AVG(confidence) as avg_confidence
FROM alerts
GROUP BY behavior;
```

---

## 4. Backend ↔ AI Service (WebSocket)

### AI Service kết nối đến Backend

**AI Service Code** (`ai/service_mode.py`):
```python
import asyncio
import websockets
import json
import cv2
import numpy as np
from ai.yolo_detector import YOLODetector
from ai.videomae_analyzer import VideoMAEAnalyzer

class AIServiceClient:
    def __init__(self, backend_url: str, camera_id: int):
        self.backend_url = backend_url
        self.camera_id = camera_id
        self.ws_url = f"{backend_url.replace('http', 'ws')}/api/ws/detections/ai/{camera_id}"
        
        # Initialize AI models
        self.yolo = YOLODetector("models/yolov8n.onnx")
        self.videomae = VideoMAEAnalyzer("videomae/videomae_runner.onnx")
        
        print(f"🤖 AI Service initialized for Camera {camera_id}")

    async def connect_and_process(self):
        """
        Kết nối đến Backend và xử lý frames
        """
        async with websockets.connect(self.ws_url) as websocket:
            print(f"✅ Connected to Backend: {self.ws_url}")
            
            while True:
                try:
                    # Nhận frame từ Backend
                    message = await websocket.recv()
                    data = json.loads(message)
                    
                    if data["type"] == "frame":
                        # Decode frame
                        frame_bytes = base64.b64decode(data["frame"])
                        nparr = np.frombuffer(frame_bytes, np.uint8)
                        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                        
                        # Process frame
                        results = await self.process_frame(frame)
                        
                        # Gửi kết quả về Backend
                        await websocket.send(json.dumps({
                            "type": "detection_result",
                            "camera_id": self.camera_id,
                            "detections": results["detections"],
                            "fps": results["fps"]
                        }))
                
                except websockets.exceptions.ConnectionClosed:
                    print("❌ Connection closed")
                    break
                except Exception as e:
                    print(f"❌ Error: {e}")

    async def process_frame(self, frame):
        """
        Xử lý frame với YOLO + VideoMAE
        """
        # YOLO detection
        detections = self.yolo.detect(frame)
        
        # Nếu phát hiện người, phân tích hành vi
        if len(detections) > 0:
            behavior = await self.videomae.analyze(frame, detections)
            
            # Nếu phát hiện hành vi bất thường
            if behavior["type"] in ["shoplifting", "violence"]:
                # Lưu clip
                clip_path = self.save_clip(frame)
                
                # Gửi alert đến Backend
                await self.send_alert(behavior, clip_path)
        
        return {
            "detections": detections,
            "fps": 15.2
        }

    async def send_alert(self, behavior: dict, clip_path: str):
        """
        Gửi alert đến Backend qua HTTP
        """
        import httpx
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.backend_url}/api/events/anomaly-detected",
                json={
                    "camera_id": self.camera_id,
                    "behavior": behavior["type"],
                    "confidence": behavior["confidence"],
                    "clip_path": clip_path
                }
            )
            
            print(f"🚨 Alert sent: {response.status_code}")

# Main loop
async def main():
    # Lấy danh sách cameras từ Backend
    cameras = await get_cameras_from_backend()
    
    # Tạo AI Service cho mỗi camera
    tasks = []
    for camera in cameras:
        ai_service = AIServiceClient(
            backend_url="http://192.168.1.20:8000",
            camera_id=camera["id"]
        )
        tasks.append(ai_service.connect_and_process())
    
    # Run tất cả tasks concurrently
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())
```

**Backend Code** (`backend/app/api/websocket.py`):
```python
@router.websocket("/api/ws/detections/ai/{camera_id}")
async def websocket_ai_detections(
    websocket: WebSocket,
    camera_id: int
):
    """
    WebSocket endpoint cho AI Service
    """
    await websocket.accept()
    print(f"🤖 AI Service connected for Camera {camera_id}")
    
    # Lấy camera worker
    camera_worker = camera_manager.get_worker(camera_id)
    
    if not camera_worker:
        await websocket.close(code=1008)
        return
    
    try:
        while True:
            # Lấy frame mới nhất từ camera
            frame = camera_worker.get_latest_frame()
            
            if frame is not None:
                # Encode frame to base64
                _, buffer = cv2.imencode('.jpg', frame)
                frame_base64 = base64.b64encode(buffer).decode('utf-8')
                
                # Gửi frame cho AI Service
                await websocket.send_json({
                    "type": "frame",
                    "frame": frame_base64,
                    "timestamp": datetime.utcnow().isoformat()
                })
            
            # Nhận kết quả từ AI Service
            data = await websocket.receive_json()
            
            if data["type"] == "detection_result":
                # Broadcast detections đến Frontend
                await detection_manager.broadcast({
                    "camera_id": camera_id,
                    "detections": data["detections"],
                    "fps": data["fps"]
                })
            
            await asyncio.sleep(0.033)  # ~30 FPS
    
    except WebSocketDisconnect:
        print(f"🔌 AI Service disconnected for Camera {camera_id}")
```

---

## 5. Backend → Notification Service (HTTP)

**Backend Code** (`backend/app/services/notification_service.py`):
```python
import httpx
from typing import Dict

class NotificationService:
    def __init__(self, notification_url: str):
        self.notification_url = notification_url

    async def send_alert_notification(self, alert: Dict):
        """
        Gửi alert notification qua Notification Service
        """
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.notification_url}/api/notifications/send",
                    json={
                        "type": "alert",
                        "channels": ["email", "telegram", "websocket"],
                        "data": {
                            "alert_id": alert["id"],
                            "camera_name": alert["camera_name"],
                            "behavior": alert["behavior"],
                            "confidence": alert["confidence"],
                            "clip_path": alert["clip_path"],
                            "timestamp": alert["timestamp"]
                        }
                    },
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    print(f"✅ Notification sent successfully")
                else:
                    print(f"❌ Failed to send notification: {response.status_code}")
                
                return response.json()
            
            except httpx.RequestError as e:
                print(f"❌ Notification service error: {e}")
                return None
```

**Notification Service Code** (`notification-service/app/api/notifications.py`):
```python
from fastapi import APIRouter, BackgroundTasks
from app.services.email_service import EmailService
from app.services.telegram_service import TelegramService
from app.services.websocket_service import WebSocketService

router = APIRouter()

@router.post("/api/notifications/send")
async def send_notification(
    notification: NotificationRequest,
    background_tasks: BackgroundTasks
):
    """
    Nhận notification request và gửi qua các channels
    """
    channels = notification.channels
    data = notification.data
    
    # Email
    if "email" in channels:
        background_tasks.add_task(
            EmailService.send_alert_email,
            subject=f"⚠️ Alert: {data['behavior']} detected",
            body=f"Camera: {data['camera_name']}\nConfidence: {data['confidence']}\nTime: {data['timestamp']}",
            recipients=["admin@example.com"]
        )
    
    # Telegram
    if "telegram" in channels:
        background_tasks.add_task(
            TelegramService.send_alert,
            message=f"🚨 {data['behavior']} detected at {data['camera_name']}",
            clip_path=data.get('clip_path')
        )
    
    # WebSocket
    if "websocket" in channels:
        await WebSocketService.broadcast_alert(data)
    
    return {"status": "success", "channels": channels}
```

---

## 6. Notification → Telegram/Email

### Telegram Bot

**Telegram Service** (`notification-service/app/services/telegram_service.py`):
```python
import httpx
import os

class TelegramService:
    BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
    CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
    API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

    @classmethod
    async def send_alert(cls, message: str, clip_path: str = None):
        """
        Gửi alert qua Telegram
        """
        async with httpx.AsyncClient() as client:
            # Gửi text message
            await client.post(
                f"{cls.API_URL}/sendMessage",
                json={
                    "chat_id": cls.CHAT_ID,
                    "text": message,
                    "parse_mode": "HTML"
                }
            )
            
            # Gửi video clip (nếu có)
            if clip_path and os.path.exists(clip_path):
                with open(clip_path, 'rb') as video:
                    files = {'video': video}
                    data = {'chat_id': cls.CHAT_ID}
                    
                    await client.post(
                        f"{cls.API_URL}/sendVideo",
                        data=data,
                        files=files
                    )
                
                print(f"✅ Telegram alert sent with video")
            else:
                print(f"✅ Telegram alert sent")
```

### Email SMTP

**Email Service** (`notification-service/app/services/email_service.py`):
```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

class EmailService:
    SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME = os.getenv("SMTP_USERNAME")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
    FROM_ADDRESS = os.getenv("EMAIL_FROM_ADDRESS")

    @classmethod
    async def send_alert_email(cls, subject: str, body: str, recipients: list):
        """
        Gửi email alert
        """
        # Tạo email message
        message = MIMEMultipart()
        message["From"] = cls.FROM_ADDRESS
        message["To"] = ", ".join(recipients)
        message["Subject"] = subject
        
        # HTML body
        html_body = f"""
        <html>
          <body>
            <h2 style="color: #d32f2f;">🚨 Security Alert</h2>
            <p>{body}</p>
            <hr>
            <p style="color: #666; font-size: 12px;">
              This is an automated alert from AIPS Surveillance System
            </p>
          </body>
        </html>
        """
        
        message.attach(MIMEText(html_body, "html"))
        
        # Gửi email qua SMTP
        try:
            with smtplib.SMTP(cls.SMTP_HOST, cls.SMTP_PORT) as server:
                server.starttls()
                server.login(cls.SMTP_USERNAME, cls.SMTP_PASSWORD)
                server.send_message(message)
            
            print(f"✅ Email sent to {recipients}")
        
        except Exception as e:
            print(f"❌ Failed to send email: {e}")
```

---

## 🔄 Luồng Dữ Liệu Hoàn Chỉnh

### Kịch Bản: Phát Hiện Trộm Cắp End-to-End

```mermaid
sequenceDiagram
    participant C as Camera
    participant B as Backend
    participant A as AI Service
    participant D as Database
    participant N as Notification
    participant T as Telegram
    participant E as Email
    participant F as Frontend

    C->>B: RTSP stream
    B->>B: CameraWorker đọc frame
    B->>A: WebSocket: Send frame
    A->>A: YOLO detect person
    A->>A: VideoMAE analyze behavior
    A->>A: Result: "shoplifting" (0.92)
    A->>A: Save video clip
    A->>B: HTTP POST /api/events/anomaly-detected
    B->>D: INSERT INTO alerts
    D-->>B: alert_id: 123
    B->>N: HTTP POST /api/notifications/send
    N->>T: Send Telegram message + video
    N->>E: Send email alert
    N->>F: WebSocket broadcast alert
    F->>F: Show notification popup
    F->>F: Play alert sound
```

**Timeline**:
```
T+0ms:    Camera stream frame
T+50ms:   Backend gửi frame cho AI
T+100ms:  AI YOLO detection (35ms)
T+150ms:  AI VideoMAE analysis (280ms)
T+430ms:  AI gửi alert về Backend
T+450ms:  Backend lưu vào Database
T+470ms:  Backend gửi đến Notification Service
T+500ms:  Telegram message sent
T+520ms:  Email queued
T+530ms:  Frontend nhận WebSocket alert
T+540ms:  User thấy notification
```

---

## 💡 Best Practices

### 1. Error Handling
```python
# ❌ Bad
async def get_cameras():
    response = await fetch('/api/cameras')
    return response.json()

# ✅ Good
async def get_cameras():
    try:
        response = await fetch('/api/cameras')
        
        if not response.ok:
            raise HTTPException(status_code=response.status)
        
        return await response.json()
    
    except httpx.RequestError as e:
        logger.error(f"Network error: {e}")
        raise
    
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise
```

### 2. Connection Pooling
```python
# ✅ Reuse HTTP client
class APIClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=100)
        )
    
    async def close(self):
        await self.client.aclose()
```

### 3. Rate Limiting
```python
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter

@router.post("/api/events/anomaly-detected")
@limiter.limit("100/minute")  # Max 100 requests per minute
async def anomaly_detected(...):
    ...
```

---

Tài liệu này cung cấp các ví dụ code thực tế về cách các service trong AIPS giao tiếp với nhau. Bạn có thể sử dụng làm tham khảo khi phát triển các tính năng mới! 🚀
