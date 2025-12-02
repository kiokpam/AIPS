from datetime import datetime, timedelta
from typing import List, Optional, Tuple, Union

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.deps import CurrentMembership, get_current_membership, get_db, require_manager
from app.models.core import (
    Camera,
    Invite,
    MemberPermission,
    Membership,
    MembershipRole,
    Organization,
    PasswordResetToken,
    Store,
    User,
)
from app.schemas.auth import (
    AuthResponse,
    CreateInviteRequest,
    CreateOrganizationRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GenerateJoinCodeRequest,
    InviteMemberRequest,
    InviteResponse,
    InvitesResponse,
    LoginRequest,
    ManagerSignupRequest,
    MemberLoginRequest,
    MemberPermissionRequest,
    MemberPermissionResponse,
    MemberSignupRequest,
    MembersResponse,
    MembershipInfo,
    MembershipResponse,
    OrganizationInfo,
    OrganizationResponse,
    ProfileResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SetMemberPasswordRequest,
    SwitchOrganizationRequest,
    UpdateMemberRoleRequest,
    UserInfo,
)
from app.config.settings import get_settings
from app.services.auth_service import (
    create_access_token,
    generate_id,
    hash_password,
    verify_password,
)
from jose import JWTError, jwt

security = HTTPBearer()


router = APIRouter(prefix="/auth", tags=["auth"])


def _build_membership_info(membership: Membership, organization: Organization) -> MembershipInfo:
    return MembershipInfo(
        id=membership.id,
        organization=OrganizationInfo(id=organization.id, name=organization.name),
        role=membership.role,
    )


def _build_user_info(user: User) -> UserInfo:
    return UserInfo(id=user.id, email=user.email, name=user.name)


def _fetch_user_memberships(db: Session, user_id: str) -> List[Tuple[Membership, Organization]]:
    return (
        db.query(Membership, Organization)
        .join(Organization, Membership.org_id == Organization.id)
        .filter(Membership.user_id == user_id)
        .all()
    )


def _build_auth_response(db: Session, user: User, membership: Membership, organization: Organization) -> AuthResponse:
    membership_rows = _fetch_user_memberships(db, user.id)
    token = create_access_token(
        subject=user.id,
        org_id=organization.id,
        role=membership.role.value,
    )

    return AuthResponse(
        access_token=token,
        user=_build_user_info(user),
        active_membership=_build_membership_info(membership, organization),
        memberships=[
            _build_membership_info(m, org)
            for m, org in membership_rows
        ],
    )


def _signup_member(payload: MemberSignupRequest, db: Session) -> AuthResponse:
    if not payload.invite_token and not payload.join_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite token or join code is required to join an organization",
        )

    email = payload.email.lower()
    existing_user = db.query(User).filter(User.email == email).first()
    
    # If user exists, check if they're accepting an invite
    if existing_user:
        user = existing_user
    else:
        # Create new user
        user = User(
            id=generate_id(),
            email=email,
            password_hash=hash_password(payload.password),
            name=payload.name,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Handle invite token or join code
    membership = None
    organization = None
    
    if payload.invite_token:
        # Validate invite token
        invite = db.query(Invite).filter(Invite.token == payload.invite_token).first()
        if not invite:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid invite token")
        if invite.used_at:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite token already used")
        if invite.expires_at and invite.expires_at < datetime.utcnow():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite token expired")
        if invite.email and invite.email.lower() != email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite token is for a different email")
        
        organization = db.query(Organization).filter(Organization.id == invite.org_id).first()
        if not organization:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        
        # Check if membership already exists
        existing_membership = db.query(Membership).filter(
            Membership.user_id == user.id,
            Membership.org_id == organization.id
        ).first()
        
        if existing_membership:
            membership = existing_membership
        else:
            membership = Membership(
                id=generate_id(),
                user_id=user.id,
                org_id=organization.id,
                role=invite.role,
                created_at=datetime.utcnow(),
            )
            db.add(membership)
        
        # Mark invite as used
        invite.used_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        db.refresh(organization)
        db.refresh(membership)
        
    elif payload.join_code:
        # Validate join code
        organization = db.query(Organization).filter(Organization.join_code == payload.join_code).first()
        if not organization:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid join code")
        
        # Check if membership already exists
        existing_membership = db.query(Membership).filter(
            Membership.user_id == user.id,
            Membership.org_id == organization.id
        ).first()
        
        if existing_membership:
            membership = existing_membership
        else:
            membership = Membership(
                id=generate_id(),
                user_id=user.id,
                org_id=organization.id,
                role=MembershipRole.member,  # Default to member for join code
                created_at=datetime.utcnow(),
            )
            db.add(membership)
            db.commit()
            db.refresh(user)
            db.refresh(organization)
            db.refresh(membership)

    if not membership or not organization:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to join organization",
        )

    return _build_auth_response(db, user, membership, organization)


@router.post("/signup/member", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup_member(payload: MemberSignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Member signup flow - requires an invite token or join code"""
    return _signup_member(payload, db)


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: MemberSignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Deprecated endpoint kept for backwards compatibility - behaves like member signup"""
    return _signup_member(payload, db)


@router.post("/signup/manager", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup_manager(payload: ManagerSignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Manager signup flow - creates user and a new organization"""
    email = payload.email.lower()
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    org_name = payload.organization_name.strip()
    existing_org = db.query(Organization).filter(Organization.name == org_name).first()
    if existing_org:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization name already exists")

    user = User(
        id=generate_id(),
        email=email,
        password_hash=hash_password(payload.password),
        name=payload.name,
    )

    db.add(user)
    db.flush()  # ensure user exists before creating membership

    organization = Organization(
        id=generate_id(),
        name=org_name,
        join_code=None,
        created_at=datetime.utcnow(),
    )
    db.add(organization)
    db.flush()

    membership = Membership(
        id=generate_id(),
        user_id=user.id,
        org_id=organization.id,
        role=MembershipRole.manager,
        created_at=datetime.utcnow(),
    )

    db.add(membership)
    db.commit()
    db.refresh(user)
    db.refresh(organization)
    db.refresh(membership)

    return _build_auth_response(db, user, membership, organization)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = payload.email.lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email or password")

    membership_rows = _fetch_user_memberships(db, user.id)
    
    # If user has no organizations, they need to create one first
    if not membership_rows:
        # Return a response that indicates user needs to create organization
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"detail": "User has no organizations. Please create an organization."},
            headers={"X-No-Organization": "true"}
        )

    active_membership: Membership | None = None
    active_org: Organization | None = None
    if payload.organization_id:
        for membership, organization in membership_rows:
            if organization.id == payload.organization_id:
                active_membership = membership
                active_org = organization
                break
        if not active_membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not a member of this organization")
    else:
        active_membership, active_org = membership_rows[0]

    # If remember_me is true, use 7 days expiration, otherwise use default (1 hour)
    expires_delta = timedelta(days=7) if payload.remember_me else None
    
    token = create_access_token(
        subject=user.id,
        org_id=active_org.id,
        role=active_membership.role.value,
        expires_delta=expires_delta,
    )

    return AuthResponse(
        access_token=token,
        user=_build_user_info(user),
        active_membership=_build_membership_info(active_membership, active_org),
        memberships=[
            _build_membership_info(membership, organization)
            for membership, organization in membership_rows
        ],
    )


@router.post("/login/member", response_model=AuthResponse)
def member_login(payload: MemberLoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Member login - uses organization identifier + shared member password"""
    organization: Organization | None = None
    
    # Find organization by ID, name, or join code
    if payload.organization_id:
        organization = db.query(Organization).filter(Organization.id == payload.organization_id).first()
    elif payload.organization_name:
        organization = db.query(Organization).filter(Organization.name == payload.organization_name).first()
    elif payload.join_code:
        organization = db.query(Organization).filter(Organization.join_code == payload.join_code).first()
    
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    
    # Check if member password is set
    if not organization.member_password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Member access is not enabled for this organization. Please contact the manager."
        )
    
    # Verify password
    if not verify_password(payload.password, organization.member_password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid password")
    
    # Get or create the member user for this organization
    member_email = f"member@{organization.id}.system"
    member_user = db.query(User).filter(User.email == member_email).first()
    
    if not member_user:
        # Create the shared member user
        member_user = User(
            id=generate_id(),
            email=member_email,
            password_hash="",  # Not used for member login
            name=f"{organization.name} Members",
        )
        db.add(member_user)
        db.flush()
    
    # Get or create membership
    membership = db.query(Membership).filter(
        Membership.user_id == member_user.id,
        Membership.org_id == organization.id
    ).first()
    
    if not membership:
        membership = Membership(
            id=generate_id(),
            user_id=member_user.id,
            org_id=organization.id,
            role=MembershipRole.member,
            created_at=datetime.utcnow(),
        )
        db.add(membership)
        db.commit()
        db.refresh(membership)
        db.refresh(organization)
    else:
        db.refresh(organization)
    
    return _build_auth_response(db, member_user, membership, organization)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> ForgotPasswordResponse:
    """Request a password reset link. Sends email in production, returns link in development."""
    import secrets
    import logging
    from app.services.email_service import email_service
    
    logger = logging.getLogger(__name__)
    email = payload.email.lower()
    user = db.query(User).filter(User.email == email).first()
    
    # Always return success to prevent email enumeration
    # But only create token and send email if user exists
    if user:
        # Invalidate any existing tokens for this user
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None)
        ).delete()
        
        # Generate new token
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=1)  # Token expires in 1 hour
        
        reset_token = PasswordResetToken(
            id=generate_id(),
            user_id=user.id,
            token=token,
            expires_at=expires_at,
            created_at=datetime.utcnow(),
        )
        db.add(reset_token)
        db.commit()
        
        # Send password reset email
        email_sent = email_service.send_password_reset_email(
            to_email=user.email,
            reset_token=token,
            user_name=user.name
        )
        
        if email_sent:
            logger.info(f"Password reset email sent to {user.email}")
        else:
            logger.warning(f"Failed to send password reset email to {user.email}")
        
        # In development mode (console provider), also return the reset URL for testing
        # In production (SMTP/SendGrid), don't expose the URL
        if not email_service.is_production:
            reset_url = f"/reset-password?token={token}"
            return ForgotPasswordResponse(
                message="If an account with that email exists, a password reset link has been sent.",
                reset_url=reset_url  # Only in development
            )
        
        return ForgotPasswordResponse(
            message="If an account with that email exists, a password reset link has been sent."
        )
    
    # Return same message even if user doesn't exist (security best practice)
    return ForgotPasswordResponse(
        message="If an account with that email exists, a password reset link has been sent."
    )


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> ResetPasswordResponse:
    """Reset password using a valid reset token."""
    # Find the token
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == payload.token
    ).first()
    
    if not reset_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    # Check if token is expired
    if reset_token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired. Please request a new one."
        )
    
    # Check if token was already used
    if reset_token.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset token has already been used."
        )
    
    # Find the user
    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found"
        )
    
    # Update the password
    user.password_hash = hash_password(payload.new_password)
    
    # Mark token as used
    reset_token.used_at = datetime.utcnow()
    
    db.commit()
    
    return ResetPasswordResponse(
        message="Password has been reset successfully. You can now log in with your new password."
    )


@router.get("/reset-password/{token}/validate")
def validate_reset_token(token: str, db: Session = Depends(get_db)):
    """Validate a reset token without using it. Returns user email for confirmation."""
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == token
    ).first()
    
    if not reset_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token"
        )
    
    if reset_token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired"
        )
    
    if reset_token.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has already been used"
        )
    
    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found"
        )
    
    # Mask email for privacy (show first 2 chars and domain)
    email_parts = user.email.split('@')
    masked_email = email_parts[0][:2] + '***@' + email_parts[1] if len(email_parts) == 2 else '***'
    
    return {
        "valid": True,
        "email": masked_email,
        "expires_at": reset_token.expires_at.isoformat()
    }


@router.post("/switch-org", response_model=AuthResponse)
def switch_org(
    payload: SwitchOrganizationRequest,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> AuthResponse:
    membership_rows = _fetch_user_memberships(db, current.user.id)
    target_membership: Membership | None = None
    target_org: Organization | None = None
    for membership, organization in membership_rows:
        if organization.id == payload.organization_id:
            target_membership = membership
            target_org = organization
            break
    if not target_membership or not target_org:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Membership not found for the requested organization")

    token = create_access_token(
        subject=current.user.id,
        org_id=target_org.id,
        role=target_membership.role.value,
    )

    return AuthResponse(
        access_token=token,
        user=_build_user_info(current.user),
        active_membership=_build_membership_info(target_membership, target_org),
        memberships=[
            _build_membership_info(membership, organization)
            for membership, organization in membership_rows
        ],
    )


@router.get("/me", response_model=ProfileResponse)
def me(current: CurrentMembership = Depends(get_current_membership), db: Session = Depends(get_db)) -> ProfileResponse:
    membership_rows = _fetch_user_memberships(db, current.user.id)
    active_membership: Membership | None = None
    active_org: Organization | None = None
    for membership, organization in membership_rows:
        if membership.org_id == current.organization.id:
            active_membership = membership
            active_org = organization
            break
    if not active_membership or not active_org:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Active membership not found")

    return ProfileResponse(
        user=_build_user_info(current.user),
        active_membership=_build_membership_info(active_membership, active_org),
        memberships=[
            _build_membership_info(membership, organization)
            for membership, organization in membership_rows
        ],
    )


@router.get("/orgs/{org_id}/members", response_model=MembersResponse)
def list_members(
    org_id: str,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> MembersResponse:
    if current.organization.id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access members of another organization")

    membership_rows = (
        db.query(Membership, Organization, User)
        .join(Organization, Membership.org_id == Organization.id)
        .join(User, Membership.user_id == User.id)
        .filter(Membership.org_id == org_id)
        .all()
    )

    members = [
        MembershipResponse(
            id=membership.id,
            organization=OrganizationInfo(id=organization.id, name=organization.name),
            role=membership.role,
            user=_build_user_info(user),
        )
        for membership, organization, user in membership_rows
    ]

    return MembersResponse(members=members)


@router.post("/orgs/{org_id}/members", response_model=MembershipResponse, status_code=status.HTTP_201_CREATED)
def add_member(
    org_id: str,
    payload: InviteMemberRequest,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> MembershipResponse:
    """Add or update a member (creates user if doesn't exist) - DEPRECATED: Use invites/join codes instead"""
    if current.organization.id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage members of another organization")

    email = payload.email.lower()
    user = db.query(User).filter(User.email == email).first()
    if user and payload.password:
        # Optional: allow updating password if manager provides one
        user.password_hash = hash_password(payload.password)
    elif not user:
        if not payload.password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is required for new members")
        user = User(
            id=generate_id(),
            email=email,
            password_hash=hash_password(payload.password),
            name=payload.name,
            created_at=datetime.utcnow(),
        )
        db.add(user)
        db.flush()  # Ensure user exists before creating membership

    membership = (
        db.query(Membership)
        .filter(Membership.user_id == user.id, Membership.org_id == org_id)
        .first()
    )
    if membership:
        membership.role = payload.role
    else:
        membership = Membership(
            id=generate_id(),
            user_id=user.id,
            org_id=org_id,
            role=payload.role,
            created_at=datetime.utcnow(),
        )
        db.add(membership)

    db.commit()
    db.refresh(user)
    db.refresh(membership)

    organization = db.query(Organization).filter(Organization.id == org_id).first()
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    return MembershipResponse(
        id=membership.id,
        user=_build_user_info(user),
        organization=OrganizationInfo(id=organization.id, name=organization.name),
        role=membership.role,
    )


@router.patch("/orgs/{org_id}/members/{membership_id}/role", response_model=MembershipResponse)
def update_member_role(
    org_id: str,
    membership_id: str,
    payload: UpdateMemberRoleRequest,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> MembershipResponse:
    """Update a member's role"""
    if current.organization.id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage members of another organization")

    membership = db.query(Membership).filter(
        Membership.id == membership_id,
        Membership.org_id == org_id
    ).first()
    
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")
    
    # Prevent removing the last manager
    if membership.role == MembershipRole.manager and payload.role == MembershipRole.member:
        manager_count = db.query(Membership).filter(
            Membership.org_id == org_id,
            Membership.role == MembershipRole.manager
        ).count()
        if manager_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last manager from the organization"
            )
    
    membership.role = payload.role
    db.commit()
    db.refresh(membership)
    
    user = db.query(User).filter(User.id == membership.user_id).first()
    organization = db.query(Organization).filter(Organization.id == org_id).first()
    
    if not user or not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User or organization not found")
    
    return MembershipResponse(
        id=membership.id,
        user=_build_user_info(user),
        organization=OrganizationInfo(id=organization.id, name=organization.name),
        role=membership.role,
    )


@router.delete("/orgs/{org_id}/members/{membership_id}")
def remove_member(
    org_id: str,
    membership_id: str,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Remove a member from the organization"""
    if current.organization.id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage members of another organization")

    membership = db.query(Membership).filter(
        Membership.id == membership_id,
        Membership.org_id == org_id
    ).first()
    
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")
    
    # Prevent removing the last manager
    if membership.role == MembershipRole.manager:
        manager_count = db.query(Membership).filter(
            Membership.org_id == org_id,
            Membership.role == MembershipRole.manager
        ).count()
        if manager_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last manager from the organization"
            )
    
    # Prevent removing yourself
    if membership.user_id == current.user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove yourself from the organization"
        )
    
    db.delete(membership)
    db.commit()
    return {"message": "Member removed successfully"}


@router.post("/organizations", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: CreateOrganizationRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> AuthResponse:
    """Create a new organization and add current user as manager"""
    token = credentials.credentials
    settings = get_settings()

    try:
        payload_jwt = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload_jwt.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        # Allow creating org without valid token if user provides email/password
        # This is for users who just signed up but haven't logged in yet
        # For now, we'll require a token - user should login first to get token
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please log in first to create an organization",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Check if organization name already exists
    existing = db.query(Organization).filter(Organization.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization name already exists")

    organization = Organization(
        id=generate_id(),
        name=payload.name,
        join_code=None,  # Can be generated later
        created_at=datetime.utcnow(),
    )
    db.add(organization)
    db.flush()  # Ensure organization exists before creating membership

    membership = Membership(
        id=generate_id(),
        user_id=user.id,
        org_id=organization.id,
        role=MembershipRole.manager,
        created_at=datetime.utcnow(),
    )

    db.add(membership)
    db.commit()
    db.refresh(organization)
    db.refresh(membership)

    membership_rows = _fetch_user_memberships(db, user.id)
    token = create_access_token(
        subject=user.id,
        org_id=organization.id,
        role=membership.role.value,
    )

    return AuthResponse(
        access_token=token,
        user=_build_user_info(user),
        active_membership=_build_membership_info(membership, organization),
        memberships=[
            _build_membership_info(m, org)
            for m, org in membership_rows
        ],
    )


@router.get("/organizations", response_model=List[OrganizationResponse])
def list_organizations(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> List[OrganizationResponse]:
    """List all organizations (for managers to see all orgs)"""
    token = credentials.credentials
    settings = get_settings()

    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    # Get all organizations where user is a manager
    memberships = (
        db.query(Membership, Organization)
        .join(Organization, Membership.org_id == Organization.id)
        .filter(Membership.user_id == user_id, Membership.role == MembershipRole.manager)
        .all()
    )

    return [
        OrganizationResponse(
            id=org.id,
            name=org.name,
            join_code=org.join_code,
            created_at=org.created_at,
        )
        for _, org in memberships
    ]


@router.post("/orgs/{org_id}/invites", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
def create_invite(
    org_id: str,
    payload: CreateInviteRequest,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> InviteResponse:
    """Create an invite for the organization"""
    if current.organization.id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create invites for another organization")

    organization = db.query(Organization).filter(Organization.id == org_id).first()
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    # Generate unique token
    import secrets
    token = secrets.token_urlsafe(32)
    
    # Check token uniqueness
    while db.query(Invite).filter(Invite.token == token).first():
        token = secrets.token_urlsafe(32)

    expires_at = None
    if payload.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=payload.expires_in_days)

    invite = Invite(
        id=generate_id(),
        token=token,
        org_id=org_id,
        email=payload.email.lower() if payload.email else None,
        role=payload.role,
        created_by=current.user.id,
        expires_at=expires_at,
        created_at=datetime.utcnow(),
    )

    db.add(invite)
    db.commit()
    db.refresh(invite)

    # Generate invite URL (frontend will handle this)
    invite_url = f"/accept-invite?token={token}"

    return InviteResponse(
        id=invite.id,
        token=invite.token,
        invite_url=invite_url,
        email=invite.email,
        role=invite.role,
        expires_at=invite.expires_at,
        used_at=invite.used_at,
        created_at=invite.created_at,
    )


@router.get("/orgs/{org_id}/invites", response_model=InvitesResponse)
def list_invites(
    org_id: str,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> InvitesResponse:
    """List all invites for the organization"""
    if current.organization.id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access invites of another organization")

    invites = db.query(Invite).filter(Invite.org_id == org_id).order_by(Invite.created_at.desc()).all()

    invite_responses = []
    for invite in invites:
        invite_url = f"/accept-invite?token={invite.token}"
        invite_responses.append(InviteResponse(
            id=invite.id,
            token=invite.token,
            invite_url=invite_url,
            email=invite.email,
            role=invite.role,
            expires_at=invite.expires_at,
            used_at=invite.used_at,
            created_at=invite.created_at,
        ))

    return InvitesResponse(invites=invite_responses)


@router.delete("/invites/{invite_id}")
def delete_invite(
    invite_id: str,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Delete an invite"""
    invite = db.query(Invite).filter(Invite.id == invite_id).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    if invite.org_id != current.organization.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete invite from another organization")

    db.delete(invite)
    db.commit()
    return {"message": "Invite deleted successfully"}


@router.get("/invites/{token}/info", response_model=InviteResponse)
def get_invite_info(
    token: str,
    db: Session = Depends(get_db),
) -> InviteResponse:
    """Get invite information (public endpoint for invite acceptance)"""
    invite = db.query(Invite).filter(Invite.token == token).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite token")

    if invite.used_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite token already used")

    if invite.expires_at and invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite token expired")

    organization = db.query(Organization).filter(Organization.id == invite.org_id).first()
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    invite_url = f"/accept-invite?token={token}"

    return InviteResponse(
        id=invite.id,
        token=invite.token,
        invite_url=invite_url,
        email=invite.email,
        role=invite.role,
        expires_at=invite.expires_at,
        used_at=invite.used_at,
        created_at=invite.created_at,
    )


@router.post("/orgs/{org_id}/join-code", response_model=OrganizationResponse)
def generate_join_code(
    org_id: str,
    payload: GenerateJoinCodeRequest,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> OrganizationResponse:
    """Generate or disable organization join code"""
    if current.organization.id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage join code for another organization")

    organization = db.query(Organization).filter(Organization.id == org_id).first()
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    if payload.enabled:
        # Generate unique join code
        import secrets
        join_code = secrets.token_urlsafe(8).upper()[:8]  # 8 character code
        
        # Check uniqueness
        while db.query(Organization).filter(Organization.join_code == join_code).first():
            join_code = secrets.token_urlsafe(8).upper()[:8]
        
        organization.join_code = join_code
    else:
        organization.join_code = None

    db.commit()
    db.refresh(organization)

    return OrganizationResponse(
        id=organization.id,
        name=organization.name,
        join_code=organization.join_code,
        created_at=organization.created_at,
    )


@router.put("/orgs/{org_id}/member-password", response_model=OrganizationResponse)
def set_member_password(
    org_id: str,
    payload: SetMemberPasswordRequest,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> OrganizationResponse:
    """Set or update the shared member password for the organization"""
    if current.organization.id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage member password for another organization")

    organization = db.query(Organization).filter(Organization.id == org_id).first()
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    # Validate password (same rules as user passwords)
    if len(payload.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters long")
    if len(payload.password) > 128:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be less than 128 characters")
    import re
    if not re.search(r'[a-z]', payload.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one lowercase letter")
    if not re.search(r'[A-Z]', payload.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one uppercase letter")
    if not re.search(r'[0-9]', payload.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one number")

    # Hash and store the password
    organization.member_password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(organization)

    return OrganizationResponse(
        id=organization.id,
        name=organization.name,
        join_code=organization.join_code,
        created_at=organization.created_at,
    )


@router.delete("/orgs/{org_id}/member-password", response_model=OrganizationResponse)
def remove_member_password(
    org_id: str,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> OrganizationResponse:
    """Remove the shared member password (disable member access)"""
    if current.organization.id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage member password for another organization")

    organization = db.query(Organization).filter(Organization.id == org_id).first()
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    organization.member_password_hash = None
    db.commit()
    db.refresh(organization)

    return OrganizationResponse(
        id=organization.id,
        name=organization.name,
        join_code=organization.join_code,
        created_at=organization.created_at,
    )


@router.put("/orgs/{org_id}/members/{membership_id}/permissions", response_model=MemberPermissionResponse)
def update_member_permissions(
    org_id: str,
    membership_id: str,
    payload: MemberPermissionRequest,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> MemberPermissionResponse:
    """Update permissions for a member (which cameras/dashboard they can access)"""
    if current.organization.id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage permissions for another organization")
    
    if payload.membership_id != membership_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Membership ID mismatch")
    
    # Verify membership belongs to this organization
    membership = db.query(Membership).filter(
        Membership.id == membership_id,
        Membership.org_id == org_id
    ).first()
    
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")
    
    # Prevent managers from modifying their own permissions
    if membership.role == MembershipRole.manager:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify permissions for managers")
    
    # Verify store belongs to this organization if provided
    if payload.store_id:
        store = db.query(Store).filter(
            Store.id == payload.store_id,
            Store.org_id == org_id
        ).first()
        if not store:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Store not found or doesn't belong to this organization")
    
    # Verify all cameras belong to this organization (and store if specified)
    if payload.camera_ids:
        camera_query = db.query(Camera).filter(
            Camera.id.in_(payload.camera_ids),
            Camera.org_id == org_id
        )
        if payload.store_id:
            camera_query = camera_query.filter(Camera.store_id == payload.store_id)
        cameras = camera_query.all()
        if len(cameras) != len(payload.camera_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more cameras not found or don't belong to this organization/store")
    
    # Delete existing permissions for this membership and store (if store-specific)
    if payload.store_id:
        # Delete store-specific permissions
        db.query(MemberPermission).filter(
            MemberPermission.membership_id == membership_id,
            MemberPermission.store_id == payload.store_id
        ).delete()
    else:
        # Delete all org-wide permissions (store_id is NULL)
        db.query(MemberPermission).filter(
            MemberPermission.membership_id == membership_id,
            MemberPermission.store_id.is_(None)
        ).delete()
    
    # Create dashboard permission
    dashboard_permission = MemberPermission(
        id=generate_id(),
        membership_id=membership_id,
        store_id=payload.store_id,  # NULL for org-wide, store_id for store-specific
        camera_id=None,  # NULL means dashboard
        can_view=payload.can_access_dashboard,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(dashboard_permission)
    
    # Create camera permissions
    for camera_id in payload.camera_ids:
        camera_permission = MemberPermission(
            id=generate_id(),
            membership_id=membership_id,
            store_id=payload.store_id,  # NULL for org-wide, store_id for store-specific
            camera_id=camera_id,
            can_view=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(camera_permission)
    
    db.commit()
    
    # Get user info
    user = db.query(User).filter(User.id == membership.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    return MemberPermissionResponse(
        membership_id=membership_id,
        user=_build_user_info(user),
        store_id=payload.store_id,
        accessible_cameras=payload.camera_ids,
        can_access_dashboard=payload.can_access_dashboard,
    )


@router.get("/orgs/{org_id}/members/{membership_id}/permissions", response_model=MemberPermissionResponse)
def get_member_permissions(
    org_id: str,
    membership_id: str,
    store_id: Optional[str] = Query(None, description="Store ID for store-specific permissions"),
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> MemberPermissionResponse:
    """Get permissions for a member (managers can view any member's permissions, members can only view their own)"""
    if current.organization.id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot view permissions for another organization")
    
    membership = db.query(Membership).filter(
        Membership.id == membership_id,
        Membership.org_id == org_id
    ).first()
    
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")
    
    # Members can only view their own permissions
    if current.role == MembershipRole.member and current.id != membership_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your own permissions")
    
    # Get permissions (for a specific store if store_id query param is provided)
    permission_query = db.query(MemberPermission).filter(
        MemberPermission.membership_id == membership_id
    )
    
    # If store_id is provided, filter by store
    if store_id:
        permission_query = permission_query.filter(MemberPermission.store_id == store_id)
    # If store_id is not provided, get ALL permissions (both org-wide and store-specific)
    # This allows us to find store-specific permissions for store members
    
    permissions = permission_query.all()
    
    # Extract dashboard and camera permissions
    can_access_dashboard = False
    accessible_cameras = []
    found_store_id = None
    
    for perm in permissions:
        # Track the store_id from permissions (for store-specific members)
        if perm.store_id and not found_store_id:
            found_store_id = perm.store_id
        # Dashboard permission (camera_id is NULL)
        if perm.camera_id is None:
            can_access_dashboard = perm.can_view
        # Camera permission
        elif perm.can_view:
            accessible_cameras.append(perm.camera_id)
    
    # Use found_store_id if we found one, otherwise use the provided store_id
    if not store_id:
        store_id = found_store_id
    
    # Get user info
    user = db.query(User).filter(User.id == membership.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    return MemberPermissionResponse(
        membership_id=membership_id,
        user=_build_user_info(user),
        store_id=store_id,
        accessible_cameras=accessible_cameras,
        can_access_dashboard=can_access_dashboard,
    )