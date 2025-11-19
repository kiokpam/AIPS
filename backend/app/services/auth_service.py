from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from jose import jwt
import hashlib
from passlib.context import CryptContext

from app.config.settings import get_settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def generate_id() -> str:
    return str(uuid4())


def _prehash_password(password: str) -> str:
    """Pre-hash password with SHA256 to avoid bcrypt 72-byte limit"""
    # SHA256 produces 32 bytes, hex-encoded becomes 64 characters (64 bytes as string)
    # This is well within bcrypt's 72-byte limit
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    # Pre-hash with SHA256 to avoid bcrypt 72-byte limit, then bcrypt the hash
    prehashed = _prehash_password(password)
    return pwd_context.hash(prehashed)


def verify_password(password: str, password_hash: str) -> bool:
    # Pre-hash with SHA256, then verify against bcrypt hash
    prehashed = _prehash_password(password)
    return pwd_context.verify(prehashed, password_hash)


def create_access_token(
    *,
    subject: str,
    org_id: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
    additional_claims: Optional[dict] = None,
) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(seconds=settings.jwt_expires_seconds)
    )
    to_encode = {
        "sub": subject,
        "org_id": org_id,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    if additional_claims:
        to_encode.update(additional_claims)
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)

