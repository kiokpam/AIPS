from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
import httpx
import logging

from app.api.deps import get_db, get_current_membership, require_manager
from app.models.core import TelegramSettings
from app.schemas.telegram import (
    TelegramSettingsCreate,
    TelegramSettingsResponse,
    TelegramTestRequest,
    TelegramTestResponse
)

router = APIRouter(prefix="/api/telegram", tags=["telegram"])
logger = logging.getLogger(__name__)


@router.get("/settings", response_model=TelegramSettingsResponse)
def get_telegram_settings(
    current = Depends(get_current_membership),
    db: Session = Depends(get_db)
):
    """Get Telegram settings for current organization"""
    settings = db.query(TelegramSettings).filter(
        TelegramSettings.org_id == current.organization.id
    ).first()
    
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Telegram settings not configured for this organization"
        )
    
    return settings


@router.post("/settings", response_model=TelegramSettingsResponse)
def create_or_update_telegram_settings(
    data: TelegramSettingsCreate,
    current = Depends(require_manager),  # Only managers can configure
    db: Session = Depends(get_db)
):
    """Create or update Telegram settings (Manager only)"""
    settings = db.query(TelegramSettings).filter(
        TelegramSettings.org_id == current.organization.id
    ).first()
    
    if settings:
        # Update existing
        settings.bot_token = data.bot_token
        settings.chat_id = data.chat_id
        settings.enabled = data.enabled
        settings.updated_at = datetime.utcnow()
    else:
        # Create new
        settings = TelegramSettings(
            org_id=current.organization.id,
            bot_token=data.bot_token,
            chat_id=data.chat_id,
            enabled=data.enabled
        )
        db.add(settings)
    
    db.commit()
    db.refresh(settings)
    
    logger.info(f"Telegram settings {'updated' if settings else 'created'} for org {current.organization.id}")
    return settings


@router.post("/test", response_model=TelegramTestResponse)
async def test_telegram_connection(
    data: TelegramTestRequest,
    current = Depends(require_manager)
):
    """Test Telegram bot connection (Manager only)"""
    try:
        url = f"https://api.telegram.org/bot{data.bot_token}/sendMessage"
        
        # Professional test message with system introduction
        test_message = """
🤖 *AIPS - AI-Powered Surveillance System*

✅ *Kết nối thành công!*

Hệ thống giám sát thông minh AIPS đã được kết nối với Telegram của bạn.

📋 *Bạn sẽ nhận được thông báo khi:*
• Phát hiện hành vi trộm cắp (Shoplifting)
• Phát hiện hành vi bạo lực (Violence)

📹 *Kèm theo:*
• Video clip ghi lại sự kiện
• Thông tin camera và thời gian
• Độ tin cậy của cảnh báo

⚙️ Cấu hình này có thể thay đổi bất cứ lúc nào trong phần Settings.

_Powered by AIPS Team_
        """.strip()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={
                    "chat_id": data.chat_id,
                    "text": test_message,
                    "parse_mode": "Markdown"  # Enable Markdown formatting
                },
                timeout=10.0
            )
            
            if response.status_code == 200:
                logger.info(f"Telegram test successful for chat_id: {data.chat_id}")
                return TelegramTestResponse(
                    success=True,
                    message="✅ Kết nối thành công! Kiểm tra Telegram của bạn để xem tin nhắn chào mừng."
                )
            else:
                error_data = response.json()
                error_msg = error_data.get('description', 'Unknown error')
                logger.warning(f"Telegram test failed: {error_msg}")
                return TelegramTestResponse(
                    success=False,
                    message=f"❌ Lỗi: {error_msg}"
                )
                
    except httpx.TimeoutException:
        logger.error("Telegram test timeout")
        return TelegramTestResponse(
            success=False,
            message="⏱️ Timeout: Không thể kết nối đến Telegram. Kiểm tra lại Bot Token."
        )
    except httpx.HTTPError as e:
        logger.error(f"Telegram test HTTP error: {e}")
        return TelegramTestResponse(
            success=False,
            message=f"❌ Lỗi kết nối: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Telegram test unexpected error: {e}")
        return TelegramTestResponse(
            success=False,
            message=f"❌ Lỗi không xác định: {str(e)}"
        )
