"""
WebSocket Endpoints
Real-time notification delivery via WebSocket
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Optional
import logging
from ..services.websocket_manager import ws_manager
from ..config.settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


async def authenticate_token(token: str, backend_url: str) -> dict:
    """
    Authenticate JWT token by calling backend API.
    """
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{backend_url}/api/auth/verify-token",
                params={"token": token},
                timeout=5.0
            )
            if response.status_code == 200:
                return response.json()
            else:
                raise Exception(f"Token verification failed: {response.status_code}")
    except Exception as e:
        logger.error(f"Token authentication failed: {e}")
        raise


@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """
    WebSocket endpoint for real-time alert/behavior detection updates.
    
    Clients must provide ?token=<JWT> query parameter. Connections are grouped by organization,
    and broadcasts are scoped to the organization of the authenticated membership.
    """
    token = websocket.query_params.get("token")
    
    try:
        try:
            current = await authenticate_token(token, settings.backend_url)
        except Exception as exc:
            # Authentication failure - close with 4401 (unauthorized)
            await websocket.close(code=4401, reason=str(exc))
            return

        # Extract org_id from user data
        org_id = None
        if isinstance(current, dict):
            # Backend returns org_id directly
            org_id = current.get("org_id")
        
        if not org_id:
            await websocket.close(code=4403, reason="Organization ID not found in token")
            return

        await ws_manager.connect(org_id, websocket)

        try:
            while True:
                # Keep the connection open; we don't expect messages from the client.
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            ws_manager.disconnect(org_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass

