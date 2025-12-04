from collections import defaultdict
from typing import Dict, Set

from fastapi import WebSocket


class InOutWebSocketManager:
    """Tracks websocket connections per organization for in/out realtime updates."""

    def __init__(self) -> None:
        self.connections: Dict[str, Set[WebSocket]] = defaultdict(set)

    async def connect(self, org_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections[org_id].add(websocket)

    def disconnect(self, org_id: str, websocket: WebSocket) -> None:
        if org_id in self.connections:
            self.connections[org_id].discard(websocket)
            if not self.connections[org_id]:
                self.connections.pop(org_id, None)

    async def broadcast(self, org_id: str, message: dict) -> None:
        """Send a message to all clients connected for an organization."""
        connections = list(self.connections.get(org_id, []))
        to_remove: Set[WebSocket] = set()

        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception:
                to_remove.add(websocket)

        for websocket in to_remove:
            self.disconnect(org_id, websocket)


inout_ws_manager = InOutWebSocketManager()


