"""End-to-end tests for alert workflow."""
import pytest
from fastapi import status
from datetime import datetime, timezone

from app.models.core import Alert, Camera, Store
from app.services.auth_service import generate_id


@pytest.mark.e2e
class TestAlertWorkflow:
    """Test complete alert workflow."""
    
    def test_alert_detection_to_acknowledgment(self, client, auth_headers, db, test_organization, test_store):
        """Test complete alert workflow: detection, listing, acknowledgment."""
        # 1. Create camera
        camera = Camera(
            id=generate_id(),
            name="Alert Test Camera",
            store_id=test_store.id,
            source="rtsp://alert-test.com/stream",
            ai_services=["yolo"],
            org_id=test_organization.id
        )
        db.add(camera)
        db.commit()
        
        # 2. Simulate alert creation (normally done by AI service)
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
            message="E2E test alert",
            acknowledged=False
        )
        db.add(alert)
        db.commit()
        
        # 3. Get alerts (should include our alert)
        get_response = client.get("/api/events/alerts", headers=auth_headers)
        assert get_response.status_code == status.HTTP_200_OK
        alerts = get_response.json()["alerts"]
        assert any(a["id"] == alert.id for a in alerts)
        assert any(not a["acknowledged"] for a in alerts if a["id"] == alert.id)
        
        # 4. Acknowledge alert
        ack_response = client.put(
            f"/api/events/alerts/{alert.id}/acknowledge",
            headers=auth_headers
        )
        assert ack_response.status_code == status.HTTP_200_OK
        
        # 5. Verify alert is acknowledged
        get_after_ack = client.get("/api/events/alerts", headers=auth_headers)
        alerts_after = get_after_ack.json()["alerts"]
        alert_after = next(a for a in alerts_after if a["id"] == alert.id)
        assert alert_after["acknowledged"] is True
