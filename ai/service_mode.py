#!/usr/bin/env python3
"""
AI Service - Real-time Video Analytics Service

This service integrates AI-powered video analytics with the AIPS backend system.
It processes video frames from cameras managed by the backend, performs real-time
person detection, tracking, behavior analysis, and sends results back to the backend.

Architecture:
    1. Polls backend API for active cameras and their configurations
    2. Pulls video frames from backend API endpoints (decoupled from RTSP)
    3. Runs AI inference pipeline:
       - YOLO: Person detection
       - DeepSORT: Multi-object tracking
       - MobileNet: Fast behavior screening
       - VideoMAE: Detailed anomaly analysis
    4. Performs In/Out counting (if lines configured)
    5. Detects suspicious behaviors (if zones configured)
    6. Pushes detection results to backend via REST API and WebSocket

Usage:
    python service_mode.py [--backend-url URL] [--device cuda|cpu] [--debug]

Environment Variables:
    BACKEND_URL: Backend API URL (default: http://backend:8000)
    AI_DEVICE: Inference device - 'cuda' for GPU or 'cpu' for CPU (default: cuda)
    AI_SERVICE_TOKEN: Optional shared token. When set, it is sent as the
        X-Service-Token header on every backend call (must match the backend's
        AI_SERVICE_TOKEN).

Author: AIPS Development Team
License: See project LICENSE file
"""

import os
import sys
import time
import logging
import argparse
import threading
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from collections import deque
from concurrent.futures import ThreadPoolExecutor, Future
from pathlib import Path
import queue

import requests
import websockets
import asyncio
import json
import numpy as np
import cv2

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

# Import original AI modules (unchanged)
from detectors.yolo_onnx_detector import YOLOONNXDetector
from detectors.deepsort_tracker import DeepSortTracker
from ai.mobilenet_onnx_runner import MobileNetONNXRunner
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

# Optional shared token for the backend's internal AI endpoints. Must match the
# backend's AI_SERVICE_TOKEN. Empty means no header is sent (previous behavior).
AI_SERVICE_TOKEN = os.environ.get('AI_SERVICE_TOKEN', '').strip()
SERVICE_AUTH_HEADERS: Dict[str, str] = {'X-Service-Token': AI_SERVICE_TOKEN} if AI_SERVICE_TOKEN else {}


class AIModels:
    """
    Container for shared AI models used across all camera processors.
    
    This class manages the lifecycle of AI models (YOLO, MobileNet, VideoMAE)
    and ensures thread-safe loading. Models are loaded once and shared across
    all camera processors to minimize memory usage.
    
    Attributes:
        device: Device for inference ('cuda' or 'cpu')
        yolo: YOLO object detector for person detection
        mobilenet: MobileNet classifier for fast behavior screening
        videomae: VideoMAE model for detailed anomaly analysis
    """
    
    def __init__(self, device: str = 'cuda'):
        self.device = device
        self.yolo: Optional[YOLOONNXDetector] = None
        self.mobilenet: Optional[MobileNetONNXRunner] = None
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
            self.yolo = YOLOONNXDetector(str(yolo_path), device=self.device, conf_thresh=0.35)
            LOGGER.info("✓ YOLO loaded")
            
            # MobileNet for fast behavior screening
            mobilenet_path = Path(__file__).parent / 'models' / 'mobilenet.onnx'
            if mobilenet_path.exists():
                self.mobilenet = MobileNetONNXRunner(str(mobilenet_path), device=self.device)
                LOGGER.info("✓ MobileNet (ONNX) loaded")
            else:
                LOGGER.warning(f"MobileNet model not found: {mobilenet_path}")
            
            # VideoMAE for detailed behavior analysis
            videomae_dir = Path(__file__).parent / 'videomae'
            # Check for videomae_runner.onnx (from AI developers) or videomae.onnx
            if (videomae_dir / 'videomae_runner.onnx').exists() or (videomae_dir / 'videomae.onnx').exists():
                self.videomae = VideoMAEONNXRunner(str(videomae_dir), device=self.device)
                LOGGER.info("✓ VideoMAE loaded")
            else:
                LOGGER.warning(f"VideoMAE model not found: {videomae_dir} (expected videomae_runner.onnx or videomae.onnx)")
            
            elapsed = time.time() - start
            LOGGER.info(f"All models loaded in {elapsed:.1f}s")


class CameraProcessor:
    """
    Processes video frames from a single camera and performs AI analytics.
    
    This class handles the complete AI processing pipeline for one camera:
    - Fetches frames from backend API endpoints
    - Performs person detection using YOLO
    - Tracks detected persons using DeepSORT
    - Counts people entering/exiting (if counting lines configured)
    - Detects suspicious behaviors (if monitoring zones configured)
    - Performs detailed VideoMAE analysis for suspicious activities
    - Saves video clips of detected anomalies
    - Sends detection results to backend via REST API and WebSocket
    
    The processor runs in a continuous loop, processing frames as they become
    available from the backend. It maintains separate state for each tracked person
    and uses asynchronous processing to avoid blocking the main frame processing loop.
    
    Attributes:
        camera_id: Unique identifier for this camera
        config: Camera configuration (zones, lines, AI services)
        models: Shared AI models container
        backend_url: Base URL for backend API
        clip_dir: Directory for saving anomaly video clips
        executor: Thread pool executor for async operations
    """
    
    def __init__(
        self,
        camera_id: str,
        config: Dict[str, Any],
        models: AIModels,
        backend_url: str,
        clip_dir: str = './clips',
        executor: Optional[ThreadPoolExecutor] = None
    ):
        self.camera_id = camera_id
        self.config = config if config is not None else {}
        self.models = models
        self.backend_url = backend_url
        self.clip_dir = Path(clip_dir)
        self.clip_dir.mkdir(parents=True, exist_ok=True)
        self.executor = executor or ThreadPoolExecutor(max_workers=4)
        
        # Per-camera tracker (not shared) – enable embedder to stabilize IDs (matches dev main.py)
        use_gpu = str(self.models.device).lower() in ("cuda", "gpu") or str(self.models.device).isdigit()
        self.tracker = DeepSortTracker(
            max_age=3,  # Shorter age reduces overlap when tracks temporarily drop during motion
            use_embedder=True,
            embedder="mobilenet",
            embedder_gpu=use_gpu,
            half=True,
        )
        
        # ID remapping: Map DeepSORT's high sequential IDs (52, 68, 97...) to display IDs (1, 2, 3...)
        # This makes IDs more readable and matches AI developers' behavior where IDs start from 1
        # DeepSORT internally keeps high IDs, but we remap them for display/processing
        self.id_remap: Dict[int, int] = {}  # deepsort_id -> display_id
        self.next_display_id = 1
        self.id_last_seen: Dict[int, int] = {}  # Track when IDs were last seen (frame_idx)
        self.id_remap_timeout_frames = 5  # Remove mapping after 5 frames of inactivity (200ms at 25fps) - reduced from 30 for faster cleanup
        
        # Buffers for behavior detection
        self.buffers: Dict[int, PersonBuffer] = {}
        self.mobi_labels: Dict[int, Tuple[str, float]] = {}
        self.last_mobi_frame: Dict[int, int] = {}
        self.mobi_futures: Dict[int, Future] = {}  # track_id -> Future for mobilenet
        
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
        self._setup_inout()
        
        # Initialize zone for behavior detection
        self.zone: Optional[List[Tuple[int, int]]] = None
        # Always define raw polygon to avoid AttributeError when no zones exist
        self.zone_polygon_raw: Optional[List[Tuple[float, float]]] = None
        self._setup_zone()
        
        # Frame counter and timing
        self.frame_idx = 0
        self.fps = 25.0  # Default FPS, will be updated from camera stats
        self.actual_fps = 25.0  # Actual frame processing rate (calculated from timing)
        self.frame_times = deque(maxlen=30)  # Track last 30 frame timestamps for FPS calculation
        self.last_frame_time = time.time()
        
        # Frame preprocessing cache (optimization)
        self._last_frame_shape = None
        self._preprocessing_params = None  # Cache scale and pad values
        
        # Model inference timing metrics
        self.model_timings = {
            'yolo': deque(maxlen=100),  # Last 100 inference times
            'deepsort': deque(maxlen=100),
            'mobilenet': deque(maxlen=100),
            'videomae': deque(maxlen=20),  # VideoMAE is less frequent
        }
        self.frame_processing_times = deque(maxlen=100)  # Total frame processing time
        self.last_metrics_log = time.time()
        self._update_fps_from_camera()
        
        # WebSocket connection for detection updates
        self.ws_connection = None
        self.ws_connected = False
        self.ws_lock = threading.Lock()
        self.ws_reconnect_delay = 5.0  # Seconds to wait before reconnecting
        self.last_ws_error = None
        self.ws_message_queue = queue.Queue(maxsize=50)  # Queue for WebSocket messages
        self.ws_loop = None
        self.ws_thread = None
        self._start_websocket_thread()
    
    def _start_websocket_thread(self):
        """Start dedicated thread with event loop for WebSocket operations."""
        def ws_thread_worker():
            # Create event loop for this thread
            self.ws_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.ws_loop)
            
            # Run the WebSocket handler
            self.ws_loop.run_until_complete(self._websocket_handler())
        
        self.ws_thread = threading.Thread(target=ws_thread_worker, daemon=True)
        self.ws_thread.start()
    
    async def _connect_websocket(self, ws_uri: str):
        """Open the backend WebSocket, sending the service token header when configured."""
        if not SERVICE_AUTH_HEADERS:
            return await websockets.connect(ws_uri)
        try:
            # websockets >= 14 (new asyncio client)
            return await websockets.connect(ws_uri, additional_headers=SERVICE_AUTH_HEADERS)
        except TypeError:
            # websockets < 14 (legacy client) names the argument extra_headers
            return await websockets.connect(ws_uri, extra_headers=SERVICE_AUTH_HEADERS)
    
    async def _websocket_handler(self):
        """Main WebSocket handler running in dedicated event loop."""
        ws_url = self.backend_url.replace('http://', 'ws://').replace('https://', 'wss://')
        ws_uri = f"{ws_url}/api/ws/detections/ai/{self.camera_id}"
        
        while True:
            try:
                # Connect to WebSocket
                try:
                    self.ws_connection = await self._connect_websocket(ws_uri)
                    with self.ws_lock:
                        self.ws_connected = True
                    self.last_ws_error = None
                    LOGGER.info(f"WebSocket connected for camera {self.camera_id}")
                except Exception as e:
                    with self.ws_lock:
                        self.ws_connected = False
                    self.last_ws_error = str(e)
                    LOGGER.warning(f"Failed to connect WebSocket for camera {self.camera_id}: {e}")
                    await asyncio.sleep(self.ws_reconnect_delay)
                    continue
                
                # Process messages from queue
                try:
                    while True:
                        # Check for messages in queue (non-blocking)
                        try:
                            message = self.ws_message_queue.get_nowait()
                            
                            if message is None:  # Shutdown signal
                                break
                            
                            # Send message
                            try:
                                await self.ws_connection.send(json.dumps(message))
                                # Log alert messages for debugging
                                if isinstance(message, dict) and message.get('message_type') == 'alert':
                                    LOGGER.info(f"✅ Alert sent via WebSocket: {message.get('type', 'unknown')} for camera {self.camera_id}")
                            except websockets.exceptions.ConnectionClosed:
                                raise  # Break inner loop to reconnect
                            except Exception as e:
                                # Log errors but continue processing
                                if isinstance(message, dict) and message.get('message_type') == 'alert':
                                    LOGGER.warning(f"Failed to send alert via WebSocket: {e}")
                                # Don't spam logs - errors are expected if connection is closing
                                pass
                                
                        except queue.Empty:
                            # No messages - wait a bit and check connection
                            await asyncio.sleep(0.01)  # Small delay to avoid busy loop
                            continue
                            
                except websockets.exceptions.ConnectionClosed:
                    LOGGER.warning(f"WebSocket connection closed for camera {self.camera_id}, reconnecting...")
                    with self.ws_lock:
                        self.ws_connected = False
                    if self.ws_connection:
                        try:
                            await self.ws_connection.close()
                        except:
                            pass
                        self.ws_connection = None
                    await asyncio.sleep(self.ws_reconnect_delay)
                    continue
                    
            except Exception as e:
                LOGGER.error(f"WebSocket handler error for camera {self.camera_id}: {e}", exc_info=True)
                with self.ws_lock:
                    self.ws_connected = False
                if self.ws_connection:
                    try:
                        await self.ws_connection.close()
                    except:
                        pass
                    self.ws_connection = None
                await asyncio.sleep(self.ws_reconnect_delay)
    
    def _reconnect_websocket(self):
        """Trigger WebSocket reconnection (handled automatically in event loop)."""
        # Reconnection is handled automatically in _websocket_handler loop
        pass
    
    def _update_fps_from_camera(self):
        """Update FPS from camera stats to ensure videos play at correct speed."""
        try:
            resp = requests.get(
                f"{self.backend_url}/api/ai/cameras/{self.camera_id}/health",
                headers=SERVICE_AUTH_HEADERS,
                timeout=2
            )
            if resp.status_code == 200:
                data = resp.json()
                camera_fps = data.get('fps', 0)
                if camera_fps > 0:
                    # Use actual camera FPS if available
                    old_fps = self.fps
                    self.fps = float(camera_fps)
                    if abs(old_fps - self.fps) > 1.0:  # Only log if significantly different
                        LOGGER.info(f"Camera {self.camera_id}: Updated FPS from {old_fps:.1f} to {self.fps:.1f}")
                else:
                    # Fallback: try to estimate from frame timing if available
                    # Keep default 25.0 if no stats available
                    pass
        except Exception as e:
            LOGGER.debug(f"Could not update FPS for {self.camera_id}: {e}")
            # Keep using default FPS
        
        # Last pushed counts (to avoid duplicate pushes)
        self.last_in_count = 0
        self.last_out_count = 0
        
        # Failure tracking for logging throttling
        self.consecutive_failures = 0
        self.last_failure_log_time = 0.0
        
        LOGGER.info(f"Camera {self.camera_id}: Processor initialized")
        LOGGER.info(f"  - FPS: {self.fps:.2f} (for video clip encoding)")
        LOGGER.info(f"  - In/Out counting: {'enabled' if self.inout_api else 'disabled'}")
        LOGGER.info(f"  - Behavior zone: {'configured' if self.zone else 'not configured'}")
        LOGGER.info(f"  - VideoMAE: {'enabled' if self.models.videomae else 'disabled'}")
    
    def _setup_inout(self):
        """Setup In/Out counter from config lines (pixel coordinates)."""
        if self.config is None:
            self.config = {}
        lines = self.config.get('lines', [])
        if not lines:
            LOGGER.info(f"Camera {self.camera_id}: No counting lines in config (config keys: {list(self.config.keys())})")
            return
        
        LOGGER.info(f"Camera {self.camera_id}: Found {len(lines)} counting line(s) in config")
        
        # Find first complete line (has both line_a and line_b)
        for idx, line in enumerate(lines):
            LOGGER.info(f"Camera {self.camera_id}: Checking line {idx}: has line_a={bool(line.get('line_a'))}, has line_b={bool(line.get('line_b'))}")
            if line.get('line_a') and line.get('line_b'):
                try:
                    line_a = line['line_a']
                    line_b = line['line_b']
                    
                    # Backend (ai_integration) sends pixel coordinates:
                    # line_a = [[x1, y1], [x2, y2]], line_b = [[x1, y1], [x2, y2]]
                    # We can initialize InOutAPI directly with these pixel points.
                    a_p1 = (int(line_a[0][0]), int(line_a[0][1]))
                    a_p2 = (int(line_a[1][0]), int(line_a[1][1]))
                    b_p1 = (int(line_b[0][0]), int(line_b[0][1]))
                    b_p2 = (int(line_b[1][0]), int(line_b[1][1]))
                    
                    self.inout_api = InOutAPI((a_p1, a_p2), (b_p1, b_p2))
                    LOGGER.info(f"Camera {self.camera_id}: ✅ In/Out lines configured (pixels)")
                    LOGGER.info(f"  Line A: {a_p1} → {a_p2}")
                    LOGGER.info(f"  Line B: {b_p1} → {b_p2}")
                    break
                except (IndexError, TypeError) as e:
                    LOGGER.warning(f"Camera {self.camera_id}: Invalid line format for line {idx}: {e}")
                    LOGGER.warning(f"  line_a: {line.get('line_a')}, line_b: {line.get('line_b')}")
            else:
                LOGGER.warning(f"Camera {self.camera_id}: Line {idx} is incomplete (missing line_a or line_b)")
        
        if self.inout_api is None:
            LOGGER.warning(f"Camera {self.camera_id}: ⚠️ No valid counting lines found - In/Out counting will be disabled")
    
    def _setup_zone(self):
        """Setup behavior detection zone from config."""
        if self.config is None:
            self.config = {}
        zones = self.config.get('zones', [])
        if not zones:
            self.zone = None
            self.zone_polygon_raw = None
            return
        
        # Use first zone
        zone_config = zones[0]
        polygon = zone_config.get('polygon', [])
        if len(polygon) >= 3:
            # Store zone polygon as-is (will be normalized per-frame based on actual frame dimensions)
            self.zone_polygon_raw = polygon
            self.zone = None  # Will be set per-frame based on actual frame size
            LOGGER.info(f"Camera {self.camera_id}: Behavior zone configured with {len(polygon)} points (will normalize per-frame)")
        else:
            self.zone = None
            self.zone_polygon_raw = None
    
    def pull_frame(self) -> Optional[np.ndarray]:
        """Pull latest frame from backend API."""
        try:
            url = f"{self.backend_url}/api/ai/cameras/{self.camera_id}/frame"
            resp = requests.get(url, headers=SERVICE_AUTH_HEADERS, timeout=0.5)  # Reduced from 2s to 0.5s for faster response
            
            if resp.status_code == 200:
                # Success - reset failure counter
                if self.consecutive_failures > 0:
                    LOGGER.debug(f"Frame pull recovered for {self.camera_id} after {self.consecutive_failures} failures")
                self.consecutive_failures = 0
                
                # Decode JPEG to numpy array
                arr = np.frombuffer(resp.content, np.uint8)
                frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                return frame
            elif resp.status_code == 503:
                # Camera not ready, this is normal during startup - use debug level
                self.consecutive_failures += 1
                return None
            elif resp.status_code == 404:
                # Camera not found or stopped - expected, log only occasionally
                self.consecutive_failures += 1
                now = time.time()
                # Log warning only every 5 seconds to avoid spam
                if now - self.last_failure_log_time > 5.0:
                    LOGGER.debug(f"Frame pull failed for {self.camera_id}: 404 (camera not found/stopped, {self.consecutive_failures} consecutive failures)")
                    self.last_failure_log_time = now
                return None
            else:
                # Other errors - log occasionally
                self.consecutive_failures += 1
                now = time.time()
                if now - self.last_failure_log_time > 5.0:
                    LOGGER.warning(f"Frame pull failed for {self.camera_id}: {resp.status_code} ({self.consecutive_failures} consecutive failures)")
                    self.last_failure_log_time = now
                return None
        except requests.exceptions.Timeout:
            self.consecutive_failures += 1
            LOGGER.debug(f"Frame pull timeout for {self.camera_id}")
            return None
        except Exception as e:
            self.consecutive_failures += 1
            LOGGER.debug(f"Frame pull error for {self.camera_id}: {e}")
        return None
    
    def submit_mobi_task(self, tid_local: int, crop_local: np.ndarray) -> Future:
        """Submit mobilenet prediction to executor (non-blocking)."""
        def _mobi(c):
            try:
                mobi_start = time.perf_counter()
                result = self.models.mobilenet.predict_on_crop(c)
                mobi_time = time.perf_counter() - mobi_start
                return (result, mobi_time)
            except Exception as e:
                LOGGER.debug(f"MobileNet background error for track {tid_local}: {e}")
                return (('normal', 0.0), 0.0)
        # Copy crop to avoid mutation by buffer
        try:
            crop_copy = crop_local.copy() if hasattr(crop_local, 'copy') else crop_local
        except Exception:
            crop_copy = crop_local
        fut = self.executor.submit(_mobi, crop_copy)
        return fut
    
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
        # Initialize results dict - always return this even on errors
        results = {
            'inout': None,
            'behaviors': [],
            'detections': [],
            'people_in_zone': 0,
            'clips': [],
        }
        
        try:
            self.frame_idx += 1
            
            # Track actual frame processing rate (how fast we're actually collecting frames)
            now = time.time()
            self.frame_times.append(now)
            if len(self.frame_times) >= 2:
                span = self.frame_times[-1] - self.frame_times[0]
                if span > 0:
                    self.actual_fps = (len(self.frame_times) - 1) / span
            self.last_frame_time = now
            
            # Update FPS periodically (every 100 frames) to ensure videos use correct frame rate
            if self.frame_idx % 100 == 0:
                self._update_fps_from_camera()
            
            # Track total frame processing time
            frame_start_time = time.perf_counter()
            
            # InOutAPI is now initialized in _setup_inout using pixel coordinates from config.
            # 1. YOLO detection
            yolo_start = time.perf_counter()
            dets = self.models.yolo.detect(frame)
            yolo_time = time.perf_counter() - yolo_start
            self.model_timings['yolo'].append(yolo_time)
            
            # Debug: Log YOLO detections periodically
            if self.frame_idx % 30 == 0:
                if len(dets) > 0:
                    LOGGER.info(f"🔍 Camera {self.camera_id}: YOLO detected {len(dets)} people - bboxes: {dets[:2]}")  # Show first 2
                else:
                    LOGGER.warning(f"⚠️ Camera {self.camera_id}: YOLO detected 0 people (frame shape: {frame.shape if frame is not None else 'None'})")
            
            # 2. DeepSORT tracking
            deepsort_start = time.perf_counter()
            tracks_raw = self.tracker.update(dets, frame=frame)
            deepsort_time = time.perf_counter() - deepsort_start
            self.model_timings['deepsort'].append(deepsort_time)
            
            # Debug: Log tracking results periodically
            if self.frame_idx % 30 == 0:
                LOGGER.info(f"👥 Camera {self.camera_id}: Tracking {len(tracks_raw)} people (from {len(dets)} detections)")
            
            # Remap DeepSORT IDs to sequential display IDs (1, 2, 3...) for readability
            # This matches AI developers' behavior where IDs start from 1
            tracks = []
            current_deepsort_ids = set()
            for deepsort_id, bbox in tracks_raw:
                current_deepsort_ids.add(deepsort_id)
                # Update last seen frame for this ID
                self.id_last_seen[deepsort_id] = self.frame_idx
                
                # Get or assign display ID
                if deepsort_id not in self.id_remap:
                    # New ID - assign next sequential display ID
                    self.id_remap[deepsort_id] = self.next_display_id
                    self.next_display_id += 1
                
                display_id = self.id_remap[deepsort_id]
                tracks.append((display_id, bbox))
                # Debug: Log remapping (only for first few frames to avoid spam)
                if self.frame_idx < 10 or self.frame_idx % 300 == 0:
                    LOGGER.debug(f"Camera {self.camera_id}: Remapped DeepSORT ID {deepsort_id} → Display ID {display_id}")
            
            # Cleanup old ID mappings (IDs not seen for timeout_frames)
            ids_to_remove = []
            for deepsort_id, last_frame in self.id_last_seen.items():
                if deepsort_id not in current_deepsort_ids:
                    if self.frame_idx - last_frame > self.id_remap_timeout_frames:
                        ids_to_remove.append(deepsort_id)
            
            for deepsort_id in ids_to_remove:
                # Remove old mappings when tracks are gone
                self.id_remap.pop(deepsort_id, None)
                self.id_last_seen.pop(deepsort_id, None)
        
            # 3. In/Out counting
            if self.inout_api:
                current_ids = set(tid for tid, _ in tracks)
                prev_ids = set(self.inout_api.get_state_ids())
                lost = list(prev_ids - current_ids)
                self.inout_api.process_tracks(tracks, lost_ids=lost)
                cin, cout = self.inout_api.get_counts()
                results['inout'] = {'in': cin, 'out': cout}
                
                # Log when counts change (use INFO level for visibility)
                if cin != self.last_in_count or cout != self.last_out_count:
                    LOGGER.info(f"📊 Camera {self.camera_id}: InOut counts changed - IN: {self.last_in_count}→{cin}, OUT: {self.last_out_count}→{cout} (tracks: {len(tracks)})")
            else:
                # Log periodically if inout_api is not initialized (every 100 frames)
                if self.frame_idx % 100 == 0:
                    LOGGER.debug(f"Camera {self.camera_id}: In/Out counting disabled (no inout_api initialized)")
            
            # 4. Process all tracks for visualization and zone-based behavior detection
            # Normalize zone coordinates based on actual frame dimensions
            # Zones are stored in pixel coordinates, but we need to ensure they match actual frame size
            if self.zone_polygon_raw and frame is not None:
                h, w = frame.shape[:2]
                # Check if zone coordinates are normalized (0-1) or pixel coordinates
                # If all coordinates are <= 1.0, assume normalized; otherwise assume pixels
                sample_point = self.zone_polygon_raw[0] if self.zone_polygon_raw else None
                if sample_point and len(sample_point) >= 2:
                    try:
                        x_val = float(sample_point[0])
                        y_val = float(sample_point[1])
                        # If coordinates are between 0-1, they're normalized
                        is_normalized = (0.0 <= x_val <= 1.0 and 0.0 <= y_val <= 1.0)
                        
                        if is_normalized:
                            # Convert normalized to pixel coordinates based on actual frame size
                            self.zone = [(int(float(p[0]) * w), int(float(p[1]) * h)) for p in self.zone_polygon_raw]
                            LOGGER.debug(f"Camera {self.camera_id}: Zone normalized from [0,1] to pixels ({w}x{h})")
                        else:
                            # Already in pixel coordinates, but check if they need scaling
                            # If coordinates are much larger than frame, they might be from a different resolution
                            max_x = max(float(p[0]) for p in self.zone_polygon_raw if len(p) >= 1)
                            max_y = max(float(p[1]) for p in self.zone_polygon_raw if len(p) >= 2)
                            
                            # If zone coordinates are significantly larger than frame, scale them down
                            # This handles cases where zone was created with wrong frame size
                            if max_x > w * 1.5 or max_y > h * 1.5:
                                # Assume zone was created for a different resolution, scale proportionally
                                # Find the scale factor based on the larger dimension
                                scale_x = w / max_x if max_x > 0 else 1.0
                                scale_y = h / max_y if max_y > 0 else 1.0
                                scale = min(scale_x, scale_y)  # Use smaller scale to fit both dimensions
                                self.zone = [(int(float(p[0]) * scale), int(float(p[1]) * scale)) for p in self.zone_polygon_raw]
                                LOGGER.warning(f"Camera {self.camera_id}: Zone coordinates ({max_x:.0f}x{max_y:.0f}) larger than frame ({w}x{h}), scaling by {scale:.3f}")
                            else:
                                # Use pixel coordinates directly
                                self.zone = [(int(float(p[0])), int(float(p[1]))) for p in self.zone_polygon_raw]
                    except (ValueError, TypeError, IndexError) as e:
                        LOGGER.warning(f"Camera {self.camera_id}: Error processing zone coordinates: {e}, using raw coordinates")
                        self.zone = [(int(p[0]), int(p[1])) for p in self.zone_polygon_raw if len(p) >= 2]
                else:
                    self.zone = None
            else:
                self.zone = None
            
            # Debug: Log zone and tracking info periodically
            if self.frame_idx % 30 == 0:
                zone_status = f"zone: {len(self.zone)} points" if self.zone else "zone: NOT SET"
                LOGGER.info(f"🎯 Camera {self.camera_id}: Processing {len(tracks)} tracks, {zone_status}")
            
            people_in_zone = 0
            for tid, xyxy in tracks:
                cx, cy = bbox_center(xyxy)
                in_zone = point_in_polygon((cx, cy), self.zone) if self.zone else False
                
                if in_zone:
                    people_in_zone += 1
                
                # Get label from MobileNet if available (or VideoMAE if processed)
                # Note: tid is now the remapped display ID (1, 2, 3...)
                label = ""
                confidence = 0.0
                if tid in self.mobi_labels:
                    label, confidence = self.mobi_labels[tid]
                
                # Add to detections for visualization (using remapped display ID)
                results['detections'].append({
                'track_id': tid,  # This is the remapped display ID (1, 2, 3...)
                'bbox': [int(x) for x in xyxy],  # [x1, y1, x2, y2]
                'label': label,
                'confidence': confidence,
                'in_zone': in_zone,
                })
                
                # Zone-based behavior detection (only for people inside zone)
                if in_zone and self.models.mobilenet:
                    # Initialize buffer for new track (using remapped display ID)
                    if tid not in self.buffers:
                        # Use camera's reported FPS for buffer size (matches AI developers' logic)
                        # This ensures consistent 3-second clips (buffer_sec + extra_sec)
                        max_frames = int(round(self.buffer_sec * self.fps))
                        self.buffers[tid] = PersonBuffer(tid, max_frames=max_frames, fps=self.fps)
                        self.base_max_frames[tid] = max_frames
                        LOGGER.debug(f"Track {tid}: initialized buffer with {max_frames} frames (using {self.fps:.1f} FPS for {self.buffer_sec}s)")
                
                    # Add frame to buffer (with timestamp)
                    # Use camera FPS for timestamp (matches AI developers' logic)
                    timestamp = self.frame_idx / self.fps
                    self.buffers[tid].append(frame, xyxy, timestamp)
                    
                    # Run MobileNet inference every 2 frames (optimized for speed) - ASYNC NOW
                    last = self.last_mobi_frame.get(tid, -1000)
                    mobi_freq = 2
                    if (self.frame_idx - last) >= mobi_freq:
                        self.last_mobi_frame[tid] = self.frame_idx
                        crop = self.buffers[tid].get_latest_crop()
                        if crop is not None:
                            # Submit mobilenet to executor (non-blocking)
                            f = self.submit_mobi_task(tid, crop)
                            self.mobi_futures[tid] = f
                
                    # Check if awaiting VideoMAE and buffer is ready
                    if tid in self.awaiting_vmae and tid not in self.vmae_processing:
                        cur_frames = self.buffers[tid].get_clip_frames()
                        cur_len = len(cur_frames)
                        # Use camera's reported FPS for target calculation (matches AI developers' logic)
                        target_len = self.base_max_frames.get(tid, int(round(self.buffer_sec * self.fps))) + self.awaiting_vmae[tid]
                        
                        # Check if collected enough frames
                        start_frame = self.last_vmae_frame.get(tid, 0)
                        frames_collected = self.frame_idx - start_frame
                        frames_needed = self.awaiting_vmae[tid]
                        
                        if cur_len >= target_len and frames_collected >= frames_needed:
                            # Run VideoMAE analysis
                            self.vmae_processing.add(tid)
                            LOGGER.info(f"Track {tid}: Running VideoMAE analysis ({cur_len} frames)")
                            
                            try:
                                videomae_start = time.perf_counter()
                                vres = self.models.videomae.predict_buffer(cur_frames, num_frames=16, fps=self.fps)
                                videomae_time = time.perf_counter() - videomae_start
                                self.model_timings['videomae'].append(videomae_time)
                                
                                # Check if VideoMAE returned a valid result
                                if vres is None or not isinstance(vres, dict):
                                    LOGGER.warning(f"Track {tid}: VideoMAE returned invalid result: {vres}, skipping")
                                    self.vmae_processing.discard(tid)
                                    continue
                                
                                vmae_label = vres.get('label', 'normal')
                                vmae_score = vres.get('score', 0.0)
                                
                                LOGGER.info(f"Track {tid}: VideoMAE result: {vmae_label} ({vmae_score:.2f})")
                            
                                # If VideoMAE confirms anomaly (ANY non-normal label), save clip and add to results
                                # This matches the original AI developers' behavior: any label != 'normal' is anomalous.frames go camera → backend → AI via HTTP, potentially with small resizing/delay.
                                label_lower = vmae_label.lower()
                                if label_lower != 'normal' and vmae_score > 0.5:
                                    clip_name = f"{self.camera_id}_{tid}_{vmae_label.replace(' ', '_')}_{int(vmae_score*100)}.mp4"
                                    clip_path = self.clip_dir / clip_name
                                    
                                    try:
                                        # Check if we have frames to save
                                        if not cur_frames or len(cur_frames) == 0:
                                            LOGGER.warning(f"Track {tid}: No frames to save for {vmae_label} clip")
                                        else:
                                            # Prefer camera FPS when actual_fps is too low to avoid slow playback
                                            save_fps = self.actual_fps if (self.actual_fps > 0 and self.actual_fps >= 0.8 * self.fps) else self.fps
                                            clip_duration = len(cur_frames) / save_fps if save_fps > 0 else 0
                                            
                                            # Minimum clip duration check: require at least 1 second of footage
                                            min_frames_required = int(round(save_fps * 1.0))  # At least 1 second
                                            if len(cur_frames) < min_frames_required:
                                                LOGGER.warning(f"Track {tid}: Skipping clip save - only {len(cur_frames)} frames (need {min_frames_required} for 1s at {save_fps:.1f} FPS)")
                                            else:
                                                LOGGER.info(f"Track {tid}: Saving {len(cur_frames)} frames to {clip_path} at {save_fps:.2f} FPS (duration: {clip_duration:.2f}s, camera: {self.fps:.2f}, actual: {self.actual_fps:.2f})")
                                                save_frames_as_video(cur_frames, save_fps, str(clip_path))
                                                
                                                # Verify file was actually created
                                                if clip_path.exists() and clip_path.stat().st_size > 0:
                                                    LOGGER.info(f"🎥 Track {tid}: Saved {vmae_label} clip: {clip_path.name} ({clip_path.stat().st_size} bytes)")
                                                    
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
                                                else:
                                                    LOGGER.error(f"Track {tid}: File {clip_path} was not created or is empty after save_frames_as_video")
                                    except Exception as e:
                                        LOGGER.error(f"Failed to save clip for track {tid}: {e}", exc_info=True)
                                
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
                                        # Use camera's reported FPS (matches AI developers' logic)
                                        extra_frames_to_remove = int(round(self.extra_sec * self.fps))
                                        self.buffers[tid].pop_oldest(extra_frames_to_remove)
                                        self.buffers[tid].set_capacity(self.base_max_frames[tid])
                                    except Exception:
                                        pass
            
            results['people_in_zone'] = people_in_zone
            
            # Track total frame processing time
            frame_processing_time = time.perf_counter() - frame_start_time
            self.frame_processing_times.append(frame_processing_time)
            
            # Log metrics periodically (every 5 seconds)
            now = time.time()
            if now - self.last_metrics_log >= 5.0:
                self._log_performance_metrics()
                self.last_metrics_log = now
            
            # Non-blocking check of mobilenet futures to update labels when ready
            # MobileNet labels are displayed immediately on bounding boxes
            for tid_in_fut, fut in list(self.mobi_futures.items()):
                if fut is None:
                    continue
                if fut.done():
                    try:
                        res = fut.result(timeout=0)
                        if res is not None:
                            (label, prob), mobi_time = res
                            # Update performance metric
                            # Keep timings in seconds (consistent with YOLO/DeepSORT/VideoMAE)
                            self.model_timings['mobilenet'].append(mobi_time)
                            # Store MobileNet result for display (don't update detection list in loop)
                            self.mobi_labels[tid_in_fut] = (label, prob)
                            
                            # Print MobileNet prediction (score, label, frame)
                            LOGGER.debug(f"MobileNet Prediction - Track ID: {tid_in_fut}, Label: {label}, Score: {prob:.4f}, Frame: {self.frame_idx}")
                            
                            # If MobileNet detects suspicious -> schedule VideoMAE extension (non-blocking)
                            if label != 'normal' and prob >= 0.5:
                                # Find bbox from detections if available
                                bbox = None
                                for det in results['detections']:
                                    if det['track_id'] == tid_in_fut:
                                        # Get bbox from tracks if available
                                        for tid_track, xyxy_track in tracks:
                                            if tid_track == tid_in_fut:
                                                bbox = [int(x) for x in xyxy_track]
                                                break
                                        break
                                
                                # Add to behaviors (MobileNet detection)
                                results['behaviors'].append({
                                    'track_id': tid_in_fut,
                                    'label': label,
                                    'confidence': prob,
                                    'bbox': bbox,
                                    'source': 'mobilenet',
                                })
                                
                                if tid_in_fut not in self.awaiting_vmae and tid_in_fut not in self.vmae_processing:
                                    # Check cooldown: prevent triggering VideoMAE if one was started recently
                                    # This prevents overlapping video extractions when multiple suspicious events occur rapidly
                                    last_trigger_frame = self.last_vmae_frame.get(tid_in_fut, -999999)
                                    frames_since_last_trigger = self.frame_idx - last_trigger_frame
                                    # Cooldown period: extra_sec to ensure previous extraction completes
                                    cooldown_frames = int(round(self.extra_sec * self.fps))
                                    
                                    if frames_since_last_trigger >= cooldown_frames:
                                        # Extend buffer by extra_sec to collect more context for VideoMAE
                                        extra_frames = int(round(self.extra_sec * self.fps))
                                        self.buffers[tid_in_fut].extend_capacity(extra_frames)
                                        self.awaiting_vmae[tid_in_fut] = extra_frames
                                        self.last_vmae_frame[tid_in_fut] = self.frame_idx  # Mark when extension started
                                        LOGGER.info(f"Track {tid_in_fut}: MobileNet detected suspicious ({prob:.2f}), extending buffer by {extra_frames} frames ({self.extra_sec:.1f} sec)")
                                    else:
                                        frames_remaining = cooldown_frames - frames_since_last_trigger
                                        LOGGER.info(f"Track {tid_in_fut}: suspicious detected but in cooldown period, skipping VideoMAE trigger ({frames_remaining} frames remaining)")
                    except Exception as e:
                        LOGGER.debug(f"Error reading mobilenet future for {tid_in_fut}: {e}")
                    finally:
                        # Remove finished future to keep dict small
                        self.mobi_futures.pop(tid_in_fut, None)
            
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
                                    videomae_start = time.perf_counter()
                                    vres = self.models.videomae.predict_buffer(frames, num_frames=16, fps=self.fps)
                                    videomae_time = time.perf_counter() - videomae_start
                                    self.model_timings['videomae'].append(videomae_time)
                                    
                                    # Check if VideoMAE returned a valid result
                                    if vres is None or not isinstance(vres, dict):
                                        LOGGER.warning(f"Lost track {tid}: VideoMAE returned invalid result: {vres}, skipping")
                                        continue
                                    
                                    vmae_label = vres.get('label', 'normal')
                                    vmae_score = vres.get('score', 0.0)
                                    
                                    label_lower = vmae_label.lower()
                                    if label_lower != 'normal' and vmae_score > 0.5:
                                        clip_name = f"{self.camera_id}_{tid}_{vmae_label.replace(' ', '_')}_{int(vmae_score*100)}_lost.mp4"
                                        clip_path = self.clip_dir / clip_name
                                        
                                        if not frames or len(frames) == 0:
                                            LOGGER.warning(f"Lost track {tid}: No frames to save for {vmae_label} clip")
                                        else:
                                            try:
                                                # Prefer camera FPS when actual_fps is too low to avoid slow playback
                                                save_fps = self.actual_fps if (self.actual_fps > 0 and self.actual_fps >= 0.8 * self.fps) else self.fps
                                                clip_duration = len(frames) / save_fps if save_fps > 0 else 0
                                                
                                                # Minimum clip duration check: require at least 1 second of footage
                                                min_frames_required = int(round(save_fps * 1.0))  # At least 1 second
                                                if len(frames) < min_frames_required:
                                                    LOGGER.warning(f"Lost track {tid}: Skipping clip save - only {len(frames)} frames (need {min_frames_required} for 1s at {save_fps:.1f} FPS)")
                                                else:
                                                    LOGGER.info(f"Lost track {tid}: Saving {len(frames)} frames to {clip_path} at {save_fps:.2f} FPS (duration: {clip_duration:.2f}s, camera: {self.fps:.2f}, actual: {self.actual_fps:.2f})")
                                                    save_frames_as_video(frames, save_fps, str(clip_path))
                                                    
                                                    # Verify file was actually created
                                                    if clip_path.exists() and clip_path.stat().st_size > 0:
                                                        LOGGER.info(f"🎥 Lost track {tid}: Saved {vmae_label} clip: {clip_path.name} ({clip_path.stat().st_size} bytes)")
                                                        # Add behavior so alerts can be pushed (even on lost tracks)
                                                        results['behaviors'].append({
                                                            'track_id': tid,
                                                            'label': vmae_label,
                                                            'confidence': vmae_score,
                                                            'bbox': None,
                                                            'source': 'videomae',
                                                            'clip_path': str(clip_path),
                                                        })
                                                    else:
                                                        LOGGER.error(f"Lost track {tid}: File {clip_path} was not created or is empty after save_frames_as_video")
                                            except Exception as e:
                                                LOGGER.error(f"Failed to save lost track clip for {tid}: {e}", exc_info=True)
                                except Exception as e:
                                    LOGGER.debug(f"Failed to process lost track {tid}: {e}")
                    
                    # Cleanup
                    del self.buffers[tid]
                    self.mobi_labels.pop(tid, None)
                    self.last_mobi_frame.pop(tid, None)
                    self.mobi_futures.pop(tid, None)  # Clean up any pending MobileNet futures
                    self.awaiting_vmae.pop(tid, None)
                    self.vmae_processing.discard(tid)
                    self.base_max_frames.pop(tid, None)
                    self.vmae_results.pop(tid, None)
        
        except Exception as e:
            try:
                LOGGER.error(f"Camera {self.camera_id}: Error in process_frame: {e}", exc_info=True)
            except:
                pass  # If logging fails, continue anyway
            # Return empty results dict on error (already initialized above)
        
        # Always return results, even if there was an error
        return results
    
    def _log_performance_metrics(self):
        """Log performance metrics (FPS and model inference times)."""
        # Calculate average inference times
        avg_yolo = sum(self.model_timings['yolo']) / len(self.model_timings['yolo']) if self.model_timings['yolo'] else 0
        avg_deepsort = sum(self.model_timings['deepsort']) / len(self.model_timings['deepsort']) if self.model_timings['deepsort'] else 0
        avg_mobilenet = sum(self.model_timings['mobilenet']) / len(self.model_timings['mobilenet']) if self.model_timings['mobilenet'] else 0
        avg_videomae = sum(self.model_timings['videomae']) / len(self.model_timings['videomae']) if self.model_timings['videomae'] else 0
        avg_frame_time = sum(self.frame_processing_times) / len(self.frame_processing_times) if self.frame_processing_times else 0
        
        # Calculate processing FPS (how fast we're processing frames)
        processing_fps = 1.0 / avg_frame_time if avg_frame_time > 0 else 0
        
        LOGGER.info(
            f"📊 Camera {self.camera_id} Performance Metrics:\n"
            f"  Processing FPS: {processing_fps:.2f} (actual: {self.actual_fps:.2f}, camera: {self.fps:.2f})\n"
            f"  Model Inference Times (avg):\n"
            f"    YOLO: {avg_yolo*1000:.2f}ms\n"
            f"    DeepSORT: {avg_deepsort*1000:.2f}ms\n"
            f"    MobileNet: {avg_mobilenet*1000:.2f}ms\n"
            f"    VideoMAE: {avg_videomae*1000:.2f}ms\n"
            f"  Total Frame Time: {avg_frame_time*1000:.2f}ms"
        )
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current performance metrics for API/stats."""
        avg_yolo = sum(self.model_timings['yolo']) / len(self.model_timings['yolo']) if self.model_timings['yolo'] else 0
        avg_deepsort = sum(self.model_timings['deepsort']) / len(self.model_timings['deepsort']) if self.model_timings['deepsort'] else 0
        avg_mobilenet = sum(self.model_timings['mobilenet']) / len(self.model_timings['mobilenet']) if self.model_timings['mobilenet'] else 0
        avg_videomae = sum(self.model_timings['videomae']) / len(self.model_timings['videomae']) if self.model_timings['videomae'] else 0
        avg_frame_time = sum(self.frame_processing_times) / len(self.frame_processing_times) if self.frame_processing_times else 0
        
        processing_fps = 1.0 / avg_frame_time if avg_frame_time > 0 else 0
        
        return {
            'processing_fps': round(processing_fps, 2),
            'actual_fps': round(self.actual_fps, 2),
            'camera_fps': round(self.fps, 2),
            'model_times_ms': {
                'yolo': round(avg_yolo * 1000, 2),
                'deepsort': round(avg_deepsort * 1000, 2),
                'mobilenet': round(avg_mobilenet * 1000, 2),
                'videomae': round(avg_videomae * 1000, 2),
            },
            'total_frame_time_ms': round(avg_frame_time * 1000, 2),
        }
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
                                videomae_start = time.perf_counter()
                                vres = self.models.videomae.predict_buffer(frames, num_frames=16, fps=self.fps)
                                videomae_time = time.perf_counter() - videomae_start
                                self.model_timings['videomae'].append(videomae_time)
                                
                                # Check if VideoMAE returned a valid result
                                if vres is None or not isinstance(vres, dict):
                                    LOGGER.warning(f"Lost track {tid}: VideoMAE returned invalid result: {vres}, skipping")
                                    continue
                                
                                vmae_label = vres.get('label', 'normal')
                                vmae_score = vres.get('score', 0.0)
                                
                                label_lower = vmae_label.lower()
                                if label_lower != 'normal' and vmae_score > 0.5:
                                    clip_name = f"{self.camera_id}_{tid}_{vmae_label.replace(' ', '_')}_{int(vmae_score*100)}_lost.mp4"
                                    clip_path = self.clip_dir / clip_name
                                    
                                    if not frames or len(frames) == 0:
                                        LOGGER.warning(f"Lost track {tid}: No frames to save for {vmae_label} clip")
                                    else:
                                        try:
                                            # Prefer camera FPS when actual_fps is too low to avoid slow playback
                                            save_fps = self.actual_fps if (self.actual_fps > 0 and self.actual_fps >= 0.8 * self.fps) else self.fps
                                            clip_duration = len(frames) / save_fps if save_fps > 0 else 0
                                            
                                            # Minimum clip duration check: require at least 1 second of footage
                                            min_frames_required = int(round(save_fps * 1.0))  # At least 1 second
                                            if len(frames) < min_frames_required:
                                                LOGGER.warning(f"Lost track {tid}: Skipping clip save - only {len(frames)} frames (need {min_frames_required} for 1s at {save_fps:.1f} FPS)")
                                            else:
                                                LOGGER.info(f"Lost track {tid}: Saving {len(frames)} frames to {clip_path} at {save_fps:.2f} FPS (duration: {clip_duration:.2f}s, camera: {self.fps:.2f}, actual: {self.actual_fps:.2f})")
                                                save_frames_as_video(frames, save_fps, str(clip_path))
                                                
                                                # Verify file was actually created
                                                if clip_path.exists() and clip_path.stat().st_size > 0:
                                                    LOGGER.info(f"🎥 Lost track {tid}: Saved {vmae_label} clip: {clip_path.name} ({clip_path.stat().st_size} bytes)")
                                                    # Add behavior so alerts can be pushed (even on lost tracks)
                                                    results['behaviors'].append({
                                                        'track_id': tid,
                                                        'label': vmae_label,
                                                        'confidence': vmae_score,
                                                        'bbox': None,
                                                        'source': 'videomae',
                                                        'clip_path': str(clip_path),
                                                    })
                                                else:
                                                    LOGGER.error(f"Lost track {tid}: File {clip_path} was not created or is empty after save_frames_as_video")
                                        except Exception as e:
                                            LOGGER.error(f"Failed to save lost track clip for {tid}: {e}", exc_info=True)
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
    
    def _push_detections_websocket(self, detections: List[Dict], people_in_zone: int, timestamp: str, metrics: Optional[Dict] = None):
        """Push detection updates via WebSocket (non-blocking) with HTTP fallback."""
        with self.ws_lock:
            ws_available = self.ws_connected and self.ws_connection is not None
            if not ws_available:
                # Fallback to HTTP POST if WebSocket not available
                self._push_detections_http_fallback(detections, people_in_zone, timestamp)
                return
        
        # Get store_id and zone_id from config for database storage
        store_id = self.config.get('store_id', '')
        zones = self.config.get('zones', [])
        zone_id = zones[0].get('id') if zones and len(zones) > 0 else None
        
        # Add message to queue (non-blocking)
        message = {
            # Frontend expects `type: detection_update` and `camera_id`
            'type': 'detection_update',
            'camera_id': self.camera_id,
            'detections': detections,
            'people_in_zone': people_in_zone,
            'ts': timestamp,
        }
        
        # Add store_id and zone_id if available (for database storage)
        if store_id:
            message['store_id'] = store_id
        if zone_id:
            message['zone_id'] = zone_id
        
        if metrics:
            message['metrics'] = metrics
        
        try:
            self.ws_message_queue.put_nowait(message)
        except queue.Full:
            # Queue full - skip this update or use HTTP fallback
            if self.frame_idx % 100 == 0:
                LOGGER.warning(f"WebSocket message queue full for camera {self.camera_id}, using HTTP fallback")
            self._push_detections_http_fallback(detections, people_in_zone, timestamp)
    
    def _push_detections_http_fallback(self, detections: List[Dict], people_in_zone: int, timestamp: str):
        """Fallback HTTP POST for detection updates when WebSocket is unavailable."""
        try:
            # Get store_id and zone_id from config for database storage
            store_id = self.config.get('store_id', '')
            zones = self.config.get('zones', [])
            zone_id = zones[0].get('id') if zones and len(zones) > 0 else None
            
            payload = {
                'event': 'detection_update',
                'camera_id': self.camera_id,
                'detections': detections,
                'people_in_zone': people_in_zone,
                'ts': timestamp,
            }
            
            # Add store_id and zone_id if available (for database storage)
            if store_id:
                payload['store_id'] = store_id
            if zone_id:
                payload['zone_id'] = zone_id
            
            resp = requests.post(
                f"{self.backend_url}/api/events/detection-update",
                json=payload,
                headers=SERVICE_AUTH_HEADERS,
                timeout=1  # Short timeout
            )
            if resp.status_code != 200 and self.frame_idx % 100 == 0:
                LOGGER.warning(f"HTTP fallback failed: {resp.status_code}")
        except Exception as e:
            if self.frame_idx % 100 == 0:
                LOGGER.debug(f"HTTP fallback error: {e}")
    
    def _push_inout_websocket(self, count_in: int, count_out: int, store_id: str, timestamp: str):
        """Push in/out counts via WebSocket (non-blocking) with HTTP fallback."""
        with self.ws_lock:
            ws_available = self.ws_connected and self.ws_connection is not None
            if not ws_available:
                # Fallback to HTTP POST if WebSocket not available
                self._push_inout_http_fallback(count_in, count_out, store_id, timestamp)
                return
        
        # Add message to queue (non-blocking)
        message = {
            'message_type': 'inout',  # Message type identifier
            'camera_id': self.camera_id,
            'store_id': store_id,
            'count_in': count_in,
            'count_out': count_out,
            'ts': timestamp
        }
        
        try:
            self.ws_message_queue.put_nowait(message)
        except queue.Full:
            # Queue full - use HTTP fallback
            LOGGER.warning(f"WebSocket message queue full for camera {self.camera_id}, using HTTP fallback for inout")
            self._push_inout_http_fallback(count_in, count_out, store_id, timestamp)
    
    def _push_inout_http_fallback(self, count_in: int, count_out: int, store_id: str, timestamp: str):
        """Fallback HTTP POST for in/out updates when WebSocket is unavailable."""
        try:
            resp = requests.post(
                f"{self.backend_url}/api/events/inout-update",
                json={
                    'event': 'inout_update',
                    'camera_id': self.camera_id,
                    'store_id': store_id,
                    'count_in': count_in,
                    'count_out': count_out,
                    'ts': timestamp,
                },
                headers=SERVICE_AUTH_HEADERS,
                timeout=1
            )
            if resp.status_code == 200:
                LOGGER.info(f"✅ InOut update (HTTP fallback): camera={self.camera_id}, IN={count_in}, OUT={count_out}")
            else:
                LOGGER.warning(f"InOut push (HTTP fallback) failed: {resp.status_code} - {resp.text}")
        except Exception as e:
            LOGGER.error(f"InOut push (HTTP fallback) error: {e}", exc_info=True)
    
    def _push_alert_websocket(self, anomaly_type: str, confidence: float, clip_ref: str, store_id: str, timestamp: str):
        """Push behavior alert via WebSocket (non-blocking) with HTTP fallback."""
        with self.ws_lock:
            ws_available = self.ws_connected and self.ws_connection is not None
            if not ws_available:
                # Fallback to HTTP POST if WebSocket not available
                self._push_alert_http_fallback(anomaly_type, confidence, clip_ref, store_id, timestamp)
                return
        
        # Add message to queue (non-blocking)
        message = {
            'message_type': 'alert',  # Message type identifier
            'camera_id': self.camera_id,
            'store_id': store_id,
            'type': anomaly_type,  # Anomaly type (fighting, theft, etc.)
            'severity': confidence,
            'clip_ref': clip_ref,
            'ts': timestamp
        }
        
        try:
            self.ws_message_queue.put_nowait(message)
            LOGGER.info(f"🚨 Alert queued (WebSocket): {anomaly_type} ({confidence:.2f}) for camera {self.camera_id}, store {store_id}")
        except queue.Full:
            # Queue full - use HTTP fallback
            LOGGER.warning(f"WebSocket message queue full for camera {self.camera_id}, using HTTP fallback for alert")
            self._push_alert_http_fallback(anomaly_type, confidence, clip_ref, store_id, timestamp)
    
    def _push_alert_http_fallback(self, anomaly_type: str, confidence: float, clip_ref: str, store_id: str, timestamp: str):
        """Fallback HTTP POST for alerts when WebSocket is unavailable."""
        try:
            resp = requests.post(
                f"{self.backend_url}/api/events/anomaly-detected",
                json={
                    'event': 'anomaly_detected',
                    'camera_id': self.camera_id,
                    'store_id': store_id,
                    'type': anomaly_type,
                    'severity': confidence,
                    'clip_ref': clip_ref,
                    'ts': timestamp,
                },
                headers=SERVICE_AUTH_HEADERS,
                timeout=1
            )
            if resp.status_code == 200:
                LOGGER.info(f"🚨 Alert pushed (HTTP fallback): {anomaly_type} ({confidence:.2f}) clip={clip_ref}")
            else:
                LOGGER.warning(f"Alert push (HTTP fallback) failed: {resp.status_code}")
        except Exception as e:
            LOGGER.warning(f"Alert push (HTTP fallback) error: {e}")
    
    def _close_websocket(self):
        """Close WebSocket connection."""
        # Signal shutdown
        try:
            self.ws_message_queue.put_nowait(None)  # Shutdown signal
        except:
            pass
        
        with self.ws_lock:
            if self.ws_connection and self.ws_loop:
                try:
                    # Close connection in event loop
                    asyncio.run_coroutine_threadsafe(
                        self.ws_connection.close(),
                        self.ws_loop
                    )
                except:
                    pass
                self.ws_connection = None
            self.ws_connected = False
    
    def push_results(self, results: Dict[str, Any]):
        """Push results to backend API."""
        # Safety check: ensure results is not None
        if results is None:
            LOGGER.warning(f"Camera {self.camera_id}: push_results called with None results")
            return
        
        now = datetime.utcnow().isoformat() + 'Z'
        
        # Push detection updates for visualization (bounding boxes) via WebSocket
        # Send every frame for real-time updates (matching old version behavior)
        detections = results.get('detections', [])
        people_in_zone = results.get('people_in_zone', 0)
        
        # Include metrics periodically (every 30 frames ~1.2s at 25fps)
        metrics = None
        if self.frame_idx % 30 == 0:
            metrics = self.get_metrics()
        
        # Push detections every frame (no throttling for real-time responsiveness)
        self._push_detections_websocket(detections, people_in_zone, now, metrics)
        
        # Push In/Out counts (only if changed) via WebSocket
        inout_data = results.get('inout')
        if inout_data and isinstance(inout_data, dict):
            cin = inout_data.get('in', 0)
            cout = inout_data.get('out', 0)
            
            if cin != self.last_in_count or cout != self.last_out_count:
                self.last_in_count = cin
                self.last_out_count = cout
                
                store_id = self.config.get('store_id', '')
                if not store_id:
                    LOGGER.warning(f"Camera {self.camera_id}: No store_id in config, cannot send inout update")
                else:
                    # Push via WebSocket (with HTTP fallback)
                    self._push_inout_websocket(cin, cout, store_id, now)
        
        # Push behavior alerts - for any VideoMAE-confirmed non-normal behavior
        # (to match original AI developers' behavior). MobileNet "suspicious" is
        # still just a filter to trigger VideoMAE.
        pushed_tracks = set()
        
        for behavior in results.get('behaviors', []):
            # Skip if behavior is None or not a dict
            if not behavior or not isinstance(behavior, dict):
                continue
            
            # Only send alerts for VideoMAE confirmed detections
            if behavior.get('source') != 'videomae':
                continue
            
            tid = behavior.get('track_id')
            if tid is None or tid in pushed_tracks:
                continue
            
            label = behavior.get('label', 'normal')
            if not label:
                label = 'normal'
            label = label.lower()
            
            # Treat any non-normal VideoMAE label as an anomaly type.
            if label == 'normal':
                continue
            anomaly_type = label
            
            pushed_tracks.add(tid)
            
            # Include clip reference if available
            clip_ref = behavior.get('clip_path', '')
            confidence = behavior.get('confidence', 0.0)
            
            # Ensure config is not None
            if self.config is None:
                self.config = {}
            
            store_id = self.config.get('store_id', '')
            if not store_id:
                LOGGER.warning(f"Camera {self.camera_id}: No store_id in config, cannot send alert")
            else:
                # Push via WebSocket (with HTTP fallback)
                self._push_alert_websocket(anomaly_type, confidence, clip_ref, store_id, now)


class AIService:
    """
    Main AI Service that manages multiple camera processors.
    """
    
    def __init__(
        self,
        backend_url: str = 'http://backend:8000',
        device: str = 'cuda',
        poll_interval: float = 1.0,  # Reduced from 5.0 to 1.0 for faster camera discovery
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
                headers=SERVICE_AUTH_HEADERS,
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
                headers=SERVICE_AUTH_HEADERS,
                timeout=5
            )
            if resp.status_code == 200:
                config = resp.json()
                # Log config summary for debugging
                lines_count = len(config.get('lines', []))
                zones_count = len(config.get('zones', []))
                LOGGER.info(f"Camera {camera_id} config loaded: {lines_count} line(s), {zones_count} zone(s)")
                if lines_count > 0:
                    for idx, line in enumerate(config.get('lines', [])):
                        has_a = bool(line.get('line_a'))
                        has_b = bool(line.get('line_b'))
                        LOGGER.info(f"  Line {idx}: line_a={has_a}, line_b={has_b}, name={line.get('name', 'unnamed')}")
                return config
            else:
                LOGGER.warning(f"Failed to get config for {camera_id}: HTTP {resp.status_code}")
        except Exception as e:
            LOGGER.warning(f"Failed to get config for {camera_id}: {e}", exc_info=True)
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
                        processor = self.processors[cam_id]
                        processor._close_websocket()  # Cleanup WebSocket connection
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
                                executor=self._executor,
                            )
                            LOGGER.info(f"Added processor for camera: {cam_id}")
            
            # Process each camera
            for cam_id, processor in list(self.processors.items()):
                try:
                    frame = processor.pull_frame()
                    if frame is not None:
                        results = processor.process_frame(frame)
                        # Only push results if process_frame returned a valid dict
                        if results is not None and isinstance(results, dict):
                            processor.push_results(results)
                        else:
                            LOGGER.warning(f"Camera {cam_id}: process_frame returned invalid result: {results}")
                except Exception as e:
                    LOGGER.error(f"Error processing camera {cam_id}: {e}", exc_info=True)
            
            # Small delay between cycles - optimized for real-time responsiveness
            time.sleep(0.01)  # ~100 FPS max per camera (reduced from 0.03 for lower latency)
    
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

