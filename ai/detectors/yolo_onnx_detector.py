"""YOLO ONNX detector using onnxruntime for better performance."""
from typing import List, Tuple
import numpy as np
import cv2

try:
    import onnxruntime as ort
except ImportError:
    ort = None


class YOLOONNXDetector:
    def __init__(self, onnx_path: str, device: str = 'cpu', conf_thresh: float = 0.5, 
                 iou_thresh: float = 0.45, person_only: bool = True, input_size: int = 640):
        """Initialize YOLO ONNX detector.
        
        Args:
            onnx_path: Path to ONNX model file
            device: 'cpu' or 'cuda' for GPU acceleration
            conf_thresh: Confidence threshold for detections
            iou_thresh: IoU threshold for NMS
            person_only: Only return person class (class 0)
            input_size: Model input size (default 640 for YOLOv8)
        """
        if ort is None:
            raise RuntimeError('onnxruntime is required. Install with: pip install onnxruntime-gpu')
        
        self.conf_thresh = conf_thresh
        self.iou_thresh = iou_thresh
        self.person_only = person_only
        self.input_size = input_size
        
        # Setup ONNX Runtime session with appropriate providers
        providers = []
        if device == 'cuda' or device == 'gpu' or (isinstance(device, str) and device.isdigit()):
            # Try CUDA first, fallback to CPU
            if 'CUDAExecutionProvider' in ort.get_available_providers():
                providers.append('CUDAExecutionProvider')
                print(f'YOLOv8 ONNX: Using CUDA GPU acceleration')
            else:
                print(f'YOLOv8 ONNX: CUDA not available, falling back to CPU')
                providers.append('CPUExecutionProvider')
        else:
            providers.append('CPUExecutionProvider')
            print(f'YOLOv8 ONNX: Using CPU')
        
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        
        self.session = ort.InferenceSession(onnx_path, sess_options=sess_options, providers=providers)
        
        # Get input/output names
        self.input_name = self.session.get_inputs()[0].name
        self.output_names = [output.name for output in self.session.get_outputs()]
        
        print(f'YOLOv8 ONNX loaded: {onnx_path}')
        print(f'  Input: {self.input_name}')
        print(f'  Outputs: {self.output_names}')

    def preprocess(self, frame: np.ndarray) -> Tuple[np.ndarray, float, Tuple[int, int]]:
        """Preprocess frame for YOLO inference.
        
        Returns:
            input_tensor: Preprocessed tensor (1, 3, input_size, input_size)
            scale: Scale factor for bbox conversion
            pad: Padding (pad_w, pad_h)
        """
        img_h, img_w = frame.shape[:2]
        
        # Letterbox resize (maintain aspect ratio)
        scale = min(self.input_size / img_w, self.input_size / img_h)
        new_w, new_h = int(img_w * scale), int(img_h * scale)
        
        # Resize
        resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        
        # Pad to square
        pad_w = (self.input_size - new_w) // 2
        pad_h = (self.input_size - new_h) // 2
        
        padded = np.full((self.input_size, self.input_size, 3), 114, dtype=np.uint8)
        padded[pad_h:pad_h+new_h, pad_w:pad_w+new_w] = resized
        
        # Convert to float and normalize
        input_tensor = padded.astype(np.float32) / 255.0
        
        # HWC to CHW
        input_tensor = input_tensor.transpose(2, 0, 1)
        
        # Add batch dimension
        input_tensor = np.expand_dims(input_tensor, axis=0)
        
        return input_tensor, scale, (pad_w, pad_h)

    def postprocess(self, outputs: np.ndarray, scale: float, pad: Tuple[int, int], 
                    orig_shape: Tuple[int, int]) -> List[Tuple[int, int, int, int, float, int]]:
        """Postprocess YOLO outputs to bounding boxes.
        
        Args:
            outputs: Raw model outputs
            scale: Scale factor from preprocessing
            pad: Padding (pad_w, pad_h) from preprocessing
            orig_shape: Original image shape (height, width)
            
        Returns:
            List of detections (x1, y1, x2, y2, conf, class_id)
        """
        # YOLOv8 output shape: (1, 84, 8400) or (1, 4+num_classes, num_predictions)
        # First 4 are box coords (cx, cy, w, h), rest are class scores
        
        if len(outputs.shape) == 3:
            outputs = outputs[0]  # Remove batch dimension
        
        # Transpose to (num_predictions, 84)
        if outputs.shape[0] < outputs.shape[1]:
            outputs = outputs.T
        
        # Extract boxes and scores
        boxes = outputs[:, :4]  # cx, cy, w, h
        scores = outputs[:, 4:]  # class scores
        
        # Get class with max score for each prediction
        class_ids = np.argmax(scores, axis=1)
        confidences = np.max(scores, axis=1)
        
        # Filter by confidence threshold
        mask = confidences >= self.conf_thresh
        boxes = boxes[mask]
        confidences = confidences[mask]
        class_ids = class_ids[mask]
        
        # Filter by person class if needed
        if self.person_only:
            person_mask = class_ids == 0
            boxes = boxes[person_mask]
            confidences = confidences[person_mask]
            class_ids = class_ids[person_mask]
        
        if len(boxes) == 0:
            return []
        
        # Convert from cx,cy,w,h to x1,y1,x2,y2
        x1 = boxes[:, 0] - boxes[:, 2] / 2
        y1 = boxes[:, 1] - boxes[:, 3] / 2
        x2 = boxes[:, 0] + boxes[:, 2] / 2
        y2 = boxes[:, 1] + boxes[:, 3] / 2
        
        # Scale back to original image coordinates
        pad_w, pad_h = pad
        x1 = (x1 - pad_w) / scale
        y1 = (y1 - pad_h) / scale
        x2 = (x2 - pad_w) / scale
        y2 = (y2 - pad_h) / scale
        
        # Clip to image bounds
        orig_h, orig_w = orig_shape
        x1 = np.clip(x1, 0, orig_w)
        y1 = np.clip(y1, 0, orig_h)
        x2 = np.clip(x2, 0, orig_w)
        y2 = np.clip(y2, 0, orig_h)
        
        # Apply NMS
        boxes_for_nms = np.stack([x1, y1, x2, y2], axis=1)
        indices = self.nms(boxes_for_nms, confidences, self.iou_thresh)
        
        # Format output
        detections = []
        for idx in indices:
            detections.append((
                int(x1[idx]), int(y1[idx]), int(x2[idx]), int(y2[idx]),
                float(confidences[idx]), int(class_ids[idx])
            ))
        
        return detections

    @staticmethod
    def nms(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> List[int]:
        """Non-Maximum Suppression."""
        x1 = boxes[:, 0]
        y1 = boxes[:, 1]
        x2 = boxes[:, 2]
        y2 = boxes[:, 3]
        
        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]
        
        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)
            
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            
            w = np.maximum(0.0, xx2 - xx1)
            h = np.maximum(0.0, yy2 - yy1)
            inter = w * h
            
            iou = inter / (areas[i] + areas[order[1:]] - inter)
            
            inds = np.where(iou <= iou_threshold)[0]
            order = order[inds + 1]
        
        return keep

    def detect(self, frame: np.ndarray) -> List[Tuple[int, int, int, int, float, int]]:
        """Detect objects in frame.
        
        Returns:
            List of detections as (x1, y1, x2, y2, conf, class_id)
        """
        orig_shape = frame.shape[:2]
        
        # Preprocess
        input_tensor, scale, pad = self.preprocess(frame)
        
        # Run inference
        outputs = self.session.run(self.output_names, {self.input_name: input_tensor})[0]
        
        # Postprocess
        detections = self.postprocess(outputs, scale, pad, orig_shape)
        
        return detections
