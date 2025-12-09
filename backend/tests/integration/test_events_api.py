"""Integration tests for events API endpoints."""
import pytest
from fastapi import status
from datetime import datetime, timezone

from app.models.core import Alert, Camera, Store
from app.services.auth_service import generate_id


@pytest.mark.integration
class TestAlertsAPI:
    """Test alerts API endpoints."""
    
    def test_get_alerts(self, client, auth_headers, db, test_organization, test_store):
        """Test getting list of alerts."""
        # Create a test camera
        camera = Camera(
            id=generate_id(),
            name="Test Camera",
            store_id=test_store.id,
            source="rtsp://test.com/stream",
            ai_services=["yolo"],
            org_id=test_organization.id
        )
        db.add(camera)
        db.commit()
        
        # Create a test alert
        alert = Alert(
            id=generate_id(),
            camera_id=camera.id,
            store_id=test_store.id,
            org_id=test_organization.id,
            type="anomaly",
            anomaly_type="shoplifting",
            severity="high",
            confidence=0.95,
            timestamp=datetime.now(timezone.utc),
            message="Test alert"
        )
        db.add(alert)
        db.commit()
        
        response = client.get("/api/events/alerts", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "alerts" in data
        assert len(data["alerts"]) >= 1
        assert any(a["id"] == alert.id for a in data["alerts"])
    
    def test_get_alerts_with_filters(self, client, auth_headers, db, test_organization, test_store):
        """Test getting alerts with filters."""
        camera = Camera(
            id=generate_id(),
            name="Test Camera",
            store_id=test_store.id,
            source="rtsp://test.com/stream",
            ai_services=["yolo"],
            org_id=test_organization.id
        )
        db.add(camera)
        db.commit()
        
        alert = Alert(
            id=generate_id(),
            camera_id=camera.id,
            store_id=test_store.id,
            org_id=test_organization.id,
            type="anomaly",
            anomaly_type="shoplifting",
            severity="high",
            confidence=0.95,
            timestamp=datetime.now(timezone.utc),
            message="Test alert"
        )
        db.add(alert)
        db.commit()
        
        response = client.get(
            f"/api/events/alerts?store_id={test_store.id}&anomaly_type=shoplifting",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "alerts" in data
        # All returned alerts should match the filter
        for a in data["alerts"]:
            assert a["store_id"] == test_store.id
            assert a["anomaly_type"] == "shoplifting"
    
    def test_acknowledge_alert(self, client, auth_headers, db, test_organization, test_store):
        """Test acknowledging an alert."""
        camera = Camera(
            id=generate_id(),
            name="Test Camera",
            store_id=test_store.id,
            source="rtsp://test.com/stream",
            ai_services=["yolo"],
            org_id=test_organization.id
        )
        db.add(camera)
        db.commit()
        
        alert = Alert(
            id=generate_id(),
            camera_id=camera.id,
            store_id=test_store.id,
            org_id=test_organization.id,
            type="anomaly",
            anomaly_type="shoplifting",
            severity="high",
            confidence=0.95,
            timestamp=datetime.now(timezone.utc),
            message="Test alert",
            acknowledged=False
        )
        db.add(alert)
        db.commit()
        
        response = client.put(
            f"/api/events/alerts/{alert.id}/acknowledge",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        
        # Verify alert was acknowledged
        db.refresh(alert)
        assert alert.acknowledged is True
