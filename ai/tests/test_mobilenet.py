"""Unit tests for MobileNet ONNX runner."""
import pytest
import numpy as np
from unittest.mock import Mock, patch, MagicMock

# Try to import, but handle missing onnxruntime gracefully
try:
    from ai.mobilenet_onnx_runner import MobileNetONNXRunner
except ImportError as e:
    if 'onnxruntime' in str(e):
        pytest.skip("onnxruntime not installed - skipping MobileNet tests", allow_module_level=True)
    raise


@pytest.mark.unit
class TestMobileNetRunner:
    """Test MobileNet ONNX runner."""
    
    @patch('ai.mobilenet_onnx_runner.ort')
    def test_mobilenet_initialization(self, mock_ort):
        """Test MobileNet runner initialization."""
        mock_session = MagicMock()
        mock_session.get_inputs.return_value = [MagicMock(name="input")]
        mock_session.get_outputs.return_value = [MagicMock(name="output")]
        
        mock_ort.InferenceSession.return_value = mock_session
        
        runner = MobileNetONNXRunner("models/mobilenet.onnx", device="cpu")
        
        assert runner.session is not None
    
    @patch('ai.mobilenet_onnx_runner.ort')
    def test_mobilenet_preprocess(self, mock_ort):
        """Test MobileNet preprocessing."""
        mock_session = MagicMock()
        mock_session.get_inputs.return_value = [MagicMock(name="input")]
        mock_session.get_outputs.return_value = [MagicMock(name="output")]
        
        mock_ort.InferenceSession.return_value = mock_session
        
        runner = MobileNetONNXRunner("models/mobilenet.onnx", device="cpu")
        
        # Create dummy crop
        crop = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
        
        preprocessed = runner.preprocess(crop)
        
        assert preprocessed.shape == (1, 3, 224, 224)  # Batch, channels, height, width
    
    @patch('ai.mobilenet_onnx_runner.ort')
    def test_mobilenet_predict_threshold(self, mock_ort):
        """Test MobileNet prediction with threshold."""
        mock_session = MagicMock()
        mock_session.get_inputs.return_value = [MagicMock(name="input")]
        mock_session.get_outputs.return_value = [MagicMock(name="output")]
        
        # Mock output: high probability (suspicious)
        mock_session.run.return_value = [np.array([[2.0]])]  # sigmoid(2.0) ≈ 0.88
        
        mock_ort.InferenceSession.return_value = mock_session
        
        runner = MobileNetONNXRunner("models/mobilenet.onnx", device="cpu")
        
        crop = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
        label, prob = runner.predict_on_crop(crop)
        
        # Should be 'Suspicious' since prob > 0.5 (mock returns 2.0 which sigmoid(2.0) ≈ 0.88)
        assert label == 'Suspicious'
        assert prob > 0.5
