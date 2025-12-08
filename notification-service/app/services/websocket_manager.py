from collections import defaultdict
from typing import Dict, Set
from fastapi import WebSocket

logger = None  # Will be initialized in main


class NotificationWebSocketManager:
    """Tracks websocket connections per organization for real-time alert/behavior detection updates."""

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

    async def send_to_user(self, org_id: str, user_id: str, message: dict) -> None:
        """Send a message to a specific user (if user tracking is implemented)."""
        # For now, broadcast to org - can be enhanced with user-specific connections
        await self.broadcast(org_id, message)


# Global instance
ws_manager = NotificationWebSocketManager()

