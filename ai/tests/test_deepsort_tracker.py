"""Unit tests for DeepSORT tracker."""
import pytest
from unittest.mock import Mock, patch, MagicMock

from detectors.deepsort_tracker import DeepSortTracker


@pytest.mark.unit
class TestDeepSortTracker:
    """Test DeepSORT tracker."""
    
    @patch('detectors.deepsort_tracker.DeepSort')
    def test_deepsort_initialization(self, mock_deepsort):
        """Test DeepSORT tracker initialization."""
        mock_tracker_instance = MagicMock()
        mock_deepsort.return_value = mock_tracker_instance
        
        tracker = DeepSortTracker(
            max_age=10,
            use_embedder=True,
            embedder="mobilenet",
            embedder_gpu=False
        )
        
        assert tracker.use_embedder is True
        mock_deepsort.assert_called_once()
    
    @patch('detectors.deepsort_tracker.DeepSort')
    def test_deepsort_update(self, mock_deepsort):
        """Test DeepSORT tracker update."""
        # Mock track objects that simulate DeepSORT's Track objects
        mock_track1 = MagicMock()
        mock_track1.is_confirmed.return_value = True
        mock_track1.track_id = 1
        mock_track1.to_ltrb.return_value = (100, 100, 200, 200)
        
        mock_track2 = MagicMock()
        mock_track2.is_confirmed.return_value = True
        mock_track2.track_id = 2
        mock_track2.to_ltrb.return_value = (300, 300, 400, 400)
        
        mock_tracker_instance = MagicMock()
        # DeepSORT's update_tracks returns a list of Track objects
        mock_tracker_instance.update_tracks.return_value = [mock_track1, mock_track2]
        mock_deepsort.return_value = mock_tracker_instance
        
        tracker = DeepSortTracker(max_age=10, use_embedder=False)
        
        # Create dummy detections: (x1, y1, x2, y2, conf, class)
        detections = [
            (100, 100, 200, 200, 0.9, 0),
            (300, 300, 400, 400, 0.8, 0)
        ]
        
        tracks = tracker.update(detections, frame=None)
        
        # Verify tracker.update_tracks was called (not update)
        # The actual implementation calls update_tracks with converted format
        assert mock_tracker_instance.update_tracks.called
        
        # The update method should return the tracks from the mock
        assert len(tracks) == 2
        assert tracks[0][0] == 1  # Track ID
        assert len(tracks[0][1]) == 4  # Bounding box
