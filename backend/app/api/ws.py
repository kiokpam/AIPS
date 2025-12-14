from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import logging

from app.api.deps import authenticate_token
from app.db.session import SessionLocal
from app.services.websocket_manager import inout_ws_manager, detection_ws_manager, alerts_ws_manager

router = APIRouter(prefix="/ws", tags=["websocket"])
logger = logging.getLogger(__name__)


@router.websocket("/inout")
async def websocket_inout(websocket: WebSocket):
    """
    WebSocket endpoint for real-time In/Out updates.

    Clients must provide ?token=<JWT> query parameter. Connections are grouped by organization,
    and broadcasts are scoped to the organization of the authenticated membership.
    """
    token = websocket.query_params.get("token")
    db = SessionLocal()

    try:
        current = authenticate_token(token, db)
        org_id = current.organization.id
    except Exception as exc:
        # Authentication failure - close with 4401 (unauthorized)
        await websocket.close(code=4401, reason=str(exc))
        return
    finally:
        # Don't hold DB connections open for long-lived websockets
        db.close()

    await inout_ws_manager.connect(org_id, websocket)

    try:
        while True:
            # Keep the connection open; we don't expect messages from the client.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        inout_ws_manager.disconnect(org_id, websocket)


@router.websocket("/detections/ai/{camera_id}")
async def websocket_detections_ai(websocket: WebSocket, camera_id: str):
    """
    WebSocket endpoint for AI service to send detection updates.
    
    AI service connects here and sends detection updates in real-time.
    No authentication required (internal service).
    """
    # Accept WebSocket connection first (required before any operations)
    await websocket.accept()
    logger.info(f"AI service WebSocket connection accepted for camera {camera_id}")
    
    try:
        # Register the connection with the manager
        with detection_ws_manager.lock:
            # Close existing connection if any
            if camera_id in detection_ws_manager.ai_connections:
                try:
                    await detection_ws_manager.ai_connections[camera_id].close()
                except:
                    pass
            detection_ws_manager.ai_connections[camera_id] = websocket
        
        logger.info(f"AI service connected for camera {camera_id}")
        
        while True:
            # Receive detection updates from AI service
            data = await websocket.receive_json()
            
            # Process and broadcast to frontend
            await detection_ws_manager.receive_from_ai(camera_id, data)
            
    except WebSocketDisconnect:
        logger.info(f"AI service disconnected for camera {camera_id}")
    except Exception as e:
        logger.error(f"Error in AI detection WebSocket for camera {camera_id}: {e}", exc_info=True)
    finally:
        detection_ws_manager.disconnect_ai(camera_id)


@router.websocket("/detections")
async def websocket_detections_frontend(websocket: WebSocket):
    """
    WebSocket endpoint for frontend to receive real-time detection updates.
    
    Clients must provide ?token=<JWT> query parameter. Connections are grouped by organization.
    """
    # Accept WebSocket connection first (required before any operations)
    await websocket.accept()
    
    token = websocket.query_params.get("token")
    db = SessionLocal()
    
    try:
        current = authenticate_token(token, db)
        org_id = current.organization.id
    except Exception as exc:
        logger.warning(f"WebSocket authentication failed: {exc}")
        await websocket.close(code=4401, reason=str(exc))
        return
    finally:
        # Release DB connection immediately; websocket is long-lived
        db.close()
    
    # Register the connection with the manager
    with detection_ws_manager.lock:
        detection_ws_manager.frontend_connections[org_id].add(websocket)
    
    logger.debug(f"Frontend client connected for detections (org: {org_id})")
    
    try:
        while True:
            # Keep the connection open; we don't expect messages from the client.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        detection_ws_manager.disconnect_frontend(org_id, websocket)


@router.websocket("/alerts")
async def websocket_alerts(websocket: WebSocket):
    """
    WebSocket endpoint for real-time alert/behavior detection updates.

    Clients must provide ?token=<JWT> query parameter. Connections are grouped by organization,
    and broadcasts are scoped to the organization of the authenticated membership.
    """
    token = websocket.query_params.get("token")
    db = SessionLocal()

    try:
        current = authenticate_token(token, db)
        org_id = current.organization.id
    except Exception as exc:
        # Authentication failure - close with 4401 (unauthorized)
        await websocket.close(code=4401, reason=str(exc))
        return
    finally:
        # Release DB connection to avoid pool exhaustion
        db.close()

    await alerts_ws_manager.connect(org_id, websocket)

    try:
        while True:
            # Keep the connection open; we don't expect messages from the client.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        alerts_ws_manager.disconnect(org_id, websocket)


