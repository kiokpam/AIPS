# Notification Service

AIPS Notification Service - Handles all notifications (WebSocket, Email, Telegram)

## Features

- **WebSocket Notifications**: Real-time alerts to frontend
- **Email Notifications**: Password reset, system emails
- **Telegram Notifications**: Alert videos and messages

## Environment Variables

```bash
# Backend URL for token verification
BACKEND_URL=http://backend:8000

# Frontend URL for email links
FRONTEND_URL=http://localhost:3000

# Email Configuration
EMAIL_PROVIDER=console  # console, smtp, sendgrid
EMAIL_FROM_ADDRESS=noreply@aips.local
EMAIL_FROM_NAME=AIPS
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_password
SMTP_USE_TLS=true

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
TELEGRAM_MAX_RETRIES=3
TELEGRAM_RETRY_DELAY=5
```

## API Endpoints

### POST /notifications/send
Send notification through specified channels.

```json
{
  "org_id": "org_123",
  "type": "alert",
  "channels": ["websocket", "telegram", "email"],
  "data": {
    "alert": {...},
    "to_email": "user@example.com",
    "subject": "Alert",
    "html_content": "<html>...</html>",
    "message": "Alert message",
    "video_path": "/app/clips/alert.mp4"
  }
}
```

### POST /notifications/telegram/video
Send video to Telegram directly.

### POST /notifications/telegram/message
Send text message to Telegram directly.

### WebSocket: /ws/alerts
Real-time alert notifications for frontend.

## Running

```bash
# With Docker
docker-compose up notification

# Or directly
uvicorn app.main:app --host 0.0.0.0 --port 8004
```

