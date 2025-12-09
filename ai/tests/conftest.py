"""Pytest configuration for AI tests."""
import pytest
import numpy as np
from unittest.mock import MagicMock, patch


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
