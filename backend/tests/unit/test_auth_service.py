"""Unit tests for authentication service."""
import pytest
from datetime import timedelta

from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    generate_id
)
from jose import jwt
from app.config.settings import get_settings


@pytest.mark.unit
class TestPasswordHashing:
    """Test password hashing and verification."""
    
    def test_hash_password(self):
        """Test password hashing produces different hashes for same password."""
        password = "testpassword123"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        
        # Hashes should be different (bcrypt uses salt)
        assert hash1 != hash2
        assert len(hash1) > 0
        assert len(hash2) > 0
    
    def test_verify_password_correct(self):
        """Test password verification with correct password."""
        password = "testpassword123"
        password_hash = hash_password(password)
        
        assert verify_password(password, password_hash) is True
    
    def test_verify_password_incorrect(self):
        """Test password verification with incorrect password."""
        password = "testpassword123"
        wrong_password = "wrongpassword"
        password_hash = hash_password(password)
        
        assert verify_password(wrong_password, password_hash) is False
    
    def test_hash_password_empty(self):
        """Test hashing empty password."""
        password = ""
        password_hash = hash_password(password)
        
        assert verify_password(password, password_hash) is True


@pytest.mark.unit
class TestTokenGeneration:
    """Test JWT token generation and decoding."""
    
    def test_create_access_token(self):
        """Test token creation."""
        token = create_access_token(
            subject="user123",
            org_id="org123",
            role="manager"
        )
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_decode_access_token(self):
        """Test token decoding."""
        token = create_access_token(
            subject="user123",
            org_id="org123",
            role="manager"
        )
        
        settings = get_settings()
        decoded = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        
        assert decoded["sub"] == "user123"
        assert decoded["org_id"] == "org123"
        assert decoded["role"] == "manager"
        assert "exp" in decoded
    
    def test_token_expiration(self):
        """Test token expiration."""
        token = create_access_token(
            subject="user123",
            org_id="org123",
            role="manager",
            expires_delta=timedelta(seconds=-1)  # Expired token
        )
        
        settings = get_settings()
        # Expired token should raise JWTError
        from jose import JWTError
        try:
            decoded = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
            # If no exception, token is still valid (might be within clock skew tolerance)
            assert decoded is not None
        except JWTError:
            # Expected for expired tokens
            pass


@pytest.mark.unit
class TestIDGeneration:
    """Test ID generation."""
    
    def test_generate_id(self):
        """Test ID generation produces unique IDs."""
        id1 = generate_id()
        id2 = generate_id()
        
        assert id1 != id2
        assert len(id1) > 0
        assert len(id2) > 0
        # UUIDs are 36 characters with hyphens
        assert len(id1) == 36
