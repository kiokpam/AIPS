from dataclasses import dataclass
from typing import Generator, List, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config.settings import get_settings
from app.db.session import SessionLocal
from app.models.core import Membership, MembershipRole, Organization, User


security = HTTPBearer()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@dataclass
class CurrentMembership:
    user: User
    organization: Organization
    membership: Membership
    memberships: List[Membership]
    
    @property
    def id(self) -> str:
        """Get membership ID"""
        return self.membership.id
    
    @property
    def role(self) -> MembershipRole:
        """Get membership role"""
        return self.membership.role


def authenticate_token(token: Optional[str], db: Session) -> CurrentMembership:
    """Resolve CurrentMembership from a raw JWT token string."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        ) from exc
    
    user_id = payload.get("sub")
    org_id = payload.get("org_id")
    role_value = payload.get("role")
    
    if not user_id or not org_id or not role_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    
    organization = db.query(Organization).filter(Organization.id == org_id).first()
    if not organization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Organization not found")
    
    membership = (
        db.query(Membership)
        .filter(Membership.user_id == user_id, Membership.org_id == org_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Membership not found")
    
    memberships = db.query(Membership).filter(Membership.user_id == user_id).all()
    
    return CurrentMembership(
        user=user,
        organization=organization,
        membership=membership,
        memberships=memberships,
    )


def get_current_membership(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> CurrentMembership:
    token = credentials.credentials
    return authenticate_token(token, db)


def require_manager(
    current: CurrentMembership = Depends(get_current_membership),
) -> CurrentMembership:
    if current.membership.role != MembershipRole.manager:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager role required for this operation",
        )
    return current


def get_current_membership_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> CurrentMembership:
    """Get current membership from Authorization header or token query param (for img tags)"""
    token = None
    
    # Try Authorization header first
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    else:
        # Try token query parameter (for img tags that can't send headers)
        token = request.query_params.get("token")
    
    return authenticate_token(token, db)

