#!/usr/bin/env python3
"""Test script to verify ONNX models are working correctly."""

import sys
import cv2
import numpy as np

def test_onnxruntime():
    """Test if onnxruntime is installed and CUDA is available."""
    print("=" * 60)
    print("Testing ONNX Runtime Installation")
    print("=" * 60)
    
    try:
        import onnxruntime as ort
        print("✓ onnxruntime installed")
        print(f"  Version: {ort.__version__}")
        
        providers = ort.get_available_providers()
        print(f"  Available providers: {providers}")
        
        if 'CUDAExecutionProvider' in providers:
            print("✓ CUDA GPU acceleration available")
        else:
            print("⚠ CUDA not available, will use CPU")
            
        return True
    except ImportError:
        print("✗ onnxruntime not installed")
        print("  Install with: pip install onnxruntime-gpu")
        return False

def test_yolo_onnx():
    """Test YOLO ONNX model."""
    print("\n" + "=" * 60)
    print("Testing YOLO ONNX Model")
    print("=" * 60)
    
    try:
        from detectors.yolo_onnx_detector import YOLOONNXDetector
        print("✓ YOLO ONNX detector module loaded")
        
        # Check if model file exists
        import os
        if os.path.exists('models/yolov8n.onnx'):
            print("✓ yolov8n.onnx found")
            
            # Try to load model
            detector = YOLOONNXDetector('models/yolov8n.onnx', device='cuda', conf_thresh=0.5)
            print("✓ YOLO ONNX model loaded successfully")
            
            # Create dummy frame and test inference
            dummy_frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
            detections = detector.detect(dummy_frame)
            print(f"✓ YOLO inference successful (detected {len(detections)} objects in dummy frame)")
            
            return True
        else:
            print("✗ yolov8n.onnx not found")
            print("  Export with: yolo export model=yolov8n.pt format=onnx")
            return False
            
    except Exception as e:
        print(f"✗ YOLO ONNX test failed: {e}")
        return False

def test_videomae_onnx():
    """Test VideoMAE ONNX model."""
    print("\n" + "=" * 60)
    print("Testing VideoMAE ONNX Model")
    print("=" * 60)
    
    try:
        from ai.videomae_onnx_runner import VideoMAEONNXRunner
        print("✓ VideoMAE ONNX runner module loaded")
        
        # Check if model file exists
        import os
        if os.path.exists('videomae/videomae.onnx'):
            print("✓ videomae/videomae.onnx found")
            
            # Try to load model
            runner = VideoMAEONNXRunner('videomae', device='cuda')
            print("✓ VideoMAE ONNX model loaded successfully")
            
            # Create dummy frames and test inference
            dummy_frames = [np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8) for _ in range(16)]
            result = runner.predict_buffer(dummy_frames, num_frames=16, fps=25.0)
            print(f"✓ VideoMAE inference successful")
            print(f"  Result: label={result['label']}, score={result['score']:.3f}")
            
            # Verify preprocessing shape
            preprocessed = runner.preprocess_frames(dummy_frames, num_frames=16)
            expected_shape = (1, 16, 3, 224, 224)  # (batch, time, channels, height, width)
            if preprocessed.shape == expected_shape:
                print(f"✓ Preprocessing shape correct: {preprocessed.shape}")
            else:
                print(f"⚠ Preprocessing shape mismatch: got {preprocessed.shape}, expected {expected_shape}")
            
            return True
        else:
            print("✗ videomae/videomae.onnx not found")
            print("  Export with: cd videomae && python export_videomae_to_onnx.py")
            return False
            
    except Exception as e:
        print(f"✗ VideoMAE ONNX test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("\n")
    print("╔" + "=" * 58 + "╗")
    print("║" + " " * 15 + "ONNX Models Test Suite" + " " * 21 + "║")
    print("╚" + "=" * 58 + "╝")
    print()
    
    results = {
        'onnxruntime': test_onnxruntime(),
        'yolo_onnx': test_yolo_onnx(),
        'videomae_onnx': test_videomae_onnx(),
    }
    
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    all_passed = True
    for test_name, passed in results.items():
        status = "✓ PASSED" if passed else "✗ FAILED"
        print(f"{test_name:20s}: {status}")
        if not passed:
            all_passed = False
    
    print("=" * 60)
    
    if all_passed:
        print("\n✓ All tests passed! System ready to use ONNX models.")
        print("\nRun with: python main.py --source <video> --zone-json coordinate.json")
        return 0
    else:
        print("\n⚠ Some tests failed. Check the errors above.")
        print("\nTo use PyTorch fallback:")
        print("  python main.py --source <video> --zone-draw \\")
        print("                 --use-pytorch-yolo --use-pytorch-videomae \\")
        print("                 --yolo yolov8n.pt")
        return 1

if __name__ == '__main__':
    sys.exit(main())
