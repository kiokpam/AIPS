import secrets
from fastapi import APIRouter
from app.schemas.auth import LoginRequest, TokenResponse


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    # Stub: accept any non-empty credentials and return a fake token
    token = secrets.token_hex(16)
    return TokenResponse(access_token=token)


