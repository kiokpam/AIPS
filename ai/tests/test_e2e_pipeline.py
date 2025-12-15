"""Comprehensive E2E tests for complete AI pipeline."""
import pytest
import numpy as np
from unittest.mock import patch


@pytest.mark.e2e
class TestCompleteAIPipeline:
    """End-to-end tests for full AI detection pipeline."""
    
    @patch('detectors.yolo_onnx_detector.ort')
    def test_full_detection_pipeline(self, mock_yolo_ort, mock_onnxruntime, 
                                    mock_deepsort_tracker, dummy_frame):
        """Test complete pipeline: YOLO → DeepSORT."""
        # Setup mocks
        mock_yolo_ort.InferenceSession = mock_onnxruntime.InferenceSession
        mock_yolo_ort.get_available_providers = mock_onnxruntime.get_available_providers
        
        from detectors.yolo_onnx_detector import YOLOONNXDetector
        
        # Initialize components
        detector = YOLOONNXDetector("models/yolov8n.onnx", device="cpu")
        tracker = mock_deepsort_tracker()
        
        # Simulate multi-frame tracking
        for frame_idx in range(5):
            # 1. Detection
            detections = detector.detect(dummy_frame)
            assert len(detections) >= 1
            
            # 2. Tracking
            tracked_objects = tracker.update(detections, dummy_frame)
            
            # Verify tracking worked
            # Verify tracking worked
            assert isinstance(tracked_objects, list)
    
    @patch('detectors.yolo_onnx_detector.ort')
    def test_temporal_analysis_pipeline(self, mock_yolo_ort, mock_onnxruntime, 
                                       mock_deepsort_tracker, dummy_frame):
        """Test pipeline with multi-frame tracking."""
        # Setup mock
        mock_yolo_ort.InferenceSession = mock_onnxruntime.InferenceSession
        mock_yolo_ort.get_available_providers = mock_onnxruntime.get_available_providers
        
        from detectors.yolo_onnx_detector import YOLOONNXDetector
        
        # Initialize components
        detector = YOLOONNXDetector("models/yolov8n.onnx", device="cpu")
        tracker = mock_deepsort_tracker()
        
        # Collect frames for multi-frame tracking
        track_buffers = {}
        
        for frame_idx in range(10):
            detections = detector.detect(dummy_frame)
            tracked_objects = tracker.update(detections, dummy_frame)
            
            for track in tracked_objects:
                if len(track) >= 5:
                    track_id = int(track[4])
                    
                    if track_id not in track_buffers:
                        track_buffers[track_id] = []
                    
                    track_buffers[track_id].append(dummy_frame.copy())
        
        # Verify tracking worked across frames
        assert len(track_buffers) > 0


@pytest.mark.e2e
class TestPeopleCountingWorkflow:
    """E2E tests for people counting functionality."""
    
    @patch('detectors.yolo_onnx_detector.ort')
    def test_people_counting_workflow(self, mock_ort, mock_onnxruntime, 
                                     mock_deepsort_tracker, dummy_frame):
        """Test people counting with in/out zones."""
        mock_ort.InferenceSession = mock_onnxruntime.InferenceSession
        mock_ort.get_available_providers = mock_onnxruntime.get_available_providers
        
        from detectors.yolo_onnx_detector import YOLOONNXDetector
        from inout_pkg.inout_counter import InOutCounter
        
        detector = YOLOONNXDetector("models/yolov8n.onnx", device="cpu")
        tracker = mock_deepsort_tracker()
        
        # Define entry/exit lines (two parallel horizontal lines)
        h, w = dummy_frame.shape[:2]
        line_a = [(0, h//3), (w, h//3)]      # Upper line
        line_b = [(0, 2*h//3), (w, 2*h//3)]  # Lower line
        counter = InOutCounter(line_a, line_b)
        
        # Process frames
        for frame_idx in range(10):
            detections = detector.detect(dummy_frame)
            tracked_objects = tracker.update(detections, dummy_frame)
            
            # Convert tracked_objects to format expected by InOutCounter
            # Format: (track_id, (x1, y1, x2, y2))
            counter_input = []
            for track in tracked_objects:
                if len(track) >= 5:
                    x1, y1, x2, y2, track_id = track[:5]
                    counter_input.append((int(track_id), (x1, y1, x2, y2)))
            
            counter.process_tracks(counter_input)
        
        # Get counts
        count_in, count_out = counter.get_counts()
        
        assert count_in >= 0
        assert count_out >= 0


@pytest.mark.e2e
class TestPerformance:
    """Performance and stress tests."""
    
    @patch('detectors.yolo_onnx_detector.ort')
    def test_processing_speed_benchmark(self, mock_ort, mock_onnxruntime):
        """Benchmark detection speed with mocked ONNX."""
        import time
        
        mock_ort.InferenceSession = mock_onnxruntime.InferenceSession
        mock_ort.get_available_providers = mock_onnxruntime.get_available_providers
        
        from detectors.yolo_onnx_detector import YOLOONNXDetector
        
        detector = YOLOONNXDetector("models/yolov8n.onnx", device="cpu")
        
        # Benchmark 100 frames
        frames = [np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8) 
                  for _ in range(100)]
        
        start = time.time()
        for frame in frames:
            detector.detect(frame)
        elapsed = time.time() - start
        
        fps = 100 / elapsed
        
        # With mocking, should be fast
        assert fps > 10
        print(f"\nMocked detection FPS: {fps:.2f}")
