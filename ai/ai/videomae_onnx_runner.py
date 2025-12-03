"""VideoMAE ONNX runner for faster inference with GPU support."""
from typing import List, Dict, Optional
import numpy as np
import cv2
import json
import os
from pathlib import Path
import logging

try:
    import onnxruntime as ort
except ImportError:
    ort = None


class VideoMAEONNXRunner:
    def __init__(self, model_dir: str, device: str = 'cuda'):
        """Initialize VideoMAE ONNX runner.
        
        Args:
            model_dir: Directory containing videomae.onnx and configs.json
            device: 'cpu' or 'cuda' for GPU acceleration
        """
        if ort is None:
            raise RuntimeError('onnxruntime is required. Install with: pip install onnxruntime-gpu')
        
        self.model_dir = Path(model_dir)
        self.device = device
        
        # Load config
        cfg_path = self.model_dir / 'configs.json'
        if cfg_path.exists():
            with open(cfg_path, 'r', encoding='utf-8') as f:
                self.cfg = json.load(f)
        else:
            self.cfg = {}
        
        # Load label names
        self.label_names = None
        try:
            if self.cfg:
                id2label = self.cfg.get('id2label') or self.cfg.get('label2id')
                if id2label:
                    try:
                        items = sorted(((int(k), v) for k, v in id2label.items()), key=lambda x: x[0])
                        self.label_names = [v for _, v in items]
                    except Exception:
                        self.label_names = list(id2label.values())
        except Exception:
            self.label_names = None
        
        # Setup ONNX Runtime session
        onnx_path = self.model_dir / 'videomae.onnx'
        if not onnx_path.exists():
            raise FileNotFoundError(f'ONNX model not found at {onnx_path}')
        
        providers = []
        if device == 'cuda' or device == 'gpu':
            # Try CUDA first, fallback to CPU
            if 'CUDAExecutionProvider' in ort.get_available_providers():
                providers.append('CUDAExecutionProvider')
                print(f'VideoMAE ONNX: Using CUDA GPU acceleration')
            else:
                print(f'VideoMAE ONNX: CUDA not available, falling back to CPU')
                providers.append('CPUExecutionProvider')
        else:
            providers.append('CPUExecutionProvider')
            print(f'VideoMAE ONNX: Using CPU')
        
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        
        self.session = ort.InferenceSession(str(onnx_path), sess_options=sess_options, providers=providers)
        
        # Get input/output details
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name
        
        # Get expected input shape
        input_shape = self.session.get_inputs()[0].shape
        print(f'VideoMAE ONNX loaded: {onnx_path}')
        print(f'  Input: {self.input_name}, shape: {input_shape}')
        print(f'  Output: {self.output_name}')
        print(f'  Labels: {self.label_names}')
        
        # Expected input format: (batch, time, channels, height, width)
        # Example: (1, 16, 3, 224, 224)
        self.input_shape = input_shape
        
        self._logger = logging.getLogger('coreai.videomae.onnx')

    def preprocess_frames(self, frames: List[np.ndarray], num_frames: int = 16, 
                         target_size: int = 224) -> np.ndarray:
        """Preprocess frames for VideoMAE ONNX model.
        
        Args:
            frames: List of BGR frames from OpenCV
            num_frames: Number of frames to sample
            target_size: Target frame size (default 224x224)
            
        Returns:
            Preprocessed tensor with shape (1, num_frames, 3, target_size, target_size)
            Format: (batch, time, channels, height, width)
        """
        total_frames = len(frames)
        
        if total_frames == 0:
            # Return dummy input - shape (1, T, C, H, W)
            return np.zeros((1, num_frames, 3, target_size, target_size), dtype=np.float32)
        
        # Sample frames uniformly
        if total_frames >= num_frames:
            indices = np.linspace(0, total_frames - 1, num_frames, dtype=int)
        else:
            # Repeat frames if we don't have enough
            indices = np.array([i % total_frames for i in range(num_frames)], dtype=int)
        
        sampled = []
        for idx in indices:
            frame = frames[int(idx)]
            
            # Convert BGR to RGB
            if isinstance(frame, np.ndarray) and frame.ndim == 3 and frame.shape[2] == 3:
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            else:
                frame_rgb = frame
            
            # Resize to target size
            resized = cv2.resize(frame_rgb, (target_size, target_size), interpolation=cv2.INTER_LINEAR)
            
            # Normalize to [0, 1]
            normalized = resized.astype(np.float32) / 255.0
            
            # Normalize with ImageNet stats (standard for VideoMAE)
            mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
            std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
            normalized = (normalized - mean) / std
            
            # Keep HWC format (H, W, C)
            sampled.append(normalized)
        
        # Stack frames: (num_frames, H, W, C) -> (T, H, W, C)
        video_tensor = np.stack(sampled, axis=0)  # (T, H, W, C)
        
        # Transpose to (T, C, H, W) format
        video_tensor = video_tensor.transpose(0, 3, 1, 2)  # (T, C, H, W)
        
        # Add batch dimension: (1, T, C, H, W)
        video_tensor = np.expand_dims(video_tensor, axis=0)  # (1, T, C, H, W)
        
        return video_tensor

    def predict_buffer(self, frames: List[np.ndarray], num_frames: int = 16, 
                      window_seconds: float = 3.0, step_seconds: float = 2.0, 
                      fps: float = 25.0) -> Dict:
        """Run sliding-window inference over frames.
        
        Returns:
            Dict with keys: label, score, start_frame, end_frame, probs, label_names, etc.
        """
        total_frames = len(frames)
        if total_frames == 0:
            return {
                'label': 'normal',
                'score': 0.0,
                'start_frame': 0,
                'end_frame': 0,
                'probs': [],
                'label_names': self.label_names,
                'num_frames_sampled': num_frames,
                'sampled_indices': []
            }
        
        frames_per_window = max(1, int(round(window_seconds * fps)))
        step_frames = max(1, int(round(step_seconds * fps)))
        
        if total_frames > frames_per_window:
            starts = list(range(0, total_frames - frames_per_window + 1, step_frames))
        else:
            starts = [0]
        
        # Default best
        if self.label_names and len(self.label_names) > 0:
            default_label = None
            for ln in self.label_names:
                if isinstance(ln, str) and ln.lower() == 'normal':
                    default_label = ln
                    break
            if default_label is None:
                default_label = self.label_names[0]
        else:
            default_label = 'normal'
        
        best_label = default_label
        best_score = 0.0
        best_start = 0
        best_end = 0
        best_probs = None
        best_sampled = None
        
        for start in starts:
            end = min(start + frames_per_window, total_frames)
            window_frames = frames[start:end]
            
            # Preprocess
            input_tensor = self.preprocess_frames(window_frames, num_frames=num_frames)
            
            # Run inference
            try:
                outputs = self.session.run([self.output_name], {self.input_name: input_tensor})[0]
            except Exception as e:
                self._logger.error(f'ONNX inference error: {e}')
                continue
            
            # Postprocess - outputs should be logits (1, num_classes)
            if len(outputs.shape) == 2:
                logits = outputs[0]
            else:
                logits = outputs.flatten()
            
            # Apply softmax
            exp_logits = np.exp(logits - np.max(logits))  # Numerical stability
            probs = exp_logits / np.sum(exp_logits)
            
            # Get best prediction
            idx = int(np.argmax(probs))
            score = float(probs[idx])
            
            # Map index to label
            if self.label_names is not None and idx < len(self.label_names):
                label = self.label_names[idx]
            else:
                label = str(idx)
            
            # Update best
            if score > best_score:
                best_score = score
                best_label = label
                best_start = int(start)
                best_end = int(end - 1)
                best_probs = probs.tolist()
                
                # Calculate sampled indices
                window_len = len(window_frames)
                if window_len >= num_frames:
                    best_sampled = np.linspace(start, start + window_len - 1, num_frames, dtype=int).tolist()
                else:
                    best_sampled = [start + (i % window_len) for i in range(num_frames)]
        
        return {
            'label': best_label,
            'score': float(best_score),
            'start_frame': int(best_start),
            'end_frame': int(best_end),
            'probs': best_probs if best_probs is not None else [],
            'label_names': self.label_names,
            'num_frames_sampled': num_frames,
            'sampled_indices': best_sampled,
        }
