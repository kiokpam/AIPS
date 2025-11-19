import re
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, field_validator

from app.models.core import MembershipRole


class BaseSignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if len(v) > 128:
            raise ValueError('Password must be less than 128 characters')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        return v

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError('Name must be at least 2 characters long')
        if len(v) > 100:
            raise ValueError('Name must be less than 100 characters')
        if not re.match(r"^[a-zA-Z\s'-]+$", v):
            raise ValueError('Name can only contain letters, spaces, hyphens, and apostrophes')
        return v


class MemberSignupRequest(BaseSignupRequest):
    invite_token: Optional[str] = None  # Optional invite token
    join_code: Optional[str] = None  # Optional organization join code

    @field_validator('invite_token', 'join_code', mode='before')
    @classmethod
    def empty_str_to_none(cls, v):
        """Convert empty strings to None for optional fields"""
        if v == "":
            return None
        return v


class ManagerSignupRequest(BaseSignupRequest):
    organization_name: str

    @field_validator('organization_name')
    @classmethod
    def validate_organization_name(cls, v: str) -> str:
        name = v.strip()
        if len(name) < 2:
            raise ValueError('Organization name must be at least 2 characters long')
        if len(name) > 150:
            raise ValueError('Organization name must be less than 150 characters')
        if not re.match(r"^[a-zA-Z0-9\s&'()-]+$", name):
            raise ValueError("Organization name can only contain letters, numbers, spaces, and basic punctuation (& ' ( ) -)")
        return name


# Backwards compatibility for existing imports
SignupRequest = MemberSignupRequest


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    organization_id: Optional[str] = None


class MemberLoginRequest(BaseModel):
    organization_id: Optional[str] = None  # Organization ID or name
    organization_name: Optional[str] = None  # Alternative: organization name
    join_code: Optional[str] = None  # Alternative: join code
    password: str


class SetMemberPasswordRequest(BaseModel):
    password: str


class SwitchOrganizationRequest(BaseModel):
    organization_id: str


class OrganizationInfo(BaseModel):
    id: str
    name: str


class UserInfo(BaseModel):
    id: str
    email: EmailStr
    name: str


class MembershipInfo(BaseModel):
    id: str
    organization: OrganizationInfo
    role: MembershipRole


class ProfileResponse(BaseModel):
    user: UserInfo
    active_membership: MembershipInfo
    memberships: List[MembershipInfo]


class AuthResponse(ProfileResponse):
    access_token: str
    token_type: str = "bearer"


class InviteMemberRequest(BaseModel):
    email: EmailStr
    name: str
    password: Optional[str] = None
    role: MembershipRole = MembershipRole.member


class MembershipResponse(BaseModel):
    id: str
    user: UserInfo
    organization: OrganizationInfo
    role: MembershipRole


class MembersResponse(BaseModel):
    members: List[MembershipResponse]


class CreateOrganizationRequest(BaseModel):
    name: str


class OrganizationResponse(BaseModel):
    id: str
    name: str
    join_code: Optional[str] = None
    created_at: datetime


class CreateInviteRequest(BaseModel):
    email: Optional[EmailStr] = None  # Optional: specific email, or None for open invite
    role: MembershipRole = MembershipRole.member
    expires_in_days: Optional[int] = 7  # Days until invite expires


class InviteResponse(BaseModel):
    id: str
    token: str
    invite_url: str
    email: Optional[str] = None
    role: MembershipRole
    expires_at: Optional[datetime] = None
    used_at: Optional[datetime] = None
    created_at: datetime


class InvitesResponse(BaseModel):
    invites: List[InviteResponse]


class GenerateJoinCodeRequest(BaseModel):
    enabled: bool = True  # Enable/disable join code


class UpdateMemberRoleRequest(BaseModel):
    role: MembershipRole


class MemberPermissionRequest(BaseModel):
    membership_id: str
    store_id: Optional[str] = None  # Store ID for store-specific access, None for org-wide
    camera_ids: List[str] = []  # List of camera IDs, empty list means no camera access
    can_access_dashboard: bool = True  # Whether member can access dashboard


class MemberPermissionResponse(BaseModel):
    membership_id: str
    user: UserInfo
    store_id: Optional[str] = None  # Store ID if this is store-specific access
    accessible_cameras: List[str] = []  # List of camera IDs the member can access
    can_access_dashboard: bool