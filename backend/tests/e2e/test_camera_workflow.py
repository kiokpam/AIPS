"""End-to-end tests for camera management workflow."""
import pytest
from fastapi import status
from unittest.mock import patch, MagicMock

from app.models.core import Camera, Store
from app.services.auth_service import generate_id


@pytest.mark.e2e
class TestCameraWorkflow:
    """Test complete camera management workflow."""
    
    @patch('app.services.camera_manager.VideoStream')
    @patch('app.services.camera_manager.CameraWorker')
    def test_complete_camera_lifecycle(self, mock_camera_worker, mock_video_stream, client, auth_headers, db, test_organization, test_store):
        """Test complete camera lifecycle: create, update, get, delete."""
        # Mock VideoStream to avoid actually opening RTSP streams
        mock_stream = MagicMock()
        mock_stream.isOpened.return_value = True
        mock_stream.get.return_value = 30.0
        mock_stream.running = True
        mock_video_stream.return_value = mock_stream
        
        # Mock CameraWorker
        mock_worker = MagicMock()
        mock_worker.stream = mock_stream
        mock_camera_worker.return_value = mock_worker
        
        # 1. Create camera
        create_response = client.post(
            "/api/cameras",
            json={
                "name": "E2E Test Camera",
                "store_id": test_store.id,
                "source": "rtsp://e2e-test.example.com/stream",
                "ai_services": ["yolo", "deepsort"]
            },
            headers=auth_headers
        )
        
        assert create_response.status_code == status.HTTP_201_CREATED
        camera_data = create_response.json()
        camera_id = camera_data["id"]
        
        # 2. Get camera
        get_response = client.get(f"/api/cameras/{camera_id}", headers=auth_headers)
        assert get_response.status_code == status.HTTP_200_OK
        assert get_response.json()["name"] == "E2E Test Camera"
        
        # 3. Update camera
        update_response = client.put(
            f"/api/cameras/{camera_id}",
            json={
                "name": "Updated E2E Camera",
                "source": "rtsp://updated-e2e.example.com/stream"
            },
            headers=auth_headers
        )
        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.json()["name"] == "Updated E2E Camera"
        
        # 4. List cameras (should include our camera)
        list_response = client.get("/api/cameras", headers=auth_headers)
        assert list_response.status_code == status.HTTP_200_OK
        cameras = list_response.json()  # Returns List directly
        assert any(c["id"] == camera_id for c in cameras)
        
        # 5. Delete camera
        delete_response = client.delete(f"/api/cameras/{camera_id}", headers=auth_headers)
        # Delete endpoint returns 200 with message, not 204
        assert delete_response.status_code == status.HTTP_200_OK
        
        # 6. Verify camera is deleted
        get_deleted_response = client.get(f"/api/cameras/{camera_id}", headers=auth_headers)
        assert get_deleted_response.status_code == status.HTTP_404_NOT_FOUND
