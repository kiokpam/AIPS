"""MobileNet ONNX runner for efficient inference."""
from typing import Tuple
import numpy as np
import cv2
import onnxruntime as ort


class MobileNetONNXRunner:
    def __init__(self, onnx_path: str, device: str = 'cpu'):
        """
        Initialize MobileNet ONNX runner.
        
        Args:
            onnx_path: Path to the ONNX model file
            device: 'cpu' or 'cuda' for inference
        """
        # Set up ONNX Runtime session
        providers = ['CPUExecutionProvider']
        if device == 'cuda':
            providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
        
        self.session = ort.InferenceSession(onnx_path, providers=providers)
        
        # Get input/output names
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name
        
        # ImageNet normalization values
        self.mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        self.std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        
    def preprocess(self, crop: np.ndarray) -> np.ndarray:
        """
        Preprocess image crop for MobileNet inference.
        
        Args:
            crop: BGR image from OpenCV
            
        Returns:
            Preprocessed tensor ready for inference
        """
        # Convert BGR to RGB
        img = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        
        # Resize to 224x224
        img = cv2.resize(img, (224, 224), interpolation=cv2.INTER_LINEAR)
        
        # Convert to float32 and normalize to [0, 1]
        img = img.astype(np.float32) / 255.0
        
        # Apply ImageNet normalization
        img = (img - self.mean) / self.std
        
        # Convert to NCHW format (batch, channels, height, width)
        img = np.transpose(img, (2, 0, 1))
        
        # Add batch dimension
        img = np.expand_dims(img, axis=0)
        
        return img
    
    def predict_on_crop(self, crop: np.ndarray) -> Tuple[str, float]:
        """
        Run inference on a single image crop.
        
        Args:
            crop: BGR image from OpenCV
            
        Returns:
            Tuple of (label, probability)
        """
        # Preprocess the image
        input_tensor = self.preprocess(crop)
        
        # Run inference
        output = self.session.run([self.output_name], {self.input_name: input_tensor})[0]
        
        # Post-process output
        if output.ndim == 2 and output.shape[1] == 1:
            # Binary classification with sigmoid
            prob = float(1 / (1 + np.exp(-output[0][0])))  # sigmoid
            label = 'Suspicious' if prob > 0.5 else 'Normal'
        else:
            # Multi-class classification with softmax
            exp_output = np.exp(output[0] - np.max(output[0]))  # numerical stability
            probs = exp_output / np.sum(exp_output)
            idx = int(np.argmax(probs))
            prob = float(probs[idx])
            label = 'Suspicious' if idx != 0 else 'Normal'
        
        return label, prob
