"""Pytest configuration for AI tests."""
import pytest
import numpy as np
from unittest.mock import MagicMock, patch
from .mocks.onnx_mocks import MockONNXRuntime, mock_yolo_session, mock_mobilenet_session, mock_videomae_session


@pytest.fixture
def dummy_frame():
    """Create a dummy video frame for testing."""
    return np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)


@pytest.fixture
def dummy_frames():
    """Create dummy video frames for testing."""
    return [np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8) for _ in range(16)]


@pytest.fixture
def dummy_detections():
    """Create dummy YOLO detections."""
    # Format: (x1, y1, x2, y2, conf, class)
    return [
        (100, 100, 200, 200, 0.9, 0),  # Person detection
        (300, 300, 400, 400, 0.8, 0),  # Person detection
    ]


@pytest.fixture
def mock_onnxruntime():
    """Provide a complete ONNX runtime mock."""
    return MockONNXRuntime()


@pytest.fixture
def mock_yolo():
    """Provide a pre-configured YOLO mock session."""
    return mock_yolo_session()


@pytest.fixture
def mock_mobilenet():
    """Provide a pre-configured MobileNet mock session."""
    return mock_mobilenet_session()


@pytest.fixture
def mock_videomae():
    """Provide a pre-configured VideoMAE mock session."""
    return mock_videomae_session()


@pytest.fixture
def mock_deepsort_tracker():
    """Mock DeepSortTracker for testing without deep-sort-realtime."""
    class MockDeepSortTracker:
        """Mock tracker that simulates DeepSORT behavior."""
        
        def __init__(self, *args, **kwargs):
            self.next_id = 1
            self.active_tracks = {}
        
        def update(self, detections, frame=None):
            """Mock update that returns tracked objects.
            
            Args:
                detections: List of detections [(x1, y1, x2, y2, conf, class), ...]
                frame: Frame (ignored in mock)
            
            Returns:
                List of tracks [(x1, y1, x2, y2, track_id), ...]
            """
            tracked_objects = []
            
            for det in detections:
                if len(det) >= 4:
                    x1, y1, x2, y2 = det[:4]
                    
                    # Simple mock: assign sequential track IDs
                    # In real DeepSORT, this would use appearance features
                    bbox_key = (int(x1), int(y1), int(x2), int(y2))
                    
                    if bbox_key not in self.active_tracks:
                        self.active_tracks[bbox_key] = self.next_id
                        self.next_id += 1
                    
                    track_id = self.active_tracks[bbox_key]
                    tracked_objects.append([x1, y1, x2, y2, track_id])
            
            return tracked_objects
    
    return MockDeepSortTracker
