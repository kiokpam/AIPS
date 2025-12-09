"""Integration tests for cameras API endpoints."""
import pytest
from fastapi import status
from unittest.mock import patch, MagicMock

from app.models.core import Camera, Store


@pytest.mark.integration
class TestCameraManagement:
    """Test camera management endpoints."""
    
    @patch('app.services.camera_manager.VideoStream')
    @patch('app.services.camera_manager.CameraWorker')
    def test_create_camera(self, mock_camera_worker, mock_video_stream, client, auth_headers, test_store):
        """Test creating a new camera."""
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
        
        response = client.post(
            "/api/cameras",
            json={
                "name": "Test Camera",
                "store_id": test_store.id,
                "source": "rtsp://test.example.com/stream",
                "ai_services": ["yolo", "deepsort"]
            },
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "Test Camera"
        assert data["store_id"] == test_store.id
        assert "id" in data
    
    def test_get_cameras(self, client, auth_headers, db, test_store, test_organization):
        """Test getting list of cameras."""
        # Create a test camera
        from app.services.auth_service import generate_id
        camera = Camera(
            id=generate_id(),
            name="Test Camera",
            store_id=test_store.id,
            source="rtsp://test.example.com/stream",
            ai_services=["yolo"],
            org_id=test_organization.id
        )
        db.add(camera)
        db.commit()
        
        response = client.get("/api/cameras", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # API returns List[CameraSchema] directly, not wrapped
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(c["id"] == camera.id for c in data)
    
    def test_get_camera_by_id(self, client, auth_headers, db, test_store, test_organization):
        """Test getting a specific camera."""
        from app.services.auth_service import generate_id
        camera = Camera(
            id=generate_id(),
            name="Test Camera",
            store_id=test_store.id,
            source="rtsp://test.example.com/stream",
            ai_services=["yolo"],
            org_id=test_organization.id
        )
        db.add(camera)
        db.commit()
        
        response = client.get(f"/api/cameras/{camera.id}", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == camera.id
        assert data["name"] == "Test Camera"
    
    @patch('app.services.camera_manager.VideoStream')
    @patch('app.services.camera_manager.CameraWorker')
    def test_update_camera(self, mock_camera_worker, mock_video_stream, client, auth_headers, db, test_store, test_organization):
        """Test updating a camera."""
        from app.services.auth_service import generate_id
        # Mock VideoStream to avoid actually opening RTSP streams
        mock_stream = MagicMock()
        mock_stream.isOpened.return_value = True
        mock_stream.get.return_value = 30.0
        mock_stream.running = True
        mock_video_stream.return_value = mock_stream
        
        # Mock CameraWorker for restart
        mock_worker = MagicMock()
        mock_worker.stream = mock_stream
        mock_camera_worker.return_value = mock_worker
        
        camera = Camera(
            id=generate_id(),
            name="Test Camera",
            store_id=test_store.id,
            source="rtsp://test.example.com/stream",
            ai_services=["yolo"],
            org_id=test_organization.id
        )
        db.add(camera)
        db.commit()
        
        response = client.put(
            f"/api/cameras/{camera.id}",
            json={
                "name": "Updated Camera",
                "source": "rtsp://updated.example.com/stream"
            },
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "Updated Camera"
    
    def test_delete_camera(self, client, auth_headers, db, test_store, test_organization):
        """Test deleting a camera."""
        from app.services.auth_service import generate_id
        camera = Camera(
            id=generate_id(),
            name="Test Camera",
            store_id=test_store.id,
            source="rtsp://test.example.com/stream",
            ai_services=["yolo"],
            org_id=test_organization.id
        )
        db.add(camera)
        db.commit()
        
        response = client.delete(f"/api/cameras/{camera.id}", headers=auth_headers)
        
        # Delete endpoint returns 200 with message, not 204
        assert response.status_code == status.HTTP_200_OK
        assert "message" in response.json()
        
        # Verify camera was deleted
        deleted_camera = db.query(Camera).filter(Camera.id == camera.id).first()
        assert deleted_camera is None
