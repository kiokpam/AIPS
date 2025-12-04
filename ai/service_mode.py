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
    - VideoMAE detailed analysis when suspicious
    - Clip saving for anomalies
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
        
        # VideoMAE processing state
        self.awaiting_vmae: Dict[int, int] = {}  # track_id -> extra_frames needed
        self.vmae_processing: set = set()  # track_ids currently being processed
        self.last_vmae_frame: Dict[int, int] = {}  # track_id -> frame_idx when VMAE started
        self.base_max_frames: Dict[int, int] = {}  # preserve original buffer size per track
        self.vmae_results: Dict[int, Tuple[str, float]] = {}  # track_id -> (label, score)
        
        # Buffer config
        self.buffer_sec = 2.0  # Base buffer size in seconds
        self.extra_sec = 1.0  # Extra buffer for VideoMAE
        
        # Initialize In/Out counter if lines configured
        self.inout_api: Optional[InOutAPI] = None
        self.inout_line_a_norm = None
        self.inout_line_b_norm = None
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
        LOGGER.info(f"  - VideoMAE: {'enabled' if self.models.videomae else 'disabled'}")
    
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
                    
                    # Convert normalized coordinates to pixel coordinates
                    # Backend sends: [{"fx": 0.5, "fy": 0.3}, {"fx": 0.6, "fy": 0.4}]
                    # We'll convert to pixels when we get the first frame (frame dimensions unknown at setup)
                    # Store normalized coordinates for later conversion
                    self.inout_line_a_norm = line_a
                    self.inout_line_b_norm = line_b
                    self.inout_api = None  # Will be initialized on first frame
                    
                    LOGGER.info(f"Camera {self.camera_id}: In/Out lines configured (normalized)")
                    LOGGER.info(f"  Line A (norm): {line_a}")
                    LOGGER.info(f"  Line B (norm): {line_b}")
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
        
        Full pipeline (like main.py):
        1. YOLO detection
        2. DeepSORT tracking  
        3. In/Out counting
        4. MobileNet fast screening
        5. VideoMAE detailed analysis (when suspicious)
        6. Clip saving (for anomalies)
        
        Returns dict with:
        - inout: {in: N, out: N} or None
        - behaviors: [{track_id, label, confidence, bbox}]
        - detections: [{track_id, bbox, label, confidence, in_zone}] for visualization
        - people_in_zone: int
        - clips: [{track_id, path, label, score}] for saved clips
        """
        self.frame_idx += 1
        results = {
            'inout': None,
            'behaviors': [],
            'detections': [],  # All detections for visualization
            'people_in_zone': 0,
            'clips': [],  # Saved anomaly clips
        }
        
        # Initialize InOutAPI on first frame (now we know frame dimensions)
        if self.inout_line_a_norm and self.inout_line_b_norm and not self.inout_api:
            try:
                frame_h, frame_w = frame.shape[:2]
                
                # Convert normalized coordinates to pixel coordinates
                def norm_to_pixel(norm_point, width, height):
                    """Convert normalized {fx, fy} or [fx, fy] to pixel (x, y) tuple."""
                    if isinstance(norm_point, dict):
                        # Format: {"fx": 0.5, "fy": 0.3}
                        fx = float(norm_point.get('fx', 0))
                        fy = float(norm_point.get('fy', 0))
                    elif isinstance(norm_point, (list, tuple)):
                        if len(norm_point) >= 2:
                            # Could be [fx, fy] or [{"fx": 0.5, "fy": 0.3}]
                            if isinstance(norm_point[0], dict):
                                fx = float(norm_point[0].get('fx', 0))
                                fy = float(norm_point[0].get('fy', 0))
                            else:
                                fx = float(norm_point[0])
                                fy = float(norm_point[1])
                        else:
                            fx, fy = 0, 0
                    else:
                        fx, fy = 0, 0
                    # Clamp to valid pixel range
                    x = max(0, min(int(fx * width), width - 1))
                    y = max(0, min(int(fy * height), height - 1))
                    return (x, y)
                
                a_p1 = norm_to_pixel(self.inout_line_a_norm[0], frame_w, frame_h)
                a_p2 = norm_to_pixel(self.inout_line_a_norm[1], frame_w, frame_h)
                b_p1 = norm_to_pixel(self.inout_line_b_norm[0], frame_w, frame_h)
                b_p2 = norm_to_pixel(self.inout_line_b_norm[1], frame_w, frame_h)
                
                self.inout_api = InOutAPI((a_p1, a_p2), (b_p1, b_p2))
                LOGGER.info(f"Camera {self.camera_id}: InOutAPI initialized with pixel coordinates")
                LOGGER.info(f"  Line A: {a_p1} → {a_p2} (frame: {frame_w}x{frame_h})")
                LOGGER.info(f"  Line B: {b_p1} → {b_p2}")
            except Exception as e:
                LOGGER.error(f"Failed to initialize InOutAPI: {e}", exc_info=True)
                self.inout_line_a_norm = None
                self.inout_line_b_norm = None
        
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
            
            # Log when counts change (for debugging)
            if cin != self.last_in_count or cout != self.last_out_count:
                LOGGER.debug(f"Camera {self.camera_id}: InOut counts changed - IN: {self.last_in_count}→{cin}, OUT: {self.last_out_count}→{cout} (tracks: {len(tracks)})")
        
        # 4. Process all tracks for visualization and zone-based behavior detection
        people_in_zone = 0
        for tid, xyxy in tracks:
            cx, cy = bbox_center(xyxy)
            in_zone = point_in_polygon((cx, cy), self.zone) if self.zone else False
            
            if in_zone:
                people_in_zone += 1
            
            # Get label from MobileNet if available (or VideoMAE if processed)
            label = ""
            confidence = 0.0
            if tid in self.mobi_labels:
                label, confidence = self.mobi_labels[tid]
            
            # Add to detections for visualization
            results['detections'].append({
                'track_id': tid,
                'bbox': [int(x) for x in xyxy],  # [x1, y1, x2, y2]
                'label': label,
                'confidence': confidence,
                'in_zone': in_zone,
            })
            
            # Zone-based behavior detection (only for people inside zone)
            if in_zone and self.models.mobilenet:
                # Initialize buffer for new track
                if tid not in self.buffers:
                    max_frames = int(self.buffer_sec * self.fps)
                    self.buffers[tid] = PersonBuffer(tid, max_frames=max_frames, fps=self.fps)
                    self.base_max_frames[tid] = max_frames
                    LOGGER.debug(f"Track {tid}: initialized buffer with {max_frames} frames")
                
                # Add frame to buffer (with timestamp)
                timestamp = self.frame_idx / self.fps
                self.buffers[tid].append(frame, xyxy, timestamp)
                
                # Run MobileNet every 2 frames
                last = self.last_mobi_frame.get(tid, -100)
                if (self.frame_idx - last) >= 2:
                    self.last_mobi_frame[tid] = self.frame_idx
                    crop = self.buffers[tid].get_latest_crop()
                    
                    if crop is not None:
                        try:
                            label, prob = self.models.mobilenet.predict_on_crop(crop)
                            self.mobi_labels[tid] = (label, prob)
                            
                            # Update the detection entry with new label
                            for det in results['detections']:
                                if det['track_id'] == tid:
                                    det['label'] = label
                                    det['confidence'] = prob
                                    break
                            
                            # If suspicious, schedule VideoMAE analysis
                            if label.lower() != 'normal' and prob > 0.5:
                                # Add to behaviors (MobileNet detection)
                                results['behaviors'].append({
                                    'track_id': tid,
                                    'label': label,
                                    'confidence': prob,
                                    'bbox': xyxy,
                                    'source': 'mobilenet',
                                })
                                
                                # Schedule VideoMAE if not already processing
                                if self.models.videomae:
                                    if tid not in self.awaiting_vmae and tid not in self.vmae_processing:
                                        # Extend buffer to collect more context
                                        extra_frames = int(self.extra_sec * self.fps)
                                        self.buffers[tid].extend_capacity(extra_frames)
                                        self.awaiting_vmae[tid] = extra_frames
                                        self.last_vmae_frame[tid] = self.frame_idx
                                        LOGGER.info(f"Track {tid}: MobileNet suspicious ({prob:.2f}), scheduling VideoMAE")
                        except Exception as e:
                            LOGGER.debug(f"MobileNet error for track {tid}: {e}")
                
                # Check if awaiting VideoMAE and buffer is ready
                if tid in self.awaiting_vmae and tid not in self.vmae_processing:
                    cur_frames = self.buffers[tid].get_clip_frames()
                    cur_len = len(cur_frames)
                    target_len = self.base_max_frames.get(tid, int(self.buffer_sec * self.fps)) + self.awaiting_vmae[tid]
                    
                    # Check if collected enough frames
                    start_frame = self.last_vmae_frame.get(tid, 0)
                    frames_collected = self.frame_idx - start_frame
                    frames_needed = self.awaiting_vmae[tid]
                    
                    if cur_len >= target_len and frames_collected >= frames_needed:
                        # Run VideoMAE analysis
                        self.vmae_processing.add(tid)
                        LOGGER.info(f"Track {tid}: Running VideoMAE analysis ({cur_len} frames)")
                        
                        try:
                            vres = self.models.videomae.predict_buffer(cur_frames, num_frames=16, fps=self.fps)
                            vmae_label = vres.get('label', 'normal')
                            vmae_score = vres.get('score', 0.0)
                            
                            LOGGER.info(f"Track {tid}: VideoMAE result: {vmae_label} ({vmae_score:.2f})")
                            
                            # If VideoMAE confirms anomaly, save clip and add to results
                            # ONLY save clips for shoplifting and violence (critical anomalies)
                            label_lower = vmae_label.lower()
                            is_critical = 'shoplifting' in label_lower or 'violence' in label_lower or 'fight' in label_lower
                            
                            if is_critical and vmae_score > 0.5:
                                # Save clip only for shoplifting/violence
                                clip_name = f"{self.camera_id}_{tid}_{vmae_label.replace(' ', '_')}_{int(vmae_score*100)}.mp4"
                                clip_path = self.clip_dir / clip_name
                                
                                try:
                                    save_frames_as_video(cur_frames, self.fps, str(clip_path))
                                    LOGGER.info(f"🎥 Track {tid}: Saved {vmae_label} clip: {clip_path.name}")
                                    
                                    results['clips'].append({
                                        'track_id': tid,
                                        'path': str(clip_path),
                                        'label': vmae_label,
                                        'score': vmae_score,
                                    })
                                    
                                    # Add VideoMAE behavior (higher confidence than MobileNet)
                                    results['behaviors'].append({
                                        'track_id': tid,
                                        'label': vmae_label,
                                        'confidence': vmae_score,
                                        'bbox': xyxy if tid in [t[0] for t in tracks] else None,
                                        'source': 'videomae',
                                        'clip_path': str(clip_path),
                                    })
                                except Exception as e:
                                    LOGGER.error(f"Failed to save clip for track {tid}: {e}")
                            elif vmae_score > 0.5:
                                # Log non-critical detections but don't save clip or send alert
                                LOGGER.debug(f"Track {tid}: Non-critical VideoMAE: {vmae_label} ({vmae_score:.2f})")
                            
                            # Cleanup VideoMAE state
                            self.vmae_results[tid] = (vmae_label, vmae_score)
                            
                        except Exception as e:
                            LOGGER.error(f"VideoMAE error for track {tid}: {e}")
                        finally:
                            # Remove extra frames and restore buffer
                            self.awaiting_vmae.pop(tid, None)
                            self.vmae_processing.discard(tid)
                            self.last_vmae_frame.pop(tid, None)
                            
                            # Restore buffer capacity
                            if tid in self.base_max_frames and tid in self.buffers:
                                try:
                                    self.buffers[tid].pop_oldest(int(self.extra_sec * self.fps))
                                    self.buffers[tid].set_capacity(self.base_max_frames[tid])
                                except Exception:
                                    pass
        
        results['people_in_zone'] = people_in_zone
        
        # Cleanup old buffers
        active_tids = set(tid for tid, _ in tracks)
        for tid in list(self.buffers.keys()):
            if tid not in active_tids:
                # Process lost tracks with VideoMAE if they were awaiting
                if tid in self.awaiting_vmae and tid not in self.vmae_processing:
                    if self.models.videomae:
                        frames = self.buffers[tid].get_clip_frames()
                        if frames:
                            try:
                                vres = self.models.videomae.predict_buffer(frames, num_frames=16, fps=self.fps)
                                vmae_label = vres.get('label', 'normal')
                                vmae_score = vres.get('score', 0.0)
                                
                                label_lower = vmae_label.lower()
                                is_critical = 'shoplifting' in label_lower or 'violence' in label_lower or 'fight' in label_lower
                                if is_critical and vmae_score > 0.5:
                                    clip_name = f"{self.camera_id}_{tid}_{vmae_label.replace(' ', '_')}_{int(vmae_score*100)}_lost.mp4"
                                    clip_path = self.clip_dir / clip_name
                                    save_frames_as_video(frames, self.fps, str(clip_path))
                                    LOGGER.info(f"🎥 Lost track {tid}: Saved {vmae_label} clip: {clip_path.name}")
                            except Exception as e:
                                LOGGER.debug(f"Failed to process lost track {tid}: {e}")
                
                # Cleanup
                del self.buffers[tid]
                self.mobi_labels.pop(tid, None)
                self.last_mobi_frame.pop(tid, None)
                self.awaiting_vmae.pop(tid, None)
                self.vmae_processing.discard(tid)
                self.base_max_frames.pop(tid, None)
                self.vmae_results.pop(tid, None)
        
        return results
    
    def push_results(self, results: Dict[str, Any]):
        """Push results to backend API."""
        now = datetime.utcnow().isoformat() + 'Z'
        
        # Push detection updates for visualization (bounding boxes)
        detections = results.get('detections', [])
        people_in_zone = results.get('people_in_zone', 0)
        
        # Push detections when we have them (or every 10 frames to keep connection alive)
        if len(detections) > 0 or self.frame_idx % 10 == 0:
            try:
                resp = requests.post(
                    f"{self.backend_url}/api/events/detection-update",
                    json={
                        'event': 'detection_update',
                        'camera_id': self.camera_id,
                        'detections': detections,
                        'people_in_zone': people_in_zone,
                        'ts': now,
                    },
                    timeout=2  # Short timeout for real-time updates
                )
                if resp.status_code == 200:
                    # Log occasionally to avoid spam
                    if len(detections) > 0 and self.frame_idx % 50 == 0:
                        LOGGER.debug(f"Detection update: {len(detections)} people, {people_in_zone} in zone")
                else:
                    LOGGER.warning(f"Detection push failed: {resp.status_code} - {resp.text}")
            except Exception as e:
                # Only log errors occasionally to avoid spam
                if self.frame_idx % 100 == 0:
                    LOGGER.warning(f"Detection push error: {e}")
        
        # Push In/Out counts (only if changed)
        if results.get('inout'):
            cin = results['inout']['in']
            cout = results['inout']['out']
            
            if cin != self.last_in_count or cout != self.last_out_count:
                self.last_in_count = cin
                self.last_out_count = cout
                
                try:
                    store_id = self.config.get('store_id', '')
                    if not store_id:
                        LOGGER.warning(f"Camera {self.camera_id}: No store_id in config, cannot send inout update")
                    else:
                        resp = requests.post(
                            f"{self.backend_url}/api/events/inout-update",
                            json={
                                'event': 'inout_update',
                                'camera_id': self.camera_id,
                                'store_id': store_id,
                                'count_in': cin,
                                'count_out': cout,
                                'ts': now,
                            },
                            timeout=5
                        )
                        if resp.status_code == 200:
                            LOGGER.info(f"✅ InOut update: camera={self.camera_id}, IN={cin}, OUT={cout}")
                        else:
                            LOGGER.warning(f"InOut push failed: {resp.status_code} - {resp.text}")
                except Exception as e:
                    LOGGER.error(f"InOut push error: {e}", exc_info=True)
        
        # Push behavior alerts - ONLY for VideoMAE confirmed shoplifting/violence
        # MobileNet "suspicious" is just a filter to trigger VideoMAE, not an actual alert
        pushed_tracks = set()
        
        for behavior in results.get('behaviors', []):
            # Only send alerts for VideoMAE confirmed detections
            if behavior.get('source') != 'videomae':
                continue
            
            tid = behavior.get('track_id')
            if tid in pushed_tracks:
                continue
            
            # Map label to anomaly type - ONLY shoplifting and violence
            label = behavior['label'].lower()
            
            if 'shoplifting' in label:
                anomaly_type = 'shoplifting'
            elif 'violence' in label or 'fight' in label:
                anomaly_type = 'violence'
            else:
                # Skip other labels (loitering, suspicious, normal, etc.)
                # These don't warrant alerts/notifications
                LOGGER.debug(f"Skipping non-critical VideoMAE label: {label}")
                continue
            
            pushed_tracks.add(tid)
            
            try:
                # Include clip reference if available
                clip_ref = behavior.get('clip_path', '')
                
                resp = requests.post(
                    f"{self.backend_url}/api/events/anomaly-detected",
                    json={
                        'event': 'anomaly_detected',
                        'camera_id': self.camera_id,
                        'store_id': self.config.get('store_id', ''),
                        'type': anomaly_type,
                        'severity': behavior['confidence'],
                        'clip_ref': clip_ref,
                        'ts': now,
                    },
                    timeout=5
                )
                if resp.status_code == 200:
                    LOGGER.info(f"🚨 Alert pushed: {anomaly_type} ({behavior['confidence']:.2f}) clip={clip_ref}")
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
                            # Use /app/clips in Docker, fallback to ./clips for local dev
                            clip_dir = os.environ.get('CLIPS_DIR', '/app/clips')
                            self.processors[cam_id] = CameraProcessor(
                                camera_id=cam_id,
                                config=config,
                                models=self.models,
                                backend_url=self.backend_url,
                                clip_dir=clip_dir,
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

