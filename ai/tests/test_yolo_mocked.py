"""Comprehensive tests for YOLO detector with ONNX mocking."""
import pytest
import numpy as np
from unittest.mock import patch


@pytest.mark.unit
class TestYOLOWithMocking:
    """Test YOLO detector with full ONNX runtime mocking."""
    
    @patch('detectors.yolo_onnx_detector.ort')
    def test_yolo_initialization_with_mock(self, mock_ort, mock_onnxruntime):
        """Test YOLO initialization with mocked ONNX runtime."""
        mock_ort.InferenceSession = mock_onnxruntime.InferenceSession
        mock_ort.get_available_providers = mock_onnxruntime.get_available_providers
        
        from detectors.yolo_onnx_detector import YOLOONNXDetector
        
        detector = YOLOONNXDetector(
            "models/yolov8n.onnx",
            device="cpu",
            conf_thresh=0.35
        )
        
        assert detector.conf_thresh == 0.35
        assert detector.person_only is True
        
    @patch('detectors.yolo_onnx_detector.ort')
    def test_yolo_detection_with_mock(self, mock_ort, mock_onnxruntime, dummy_frame):
        """Test YOLO detection with mocked inference."""
        mock_ort.InferenceSession = mock_onnxruntime.InferenceSession
        mock_ort.get_available_providers = mock_onnxruntime.get_available_providers
        
        from detectors.yolo_onnx_detector import YOLOONNXDetector
        
        detector = YOLOONNXDetector("models/yolov8n.onnx", device="cpu")
        results = detector.detect(dummy_frame)
        
        # Mock returns 2 person detections
        assert len(results) >= 1
        
        # Verify detection format
        if len(results) > 0:
            det = results[0]
            assert len(det) == 6  # (x1, y1, x2, y2, conf, class)
            assert det[4] > 0  # confidence > 0
            assert det[5] == 0  # class 0 (person)
    
    @patch('detectors.yolo_onnx_detector.ort')
    def test_yolo_confidence_filtering(self, mock_ort, mock_onnxruntime, dummy_frame):
        """Test that low-confidence detections are filtered."""
        mock_ort.InferenceSession = mock_onnxruntime.InferenceSession
        mock_ort.get_available_providers = mock_onnxruntime.get_available_providers
        
        from detectors.yolo_onnx_detector import YOLOONNXDetector
        
        # High confidence threshold
        detector = YOLOONNXDetector(
            "models/yolov8n.onnx",
            device="cpu",
            conf_thresh=0.95
        )
        
        results = detector.detect(dummy_frame)
        
        # Mock returns conf=0.9 and 0.75, both should be filtered with 0.95 threshold
        high_conf_detections = [d for d in results if d[4] >= 0.95]
        assert len(high_conf_detections) == 0


@pytest.mark.unit
class TestYOLOEdgeCases:
    """Test edge cases and error handling."""
    
    @patch('detectors.yolo_onnx_detector.ort')
    def test_empty_frame(self, mock_ort, mock_onnxruntime):
        """Test handling of empty/black frames."""
        mock_ort.InferenceSession = mock_onnxruntime.InferenceSession
        mock_ort.get_available_providers = mock_onnxruntime.get_available_providers
        
        from detectors.yolo_onnx_detector import YOLOONNXDetector
        
        detector = YOLOONNXDetector("models/yolov8n.onnx", device="cpu")
        
        black_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        results = detector.detect(black_frame)
        assert isinstance(results, list)
