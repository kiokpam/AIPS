"""ONNX Runtime mocking utilities for testing without GPU or model files."""
import numpy as np
from unittest.mock import MagicMock


class MockONNXSession:
    """Mock ONNX InferenceSession that simulates model inference."""
    
    def __init__(self, model_path, providers=None, sess_options=None, **kwargs):
        """Initialize mock session.
        
        Args:
            model_path: Path to ONNX model (used to detect model type)
            providers: Execution providers (CPUExecutionProvider, CUDAExecutionProvider, etc.)
            sess_options: Session options (ignored in mock)
            **kwargs: Additional arguments (ignored in mock)
        """
        self.model_path = model_path
        self.providers = providers or ['CPUExecutionProvider']
        self._model_type = self._detect_model_type(model_path)
    
    def _detect_model_type(self, path):
        """Detect model type from path."""
        path_lower = str(path).lower()
        if 'yolo' in path_lower:
            return 'yolo'
        elif 'mobilenet' in path_lower:
            return 'mobilenet'
        elif 'videomae' in path_lower:
            return 'videomae'
        return 'unknown'
    
    def run(self, output_names, input_feed):
        """Simulate model inference with realistic outputs."""
        if self._model_type == 'yolo':
            return self._mock_yolo_output()
        elif self._model_type == 'mobilenet':
            return self._mock_mobilenet_output()
        elif self._model_type == 'videomae':
            return self._mock_videomae_output()
        else:
            # Generic output
            return [np.array([[0.0]], dtype=np.float32)]
    
    def _mock_yolo_output(self):
        """Mock YOLO detection output.
        
        Returns tensor shape [1, 84, 8400] with 2 person detections:
        - Person 1: bbox=(320, 240, 420, 360), conf=0.9, class=0
        - Person 2: bbox=(480, 360, 580, 480), conf=0.75, class=0
        """
        output = np.zeros((1, 84, 8400), dtype=np.float32)
        
        # Detection 1: Person at (320, 240, 420, 360)
        # YOLO format: [cx, cy, w, h, confidence, class_0, class_1, ...]
        output[0, 0, 0] = 370  # cx
        output[0, 1, 0] = 300  # cy
        output[0, 2, 0] = 100  # w
        output[0, 3, 0] = 120  # h
        output[0, 4, 0] = 0.9  # objectness
        output[0, 5, 0] = 0.9  # class 0 (person) confidence
        
        # Detection 2: Person at (480, 360, 580, 480)
        output[0, 0, 1] = 530  # cx
        output[0, 1, 1] = 420  # cy
        output[0, 2, 1] = 100  # w
        output[0, 3, 1] = 120  # h
        output[0, 4, 1] = 0.75  # objectness
        output[0, 5, 1] = 0.75  # class 0 (person) confidence
        
        return [output]
    
    def _mock_mobilenet_output(self):
        """Mock MobileNet behavior classification output.
        
        Returns logits for 3 classes: [normal, suspicious, violent]
        After softmax: ~90% normal, ~8% suspicious, ~2% violent
        """
        # Logits that favor "normal" class
        logits = np.array([[2.5, -1.0, -1.5]], dtype=np.float32)
        return [logits]
    
    def _mock_videomae_output(self):
        """Mock VideoMAE temporal behavior analysis output.
        
        Returns logits for 3 classes: [normal, suspicious, violent]
        After softmax: ~85% normal, ~11% suspicious, ~4% violent
        """
        # Logits slightly favoring normal but with some uncertainty
        logits = np.array([[1.8, -0.5, -1.2]], dtype=np.float32)
        return [logits]
    
    def get_inputs(self):
        """Return mock input metadata."""
        mock_input = MagicMock()
        mock_input.name = "images" if self._model_type == 'yolo' else "input"
        mock_input.shape = [1, 3, 640, 640] if self._model_type == 'yolo' else [1, 3, 224, 224]
        return [mock_input]
    
    def get_outputs(self):
        """Return mock output metadata."""
        mock_output = MagicMock()
        mock_output.name = "output0" if self._model_type == 'yolo' else "output"
        if self._model_type == 'yolo':
            mock_output.shape = [1, 84, 8400]
        else:
            mock_output.shape = [1, 3]
        return [mock_output]


class MockONNXRuntime:
    """Mock onnxruntime module."""
    
    def __init__(self):
        self.InferenceSession = MockONNXSession
    
    @staticmethod
    def get_available_providers():
        """Return available execution providers."""
        return ['CPUExecutionProvider']


def create_mock_onnx_session(model_type='yolo'):
    """Factory function to create mock ONNX sessions.
    
    Args:
        model_type: Type of model ('yolo', 'mobilenet', 'videomae')
    
    Returns:
        MockONNXSession configured for the specified model type
    """
    model_paths = {
        'yolo': 'models/yolov8n.onnx',
        'mobilenet': 'models/mobilenet.onnx',
        'videomae': 'videomae/videomae_runner.onnx'
    }
    
    path = model_paths.get(model_type, f'models/{model_type}.onnx')
    return MockONNXSession(path)


def mock_yolo_session():
    """Create a mock YOLO session."""
    return create_mock_onnx_session('yolo')


def mock_mobilenet_session():
    """Create a mock MobileNet session."""
    return create_mock_onnx_session('mobilenet')


def mock_videomae_session():
    """Create a mock VideoMAE session."""
    return create_mock_onnx_session('videomae')
