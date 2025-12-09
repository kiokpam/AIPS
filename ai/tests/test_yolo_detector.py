"""Unit tests for YOLO ONNX detector."""
import pytest
import numpy as np
from unittest.mock import Mock, patch, MagicMock

# Try to import, but handle missing onnxruntime gracefully
try:
    from detectors.yolo_onnx_detector import YOLOONNXDetector
except ImportError as e:
    if 'onnxruntime' in str(e):
        pytest.skip("onnxruntime not installed - skipping YOLO tests", allow_module_level=True)
    raise


@pytest.mark.unit
class TestYOLODetector:
    """Test YOLO ONNX detector."""
    
    @patch('detectors.yolo_onnx_detector.ort')
    def test_yolo_initialization(self, mock_ort):
        """Test YOLO detector initialization."""
        mock_session = MagicMock()
        mock_session.get_inputs.return_value = [MagicMock(name="input")]
        mock_session.get_outputs.return_value = [MagicMock(name="output")]
        
        mock_ort.InferenceSession.return_value = mock_session
        mock_ort.get_available_providers.return_value = ['CPUExecutionProvider']
        
        detector = YOLOONNXDetector(
            "models/yolov8n.onnx",
            device="cpu",
            conf_thresh=0.35,
            iou_thresh=0.45
        )
        
        assert detector.conf_thresh == 0.35
        assert detector.iou_thresh == 0.45
        assert detector.person_only is True
    
    @patch('detectors.yolo_onnx_detector.ort')
    def test_yolo_preprocess(self, mock_ort):
        """Test YOLO preprocessing."""
        mock_session = MagicMock()
        mock_session.get_inputs.return_value = [MagicMock(name="input")]
        mock_session.get_outputs.return_value = [MagicMock(name="output")]
        
        mock_ort.InferenceSession.return_value = mock_session
        mock_ort.get_available_providers.return_value = ['CPUExecutionProvider']
        
        detector = YOLOONNXDetector("models/yolov8n.onnx", device="cpu")
        
        # Create dummy frame
        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        
        input_tensor, scale, pad = detector.preprocess(frame)
        
        assert input_tensor.shape[0] == 1  # Batch dimension
        assert input_tensor.shape[1] == 3  # Channels
        assert input_tensor.shape[2] == 640  # Height
        assert input_tensor.shape[3] == 640  # Width
        assert scale > 0
        assert isinstance(pad, tuple)
        assert len(pad) == 2
