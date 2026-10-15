"""Unit tests for JWT secret validation in app settings."""
import logging

import pytest

from app.config.settings import DEV_JWT_SECRET, Settings, validate_jwt_secret


@pytest.mark.unit
class TestJwtSecretValidation:
    """The backend must not run in production with a known JWT secret."""

    @pytest.mark.parametrize("env_name", ["production", "PRODUCTION", "prod"])
    def test_default_secret_refused_in_production(self, env_name):
        settings = Settings(environment=env_name, jwt_secret=DEV_JWT_SECRET)
        with pytest.raises(RuntimeError, match="JWT_SECRET"):
            validate_jwt_secret(settings)

    def test_placeholder_secret_refused_in_production(self):
        settings = Settings(environment="production", jwt_secret="change-me")
        with pytest.raises(RuntimeError):
            validate_jwt_secret(settings)

    def test_default_secret_warns_in_dev(self, caplog):
        settings = Settings(environment="dev", jwt_secret=DEV_JWT_SECRET)
        with caplog.at_level(logging.WARNING, logger="app.config.settings"):
            validate_jwt_secret(settings)
        assert "SECURITY WARNING" in caplog.text

    def test_real_secret_accepted_in_production(self, caplog):
        settings = Settings(environment="production", jwt_secret="a-long-random-test-value-123456")
        with caplog.at_level(logging.WARNING, logger="app.config.settings"):
            validate_jwt_secret(settings)
        assert "SECURITY WARNING" not in caplog.text
