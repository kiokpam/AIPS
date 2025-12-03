#!/usr/bin/env python3
"""
AI Service Mode - Wraps CoreAI for integration with AIPS backend.

This service:
1. Polls backend for active cameras
2. Pulls frames from backend API (instead of direct RTSP)
3. Runs AI inference (YOLO → DeepSORT → InOut/Behavior)
4. Pushes results back to backend via REST API

Usage:
    python service_mode.py [--backend-url URL] [--device cuda|cpu] [--debug]

Environment Variables:
    BACKEND_URL: Backend API URL (default: http://backend:8000)
    AI_DEVICE: Inference device (default: cuda)
"""

import os
import sys
import time
import logging
import argparse
import threading
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
import numpy as np
import cv2

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

# Import original AI modules (unchanged)
from detectors.yolo_onnx_detector import YOLOONNXDetector
from detectors.deepsort_tracker import DeepSortTracker
from ai.mobilenet_runner import MobileNetRunner
from ai.videomae_onnx_runner import VideoMAEONNXRunner
from inout_pkg.inout_api import InOutAPI
from buffers.person_buffer import PersonBuffer
from zone.zone import point_in_polygon, bbox_center
from utils.io_helpers import save_frames_as_video

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
LOGGER = logging.getLogger("ai-service")


class AIModels:
    """Container for shared AI models."""
    
    def __init__(self, device: str = 'cuda'):
        self.device = device
        self.yolo: Optional[YOLOONNXDetector] = None
        self.mobilenet: Optional[MobileNetRunner] = None
        self.videomae: Optional[VideoMAEONNXRunner] = None
        self._lock = threading.Lock()
    
    def load(self):
        """Load all AI models (thread-safe)."""
        with self._lock:
            if self.yolo is not None:
                return  # Already loaded
            
            LOGGER.info("Loading AI models...")
            start = time.time()
            
            # YOLO for person detection
            yolo_path = Path(__file__).parent / 'models' / 'yolov8n.onnx'
            if not yolo_path.exists():
                raise FileNotFoundError(f"YOLO model not found: {yolo_path}")
            self.yolo = YOLOONNXDetector(str(yolo_path), device=self.device)
            LOGGER.info("✓ YOLO loaded")
            
            # MobileNet for fast behavior screening
            mobilenet_path = Path(__file__).parent / 'models' / 'mobilenet_pytorch_best.pth'
            if mobilenet_path.exists():
                self.mobilenet = MobileNetRunner(str(mobilenet_path), device=self.device)
                LOGGER.info("✓ MobileNet loaded")
            else:
                LOGGER.warning(f"MobileNet model not found: {mobilenet_path}")
            
            # VideoMAE for detailed behavior analysis
            videomae_dir = Path(__file__).parent / 'videomae'
            if (videomae_dir / 'videomae.onnx').exists():
                self.videomae = VideoMAEONNXRunner(str(videomae_dir), device=self.device)
                LOGGER.info("✓ VideoMAE loaded")
            else:
                LOGGER.warning(f"VideoMAE model not found: {videomae_dir}")
            
            elapsed = time.time() - start
            LOGGER.info(f"All models loaded in {elapsed:.1f}s")


class CameraProcessor:
    """
    Process a single camera's frames.
    
    Handles:
    - Frame pulling from backend API
    - YOLO detection + DeepSORT tracking
    - In/Out counting (if lines configured)
    - Behavior detection (if zone configured)
    - Result pushing to backend
    """
    
    def __init__(
        self,
        camera_id: str,
        config: Dict[str, Any],
        models: AIModels,
        backend_url: str,
        clip_dir: str = './clips'
    ):
        self.camera_id = camera_id
        self.config = config
        self.models = models
        self.backend_url = backend_url
        self.clip_dir = Path(clip_dir)
        self.clip_dir.mkdir(parents=True, exist_ok=True)
        
        # Per-camera tracker (not shared)
        self.tracker = DeepSortTracker(max_age=30, use_embedder=False)
        
        # Buffers for behavior detection
        self.buffers: Dict[int, PersonBuffer] = {}
        self.mobi_labels: Dict[int, Tuple[str, float]] = {}
        self.last_mobi_frame: Dict[int, int] = {}
        
        # Initialize In/Out counter if lines configured
        self.inout_api: Optional[InOutAPI] = None
        self._setup_inout()
        
        # Initialize zone for behavior detection
        self.zone: Optional[List[Tuple[int, int]]] = None
        self._setup_zone()
        
        # Frame counter
        self.frame_idx = 0
        self.fps = 25.0  # Assumed FPS
        
        # Last pushed counts (to avoid duplicate pushes)
        self.last_in_count = 0
        self.last_out_count = 0
        
        LOGGER.info(f"Camera {camera_id}: Processor initialized")
        LOGGER.info(f"  - In/Out counting: {'enabled' if self.inout_api else 'disabled'}")
        LOGGER.info(f"  - Behavior zone: {'configured' if self.zone else 'not configured'}")
    
    def _setup_inout(self):
        """Setup In/Out counter from config lines."""
        lines = self.config.get('lines', [])
        if not lines:
            return
        
        # Find first complete line (has both line_a and line_b)
        for line in lines:
            if line.get('line_a') and line.get('line_b'):
                try:
                    line_a = line['line_a']
                    line_b = line['line_b']
                    
                    # Convert to tuple format expected by InOutAPI
                    # Format: ((x1,y1), (x2,y2))
                    a_p1 = tuple(line_a[0])
                    a_p2 = tuple(line_a[1])
                    b_p1 = tuple(line_b[0])
                    b_p2 = tuple(line_b[1])
                    
                    self.inout_api = InOutAPI((a_p1, a_p2), (b_p1, b_p2))
                    LOGGER.info(f"Camera {self.camera_id}: In/Out lines configured")
                    LOGGER.info(f"  Line A: {a_p1} → {a_p2}")
                    LOGGER.info(f"  Line B: {b_p1} → {b_p2}")
                    break
                except (IndexError, TypeError) as e:
                    LOGGER.warning(f"Invalid line format: {e}")
    
    def _setup_zone(self):
        """Setup behavior detection zone from config."""
        zones = self.config.get('zones', [])
        if not zones:
            return
        
        # Use first zone
        zone_config = zones[0]
        polygon = zone_config.get('polygon', [])
        if len(polygon) >= 3:
            self.zone = [(int(p[0]), int(p[1])) for p in polygon]
            LOGGER.info(f"Camera {self.camera_id}: Behavior zone configured with {len(self.zone)} points")
    
    def pull_frame(self) -> Optional[np.ndarray]:
        """Pull latest frame from backend API."""
        try:
            url = f"{self.backend_url}/api/ai/cameras/{self.camera_id}/frame"
            resp = requests.get(url, timeout=5)
            
            if resp.status_code == 200:
                # Decode JPEG to numpy array
                arr = np.frombuffer(resp.content, np.uint8)
                frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                return frame
            elif resp.status_code == 503:
                # Camera not ready, this is normal during startup
                return None
            else:
                LOGGER.warning(f"Frame pull failed for {self.camera_id}: {resp.status_code}")
        except requests.exceptions.Timeout:
            LOGGER.debug(f"Frame pull timeout for {self.camera_id}")
        except Exception as e:
            LOGGER.debug(f"Frame pull error for {self.camera_id}: {e}")
        
        return None
    
    def process_frame(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Run AI pipeline on a single frame.
        
        Returns dict with:
        - inout: {in: N, out: N} or None
        - behaviors: [{track_id, label, confidence, bbox}]
        """
        self.frame_idx += 1
        results = {
            'inout': None,
            'behaviors': [],
        }
        
        # 1. YOLO detection
        dets = self.models.yolo.detect(frame)
        
        # 2. DeepSORT tracking
        tracks = self.tracker.update(dets, frame=frame)
        
        # 3. In/Out counting
        if self.inout_api:
            current_ids = set(tid for tid, _ in tracks)
            prev_ids = set(self.inout_api.get_state_ids())
            lost = list(prev_ids - current_ids)
            self.inout_api.process_tracks(tracks, lost_ids=lost)
            cin, cout = self.inout_api.get_counts()
            results['inout'] = {'in': cin, 'out': cout}
        
        # 4. Zone-based behavior detection
        if self.zone and self.models.mobilenet:
            for tid, xyxy in tracks:
                cx, cy = bbox_center(xyxy)
                
                # Skip if outside zone
                if not point_in_polygon((cx, cy), self.zone):
                    continue
                
                # Initialize buffer for new track
                if tid not in self.buffers:
                    max_frames = int(2.0 * self.fps)  # 2 seconds buffer
                    self.buffers[tid] = PersonBuffer(tid, max_frames=max_frames, fps=self.fps)
                
                # Add frame to buffer
                self.buffers[tid].append(frame, xyxy)
                
                # Run MobileNet every 2 frames
                last = self.last_mobi_frame.get(tid, -100)
                if (self.frame_idx - last) >= 2:
                    self.last_mobi_frame[tid] = self.frame_idx
                    crop = self.buffers[tid].get_latest_crop()
                    
                    if crop is not None:
                        try:
                            label, prob = self.models.mobilenet.predict_on_crop(crop)
                            self.mobi_labels[tid] = (label, prob)
                            
                            # If suspicious, add to results
                            if label.lower() != 'normal' and prob > 0.5:
                                results['behaviors'].append({
                                    'track_id': tid,
                                    'label': label,
                                    'confidence': prob,
                                    'bbox': xyxy,
                                })
                        except Exception as e:
                            LOGGER.debug(f"MobileNet error for track {tid}: {e}")
        
        # Cleanup old buffers
        active_tids = set(tid for tid, _ in tracks)
        for tid in list(self.buffers.keys()):
            if tid not in active_tids:
                del self.buffers[tid]
                self.mobi_labels.pop(tid, None)
                self.last_mobi_frame.pop(tid, None)
        
        return results
    
    def push_results(self, results: Dict[str, Any]):
        """Push results to backend API."""
        now = datetime.utcnow().isoformat() + 'Z'
        
        # Push In/Out counts (only if changed)
        if results.get('inout'):
            cin = results['inout']['in']
            cout = results['inout']['out']
            
            if cin != self.last_in_count or cout != self.last_out_count:
                self.last_in_count = cin
                self.last_out_count = cout
                
                try:
                    resp = requests.post(
                        f"{self.backend_url}/api/events/inout-update",
                        json={
                            'event': 'inout_update',
                            'camera_id': self.camera_id,
                            'store_id': self.config.get('store_id', ''),
                            'count_in': cin,
                            'count_out': cout,
                            'ts': now,
                        },
                        timeout=5
                    )
                    if resp.status_code == 200:
                        LOGGER.debug(f"Pushed InOut: in={cin}, out={cout}")
                    else:
                        LOGGER.warning(f"InOut push failed: {resp.status_code}")
                except Exception as e:
                    LOGGER.warning(f"InOut push error: {e}")
        
        # Push behavior alerts
        for behavior in results.get('behaviors', []):
            try:
                # Map label to anomaly type
                label = behavior['label'].lower()
                if 'suspicious' in label:
                    anomaly_type = 'shoplifting'  # Default suspicious to shoplifting
                elif 'violence' in label or 'fight' in label:
                    anomaly_type = 'violence'
                else:
                    anomaly_type = label
                
                resp = requests.post(
                    f"{self.backend_url}/api/events/anomaly-detected",
                    json={
                        'event': 'anomaly_detected',
                        'camera_id': self.camera_id,
                        'store_id': self.config.get('store_id', ''),
                        'type': anomaly_type,
                        'severity': behavior['confidence'],
                        'ts': now,
                    },
                    timeout=5
                )
                if resp.status_code == 200:
                    LOGGER.info(f"Alert pushed: {anomaly_type} ({behavior['confidence']:.2f})")
                else:
                    LOGGER.warning(f"Alert push failed: {resp.status_code}")
            except Exception as e:
                LOGGER.warning(f"Alert push error: {e}")


class AIService:
    """
    Main AI Service that manages multiple camera processors.
    """
    
    def __init__(
        self,
        backend_url: str = 'http://backend:8000',
        device: str = 'cuda',
        poll_interval: float = 5.0,
    ):
        self.backend_url = backend_url
        self.device = device
        self.poll_interval = poll_interval
        
        # Shared AI models
        self.models = AIModels(device=device)
        
        # Camera processors
        self.processors: Dict[str, CameraProcessor] = {}
        
        # Control
        self.running = False
        self._executor = ThreadPoolExecutor(max_workers=8)
    
    def start(self):
        """Start the AI service."""
        LOGGER.info("=" * 60)
        LOGGER.info("Starting AI Service")
        LOGGER.info(f"Backend URL: {self.backend_url}")
        LOGGER.info(f"Device: {self.device}")
        LOGGER.info("=" * 60)
        
        # Wait for backend to be ready
        self._wait_for_backend()
        
        # Load AI models
        self.models.load()
        
        # Start main loop
        self.running = True
        self._run_loop()
    
    def _wait_for_backend(self, max_attempts: int = 30, delay: float = 2.0):
        """Wait for backend to be ready."""
        LOGGER.info("Waiting for backend to be ready...")
        
        for attempt in range(max_attempts):
            try:
                resp = requests.get(f"{self.backend_url}/health", timeout=5)
                if resp.status_code == 200:
                    LOGGER.info("✓ Backend is ready")
                    return
            except Exception:
                pass
            
            LOGGER.info(f"Waiting for backend... ({attempt + 1}/{max_attempts})")
            time.sleep(delay)
        
        raise RuntimeError("Backend not available after maximum attempts")
    
    def _poll_cameras(self) -> List[Dict[str, Any]]:
        """Poll backend for active cameras."""
        try:
            resp = requests.get(
                f"{self.backend_url}/api/ai/cameras",
                params={'active_only': True},
                timeout=10
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            LOGGER.warning(f"Failed to poll cameras: {e}")
        return []
    
    def _get_camera_config(self, camera_id: str) -> Optional[Dict[str, Any]]:
        """Get camera configuration from backend."""
        try:
            resp = requests.get(
                f"{self.backend_url}/api/ai/cameras/{camera_id}/config",
                timeout=5
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            LOGGER.warning(f"Failed to get config for {camera_id}: {e}")
        return None
    
    def _run_loop(self):
        """Main service loop."""
        last_poll = 0
        
        while self.running:
            now = time.time()
            
            # Poll for cameras periodically
            if now - last_poll >= self.poll_interval:
                last_poll = now
                cameras = self._poll_cameras()
                
                # Update processor list
                current_ids = {cam['camera_id'] for cam in cameras}
                
                # Remove processors for stopped cameras
                for cam_id in list(self.processors.keys()):
                    if cam_id not in current_ids:
                        LOGGER.info(f"Removing processor for camera: {cam_id}")
                        del self.processors[cam_id]
                
                # Add processors for new cameras
                for cam in cameras:
                    cam_id = cam['camera_id']
                    if cam_id not in self.processors:
                        config = self._get_camera_config(cam_id)
                        if config:
                            self.processors[cam_id] = CameraProcessor(
                                camera_id=cam_id,
                                config=config,
                                models=self.models,
                                backend_url=self.backend_url,
                            )
                            LOGGER.info(f"Added processor for camera: {cam_id}")
            
            # Process each camera
            for cam_id, processor in list(self.processors.items()):
                try:
                    frame = processor.pull_frame()
                    if frame is not None:
                        results = processor.process_frame(frame)
                        processor.push_results(results)
                except Exception as e:
                    LOGGER.error(f"Error processing camera {cam_id}: {e}")
            
            # Small delay between cycles
            time.sleep(0.05)  # ~20 FPS max per camera
    
    def stop(self):
        """Stop the AI service."""
        LOGGER.info("Stopping AI Service...")
        self.running = False
        self._executor.shutdown(wait=True)
        LOGGER.info("AI Service stopped")


def parse_args():
    parser = argparse.ArgumentParser(description='AIPS AI Service')
    parser.add_argument(
        '--backend-url',
        default=os.environ.get('BACKEND_URL', 'http://backend:8000'),
        help='Backend API URL'
    )
    parser.add_argument(
        '--device',
        default=os.environ.get('AI_DEVICE', 'cuda'),
        choices=['cuda', 'cpu'],
        help='Inference device'
    )
    parser.add_argument(
        '--poll-interval',
        type=float,
        default=5.0,
        help='Camera poll interval in seconds'
    )
    parser.add_argument(
        '--debug',
        action='store_true',
        help='Enable debug logging'
    )
    return parser.parse_args()


def main():
    args = parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    service = AIService(
        backend_url=args.backend_url,
        device=args.device,
        poll_interval=args.poll_interval,
    )
    
    try:
        service.start()
    except KeyboardInterrupt:
        LOGGER.info("Interrupted by user")
    finally:
        service.stop()


if __name__ == '__main__':
    main()

