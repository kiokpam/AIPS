"""Unit tests for camera manager service."""
import pytest
import numpy as np
from unittest.mock import Mock, patch, MagicMock

from app.services.camera_manager import CameraManager, VideoStream, CameraWorker


@pytest.mark.unit
class TestVideoStream:
    """Test VideoStream class."""
    
    @patch('cv2.VideoCapture')
    def test_video_stream_initialization(self, mock_capture):
        """Test VideoStream initialization."""
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        mock_cap.get.return_value = 30.0  # FPS
        mock_capture.return_value = mock_cap
        
        stream = VideoStream("test_video.mp4")
        
        # VideoStream normalizes relative paths to absolute, so check that src contains the filename
        assert "test_video.mp4" in str(stream.src)
        assert stream.video_fps == 30.0
        assert stream.is_video_file is True
    
    @patch('cv2.VideoCapture')
    def test_video_stream_rtsp_source(self, mock_capture):
        """Test VideoStream with RTSP source."""
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        mock_cap.get.return_value = 25.0
        mock_capture.return_value = mock_cap
        
        stream = VideoStream("rtsp://example.com/stream")
        
        assert stream.src == "rtsp://example.com/stream"
        assert stream.is_video_file is False


@pytest.mark.unit
class TestCameraManager:
    """Test CameraManager class."""
    
    def test_camera_manager_initialization(self):
        """Test CameraManager initialization."""
        manager = CameraManager(max_cameras=5)
        
        assert manager.max_cameras == 5
        assert len(manager.cameras) == 0
    
    def test_add_camera(self):
        """Test adding a camera."""
        manager = CameraManager(max_cameras=5)
        
        with patch('app.services.camera_manager.CameraWorker') as mock_worker:
            mock_worker_instance = MagicMock()
            mock_worker.return_value = mock_worker_instance
            
            result = manager.add_camera(
                camera_id="camera1",
                store_id="store1",
                source="rtsp://test.com/stream",
                name="Test Camera"
            )
            
            assert result is True
            assert "camera1" in manager.cameras
    
    def test_remove_camera(self):
        """Test removing a camera."""
        manager = CameraManager(max_cameras=5)
        
        with patch('app.services.camera_manager.CameraWorker') as mock_worker:
            mock_worker_instance = MagicMock()
            mock_worker.return_value = mock_worker_instance
            
            manager.add_camera(
                camera_id="camera1",
                store_id="store1",
                source="rtsp://test.com/stream",
                name="Test Camera"
            )
            manager.remove_camera("camera1")
            
            assert "camera1" not in manager.cameras
