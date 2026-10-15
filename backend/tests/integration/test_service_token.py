"""Integration tests for the optional AI service token (AI_SERVICE_TOKEN)."""
import pytest
from starlette.websockets import WebSocketDisconnect

from app.models.core import Camera
from app.services.auth_service import generate_id

TOKEN = "test-service-token"


@pytest.fixture
def camera(db, test_store, test_organization):
    cam = Camera(
        id=generate_id(),
        store_id=test_store.id,
        org_id=test_organization.id,
        name="Entrance",
        source="rtsp://user:pass@camera.local:554/stream",
        ai_services=["people_counting"],
        is_active=True,
    )
    db.add(cam)
    db.commit()
    return cam


@pytest.mark.integration
class TestServiceTokenUnset:
    """Without AI_SERVICE_TOKEN the internal endpoints keep working as before."""

    def test_ai_camera_list_open(self, client, camera, monkeypatch):
        monkeypatch.delenv("AI_SERVICE_TOKEN", raising=False)
        response = client.get("/api/ai/cameras")
        assert response.status_code == 200
        assert [c["camera_id"] for c in response.json()] == [camera.id]

    def test_ai_camera_list_hides_source(self, client, camera, monkeypatch):
        monkeypatch.delenv("AI_SERVICE_TOKEN", raising=False)
        response = client.get("/api/ai/cameras")
        assert response.status_code == 200
        assert "source" not in response.json()[0]

    def test_ai_camera_config_hides_source(self, client, camera, monkeypatch):
        monkeypatch.delenv("AI_SERVICE_TOKEN", raising=False)
        response = client.get(f"/api/ai/cameras/{camera.id}/config")
        assert response.status_code == 200
        assert "source" not in response.json()


@pytest.mark.integration
class TestServiceTokenSet:
    """With AI_SERVICE_TOKEN set, callers must send X-Service-Token."""

    @pytest.fixture(autouse=True)
    def _set_token(self, monkeypatch):
        monkeypatch.setenv("AI_SERVICE_TOKEN", TOKEN)

    def test_missing_header_rejected(self, client, camera):
        assert client.get("/api/ai/cameras").status_code == 401

    def test_wrong_header_rejected(self, client, camera):
        response = client.get("/api/ai/cameras", headers={"X-Service-Token": "wrong"})
        assert response.status_code == 401

    def test_correct_header_accepted(self, client, camera):
        response = client.get("/api/ai/cameras", headers={"X-Service-Token": TOKEN})
        assert response.status_code == 200

    def test_frame_endpoint_protected(self, client, camera):
        assert client.get(f"/api/ai/cameras/{camera.id}/frame").status_code == 401

    def test_anomaly_event_protected(self, client):
        assert client.post("/api/events/anomaly-detected", json={}).status_code == 401

    def test_ai_websocket_rejected_without_token(self, client, camera):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/api/ws/detections/ai/{camera.id}") as ws:
                ws.receive_json()

    def test_ai_websocket_accepted_with_header(self, client, camera):
        with client.websocket_connect(
            f"/api/ws/detections/ai/{camera.id}",
            headers={"X-Service-Token": TOKEN},
        ) as ws:
            ws.close()
