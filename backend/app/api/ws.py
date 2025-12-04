from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.deps import authenticate_token
from app.db.session import SessionLocal
from app.services.websocket_manager import inout_ws_manager

router = APIRouter(prefix="/ws", tags=["websocket"])


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
        try:
            current = authenticate_token(token, db)
        except Exception as exc:
            # Authentication failure - close with 4401 (unauthorized)
            await websocket.close(code=4401, reason=str(exc))
            return

        org_id = current.organization.id
        await inout_ws_manager.connect(org_id, websocket)

        try:
            while True:
                # Keep the connection open; we don't expect messages from the client.
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            inout_ws_manager.disconnect(org_id, websocket)
    finally:
        db.close()


