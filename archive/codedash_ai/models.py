# models.py
from ultralytics import YOLO
import torch

_models = {}

def get_model(name="yolov8n.pt", device="auto"):
    """
    Load-once model cache with GPU support.
    name: path to model file
    device: "auto", "cuda", "cpu", or specific device like "cuda:0"
    """
    # Auto detect best device
    if device == "auto":
        if torch.cuda.is_available():
            device = "cuda"
            print(f"🚀 Using GPU: {torch.cuda.get_device_name(0)}")
        else:
            device = "cpu"
            print("💻 Using CPU (CUDA not available)")
    
    model_key = f"{name}_{device}"
    
    if model_key not in _models:
        print(f"Loading model {name} on device: {device}")
        model = YOLO(name)
        
        # Move model to specified device
        if device != "cpu":
            model.to(device)
            
        _models[model_key] = model
        print(f"✅ Model loaded successfully on {device}")
    
    return _models[model_key]

def get_device_info():
    """Get information about available devices"""
    info = {
        'cuda_available': torch.cuda.is_available(),
        'device_count': torch.cuda.device_count() if torch.cuda.is_available() else 0,
        'current_device': torch.cuda.current_device() if torch.cuda.is_available() else None,
        'device_name': torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    }
    return info
