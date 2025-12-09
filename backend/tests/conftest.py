"""Pytest configuration and shared fixtures."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base
from app.db.session import SessionLocal
from app.services.auth_service import hash_password, generate_id
from app.models.core import User, Organization, Membership, MembershipRole, Store


# In-memory SQLite database for testing
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    """Create a fresh database for each test."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db):
    """Create a test client with database override."""
    from app.api.deps import get_db
    import os
    
    # Disable database connection attempts during tests
    os.environ['SKIP_DB_INIT'] = '1'
    
    def override_get_db():
        try:
            yield db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    
    # Create test client without triggering startup events
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    os.environ.pop('SKIP_DB_INIT', None)


@pytest.fixture
def test_user(db):
    """Create a test user."""
    user = User(
        id=generate_id(),
        email="test@example.com",
        password_hash=hash_password("testpassword123"),
        name="Test User"
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def test_organization(db):
    """Create a test organization."""
    org = Organization(
        id=generate_id(),
        name="Test Organization"
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@pytest.fixture
def test_manager_membership(db, test_user, test_organization):
    """Create a manager membership."""
    membership = Membership(
        id=generate_id(),
        user_id=test_user.id,
        org_id=test_organization.id,
        role=MembershipRole.manager
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


@pytest.fixture
def test_member_membership(db, test_user, test_organization):
    """Create a member (non-manager) membership."""
    membership = Membership(
        id=generate_id(),
        user_id=test_user.id,
        org_id=test_organization.id,
        role=MembershipRole.member
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


@pytest.fixture
def test_store(db, test_organization):
    """Create a test store."""
    store = Store(
        id=generate_id(),
        name="Test Store",
        org_id=test_organization.id
    )
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


@pytest.fixture
def auth_token(client, test_user, test_organization, test_manager_membership):
    """Get authentication token for test user."""
    response = client.post(
        "/api/auth/login",
        json={
            "email": test_user.email,
            "password": "testpassword123"
        }
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture
def auth_headers(auth_token):
    """Get authorization headers."""
    return {"Authorization": f"Bearer {auth_token}"}
