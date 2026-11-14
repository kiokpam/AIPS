"""
Optional shared-token protection for internal service endpoints.

The AI service talks to the backend through endpoints that have no user login
(frame pulls, camera configs, detection/alert events and the AI WebSocket).

- If the AI_SERVICE_TOKEN environment variable is set, these endpoints require
  the same value in the X-Service-Token header (the WebSocket also accepts a
  ``service_token`` query parameter). Set the same AI_SERVICE_TOKEN for the
  backend and the AI service.
- If it is not set, the endpoints stay open (previous behavior) and a warning
  is logged once.
"""

import hmac
import logging
import os
import threading
from typing import Optional

from fastapi import Header, HTTPException, status

logger = logging.getLogger(__name__)

SERVICE_TOKEN_ENV = "AI_SERVICE_TOKEN"
SERVICE_TOKEN_HEADER = "X-Service-Token"
SERVICE_TOKEN_QUERY_PARAM = "service_token"

_warned_unset = False
_warn_lock = threading.Lock()


def get_expected_service_token() -> Optional[str]:
    """Return the configured service token, or None when protection is off."""
    token = os.getenv(SERVICE_TOKEN_ENV, "").strip()
    return token or None


def _warn_unset_once() -> None:
    global _warned_unset
    with _warn_lock:
        if _warned_unset:
            return
        _warned_unset = True
    logger.warning(
        "%s is not set: internal AI endpoints (/api/ai/*, AI event endpoints under "
        "/api/events and the /api/ws/detections/ai WebSocket) accept requests without "
        "authentication. Set %s for both the backend and the AI service to protect them.",
        SERVICE_TOKEN_ENV,
        SERVICE_TOKEN_ENV,
    )


def is_valid_service_token(provided: Optional[str]) -> bool:
    """Check a token sent by a caller. Always True when no token is configured."""
    expected = get_expected_service_token()
    if expected is None:
        _warn_unset_once()
        return True
    if not provided:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


def require_service_token(
    x_service_token: Optional[str] = Header(default=None, alias=SERVICE_TOKEN_HEADER),
) -> None:
    """FastAPI dependency for internal HTTP endpoints."""
    if not is_valid_service_token(x_service_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing service token",
        )
