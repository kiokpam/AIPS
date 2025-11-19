import re
import uuid
from typing import List, Optional
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.api.deps import CurrentMembership, get_current_membership, get_db, require_manager
from app.models.core import (
    Store as StoreModel,
    User,
    Membership,
    MembershipRole,
    MemberPermission,
    Camera as CameraModel,
)
from app.schemas.core import (
    Store,
    StoreCreate,
    StoreMemberAccountCreate,
    StoreMemberAccountSummary,
    StoreMemberCameraAccess,
    StoreMemberAccountUpdate,
    StoreMemberAccountResponse,
)
from app.schemas.auth import UserInfo
from app.services.auth_service import generate_id, hash_password
from datetime import datetime


router = APIRouter(prefix="/stores", tags=["stores"])


def _extract_username_from_email(email: str) -> str:
    local_part = email.split("@")[0]
    if local_part.startswith("store_"):
        parts = local_part.split("_", 2)
        if len(parts) == 3:
            return parts[2]
    return local_part


def _query_store_memberships(
    db: Session,
    store_id: str,
    org_id: str,
    membership_id: Optional[str] = None,
):
    # Query permissions for this store. We need to handle two cases:
    # 1. Dashboard permissions: store_id == store_id (explicit store permission)
    # 2. Camera permissions: store_id IS NULL but camera belongs to this store
    #    (due to uq_member_permission_store constraint workaround)
    query = (
        db.query(MemberPermission, Membership, User, CameraModel)
        .join(Membership, MemberPermission.membership_id == Membership.id)
        .join(User, Membership.user_id == User.id)
        .outerjoin(CameraModel, MemberPermission.camera_id == CameraModel.id)
        .filter(
            # Dashboard permission with store_id, OR camera permission where camera belongs to store
            or_(
                MemberPermission.store_id == store_id,
                and_(
                    MemberPermission.store_id.is_(None),
                    CameraModel.store_id == store_id
                )
            ),
            Membership.org_id == org_id,
            Membership.role == MembershipRole.member,
        )
        .order_by(Membership.created_at.asc())
    )

    if membership_id:
        query = query.filter(Membership.id == membership_id)

    return query.all()


def _build_store_member_summaries(store: StoreModel, rows: List):
    members_map: dict[str, dict] = {}

    for permission, membership, user, camera in rows:
        if membership.id not in members_map:
            members_map[membership.id] = {
                "membership_id": membership.id,
                "user_id": user.id,
                "username": _extract_username_from_email(user.email),
                "email": user.email,
                "store_id": store.id,
                "store_name": store.name,
                "can_access_dashboard": False,
                "camera_access": [],
                "created_at": membership.created_at,
            }

        member_entry = members_map[membership.id]

        if permission.camera_id is None:
            member_entry["can_access_dashboard"] = permission.can_view
        else:
            if not any(access["camera_id"] == permission.camera_id for access in member_entry["camera_access"]):
                member_entry["camera_access"].append(
                    {
                        "camera_id": permission.camera_id,
                        "camera_name": camera.name if camera else None,
                    }
                )

    return [StoreMemberAccountSummary(**entry) for entry in members_map.values()]


@router.get("/", response_model=List[Store])
def list_stores(
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> List[Store]:
    rows = (
        db.query(StoreModel)
        .filter(StoreModel.org_id == current.organization.id)
        .order_by(StoreModel.name.asc())
        .all()
    )
    return [
        Store(id=row.id, name=row.name, org_id=row.org_id)
        for row in rows
    ]


@router.post("/", response_model=Store, status_code=status.HTTP_201_CREATED)
def create_store(
    payload: StoreCreate,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> Store:
    existing = (
        db.query(StoreModel)
        .filter(StoreModel.org_id == current.organization.id, StoreModel.name == payload.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Store name already exists")

    item = StoreModel(id=str(uuid.uuid4()), name=payload.name, org_id=current.organization.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return Store(id=item.id, name=item.name, org_id=item.org_id)


@router.post("/{store_id}/member-account", response_model=StoreMemberAccountResponse, status_code=status.HTTP_201_CREATED)
def create_store_member_account(
    store_id: str,
    payload: StoreMemberAccountCreate,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> StoreMemberAccountResponse:
    """Create a member account for a specific store"""
    # Verify store belongs to organization
    store = db.query(StoreModel).filter(
        StoreModel.id == store_id,
        StoreModel.org_id == current.organization.id
    ).first()
    
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
    
    # Validate payload
    username = payload.username.strip().lower()
    password = payload.password
    camera_ids = payload.camera_ids
    can_access_dashboard = payload.can_access_dashboard
    
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required")
    if len(username) < 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username must be at least 3 characters")
    if len(username) > 30:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username must be less than 30 characters")
    
    # Sanitize username: remove any @ signs and other invalid characters for email
    # Replace invalid characters with underscores
    username_sanitized = re.sub(r'[^a-z0-9_-]', '_', username)
    if not username_sanitized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username must contain at least one alphanumeric character")
    
    if not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is required")
    if len(password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")
    if len(password) > 128:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be less than 128 characters")
    
    # Password strength validation
    if not re.search(r'[a-z]', password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one lowercase letter")
    if not re.search(r'[A-Z]', password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one uppercase letter")
    if not re.search(r'[0-9]', password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one number")
    
    # Create email for store member: use shortened store code for readability
    store_code = store_id.split("-")[0]  # first segment of UUID (8 chars)
    email_local_part = f"store_{store_code}_{username_sanitized}"
    # Ensure local part stays within RFC limits (64 chars)
    email_local_part = email_local_part[:64]
    email = f"{email_local_part}@store.internal"
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Member account already exists for this store")
    
    # Create user
    user = User(
        id=generate_id(),
        email=email,
        password_hash=hash_password(password),
        name=f"{store.name} - {username}",
        created_at=datetime.utcnow(),
    )
    db.add(user)
    db.flush()
    
    # Create membership with member role
    membership = Membership(
        id=generate_id(),
        user_id=user.id,
        org_id=current.organization.id,
        role=MembershipRole.member,
        created_at=datetime.utcnow(),
    )
    db.add(membership)
    db.flush()
    
    # Verify cameras belong to this store
    if camera_ids:
        cameras = db.query(CameraModel).filter(
            CameraModel.id.in_(camera_ids),
            CameraModel.store_id == store_id,
            CameraModel.org_id == current.organization.id
        ).all()
        if len(cameras) != len(camera_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more cameras not found or don't belong to this store")
    
    # Create dashboard permission (store-specific)
    dashboard_permission = MemberPermission(
        id=generate_id(),
        membership_id=membership.id,
        store_id=store_id,
        camera_id=None,  # NULL means dashboard
        can_view=can_access_dashboard,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(dashboard_permission)
    
    # Create camera permissions (store-specific)
    # NOTE: We CANNOT set store_id here because of uq_member_permission_store constraint
    # which only allows ONE permission per (membership_id, store_id) combination.
    # The dashboard permission already uses (membership_id, store_id), so we can't
    # create camera permissions with the same combination.
    # 
    # Workaround: Don't set store_id on camera permissions. They'll be identified by
    # camera_id, and we'll filter by store when querying (since cameras belong to stores).
    for camera_id in camera_ids:
        camera_permission = MemberPermission(
            id=generate_id(),
            membership_id=membership.id,
            store_id=None,  # Don't set to avoid uq_member_permission_store violation
            camera_id=camera_id,
            can_view=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(camera_permission)
    
    db.commit()
    
    return StoreMemberAccountResponse(
        message="Member account created successfully",
        user=UserInfo(id=user.id, email=email, name=user.name),
        username=username_sanitized,
        store_id=store_id,
        store_name=store.name,
    )


@router.put("/{store_id}/members/{membership_id}", response_model=StoreMemberAccountSummary)
def update_store_member_account(
    store_id: str,
    membership_id: str,
    payload: StoreMemberAccountUpdate,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> StoreMemberAccountSummary:
    store = db.query(StoreModel).filter(
        StoreModel.id == store_id,
        StoreModel.org_id == current.organization.id
    ).first()

    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    membership = (
        db.query(Membership)
        .filter(Membership.id == membership_id, Membership.org_id == current.organization.id, Membership.role == MembershipRole.member)
        .first()
    )

    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    user = db.query(User).filter(User.id == membership.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.password:
        password = payload.password
        if len(password) < 8:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")
        if len(password) > 128:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be less than 128 characters")
        if not re.search(r'[a-z]', password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one lowercase letter")
        if not re.search(r'[A-Z]', password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one uppercase letter")
        if not re.search(r'[0-9]', password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one number")
        user.password_hash = hash_password(password)

    camera_ids = payload.camera_ids or []
    if camera_ids:
        cameras = db.query(CameraModel).filter(
            CameraModel.id.in_(camera_ids),
            CameraModel.store_id == store_id,
            CameraModel.org_id == current.organization.id
        ).all()
        if len(cameras) != len(camera_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more cameras not found or don't belong to this store")

    # The uq_member_permission_store constraint on (membership_id, store_id) only allows
    # ONE permission per membership per store. This means we can only have:
    # - One dashboard permission (camera_id=NULL, store_id=store_id)
    # 
    # For camera permissions, we use the uq_member_permission_camera constraint on
    # (membership_id, camera_id), and we set store_id to link them to the store.
    # However, we need to be careful: if we try to create multiple camera permissions
    # with the same (membership_id, store_id), we'll hit the constraint.
    #
    # Solution: Delete ALL permissions for this membership and store first,
    # then recreate only the dashboard permission with store_id.
    # For camera permissions, we'll set store_id but they're constrained by (membership_id, camera_id).
    
    # Delete ALL existing permissions for this membership and store (dashboard permission)
    db.query(MemberPermission).filter(
        MemberPermission.membership_id == membership.id,
        MemberPermission.store_id == store_id,
    ).delete(synchronize_session=False)
    
    # Get ALL cameras that belong to this store (not just the ones being granted)
    all_store_cameras = db.query(CameraModel).filter(
        CameraModel.store_id == store_id,
        CameraModel.org_id == current.organization.id
    ).all()
    all_store_camera_ids = [c.id for c in all_store_cameras]
    
    # Delete ALL camera permissions for cameras in this store
    # This ensures that cameras that were previously granted but are now unchecked get removed
    if all_store_camera_ids:
        db.query(MemberPermission).filter(
            MemberPermission.membership_id == membership.id,
            MemberPermission.camera_id.in_(all_store_camera_ids),
        ).delete(synchronize_session=False)
    
    # Flush to ensure deletions are processed before inserts
    db.flush()

    # Create dashboard permission (store-specific) - this is the only one with store_id
    # Constrained by uq_member_permission_store on (membership_id, store_id)
    dashboard_permission = MemberPermission(
        id=generate_id(),
        membership_id=membership.id,
        store_id=store_id,
        camera_id=None,  # NULL means dashboard
        can_view=payload.can_access_dashboard,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(dashboard_permission)

    # Create camera permissions ONLY for cameras in the camera_ids list
    # NOTE: We CANNOT set store_id here because of uq_member_permission_store constraint
    # which only allows ONE permission per (membership_id, store_id) combination.
    # The dashboard permission already uses (membership_id, store_id), so we can't
    # create camera permissions with the same combination.
    # 
    # Workaround: Don't set store_id on camera permissions. They'll be identified by
    # camera_id, and we'll filter by store when querying (since cameras belong to stores).
    # TODO: Fix the database constraint to allow multiple permissions per store.
    for camera_id in camera_ids:
        # Create new camera permission without store_id to avoid constraint violation
        camera_permission = MemberPermission(
            id=generate_id(),
            membership_id=membership.id,
            store_id=None,  # Don't set to avoid uq_member_permission_store violation
            camera_id=camera_id,
            can_view=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(camera_permission)

    db.commit()

    rows = _query_store_memberships(db, store_id, current.organization.id, membership_id=membership.id)
    summaries = _build_store_member_summaries(store, rows)
    return summaries[0] if summaries else None


@router.get("/{store_id}/members", response_model=List[StoreMemberAccountSummary])
def list_store_members(
    store_id: str,
    current: CurrentMembership = Depends(require_manager),
    db: Session = Depends(get_db),
) -> List[StoreMemberAccountSummary]:
    """List store-specific member accounts and their permissions"""
    store = db.query(StoreModel).filter(
        StoreModel.id == store_id,
        StoreModel.org_id == current.organization.id
    ).first()

    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    rows = _query_store_memberships(db, store_id, current.organization.id)
    return _build_store_member_summaries(store, rows)
