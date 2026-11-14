"""Integration tests for clip deletion (DELETE /api/clips/{filename})."""
import pytest

from app.api import clips as clips_module
from app.models.core import Camera, Organization, Store
from app.services.auth_service import generate_id


@pytest.fixture
def clips_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(clips_module, "CLIPS_DIR", tmp_path)
    return tmp_path


def _make_camera(db, org_id, store_id):
    cam = Camera(
        id=generate_id(),
        store_id=store_id,
        org_id=org_id,
        name="Cam",
        source="0",
        ai_services=[],
        is_active=False,
    )
    db.add(cam)
    db.commit()
    return cam


def _make_clip(clips_dir, camera_id):
    # Same naming scheme as the AI service: {camera_id}_{track_id}_{label}_{score}.mp4
    path = clips_dir / f"{camera_id}_7_shoplifting_87.mp4"
    path.write_bytes(b"fake video")
    return path


@pytest.mark.integration
class TestDeleteClip:

    def test_delete_without_token_returns_401(self, client, clips_dir):
        response = client.delete("/api/clips/anything.mp4")
        assert response.status_code == 401

    def test_delete_with_invalid_token_returns_401(self, client, clips_dir):
        response = client.delete(
            "/api/clips/anything.mp4",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert response.status_code == 401

    def test_manager_deletes_own_org_clip(
        self, client, db, clips_dir, auth_headers, test_organization, test_store
    ):
        cam = _make_camera(db, test_organization.id, test_store.id)
        clip = _make_clip(clips_dir, cam.id)

        response = client.delete(f"/api/clips/{clip.name}", headers=auth_headers)

        assert response.status_code == 200
        assert not clip.exists()

    def test_manager_cannot_delete_other_org_clip(self, client, db, clips_dir, auth_headers):
        other_org = Organization(id=generate_id(), name="Other Org")
        db.add(other_org)
        db.commit()
        other_store = Store(id=generate_id(), name="Other Store", org_id=other_org.id)
        db.add(other_store)
        db.commit()
        cam = _make_camera(db, other_org.id, other_store.id)
        clip = _make_clip(clips_dir, cam.id)

        response = client.delete(f"/api/clips/{clip.name}", headers=auth_headers)

        assert response.status_code == 404
        assert clip.exists()

    def test_member_cannot_delete(
        self, client, db, clips_dir, test_user, test_organization, test_member_membership, test_store
    ):
        cam = _make_camera(db, test_organization.id, test_store.id)
        clip = _make_clip(clips_dir, cam.id)
        login = client.post(
            "/api/auth/login",
            json={"email": test_user.email, "password": "testpassword123"},
        )
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        response = client.delete(f"/api/clips/{clip.name}", headers=headers)

        assert response.status_code == 403
        assert clip.exists()
