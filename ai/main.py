#!/usr/bin/env python3
"""Main CLI orchestrator for person detection -> tracking -> buffering -> AI pipeline.

Modified: mobilenet inference and saving clips are offloaded to a ThreadPoolExecutor
to avoid blocking the real-time display thread.
"""
import argparse
import time
import logging
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any
import threading
import queue
from concurrent.futures import ThreadPoolExecutor, Future

import cv2
import numpy as np

from detectors.yolo_onnx_detector import YOLOONNXDetector
from detectors.deepsort_tracker import DeepSortTracker
from buffers.person_buffer import PersonBuffer
from ai.mobilenet_onnx_runner import MobileNetONNXRunner
from ai.videomae_onnx_runner import VideoMAEONNXRunner
from inout_pkg.inout_api import InOutAPI
from ui.selector import select_lines, select_polygon
from zone.zone import point_in_polygon, bbox_center
from utils.visual import draw_overlay, color_for_inside
from utils.io_helpers import save_frames_as_video

LOGGER = logging.getLogger("coreai")


def open_video_stream(source: str, retry_count: int = 3, timeout: int = 10) -> Optional[cv2.VideoCapture]:
    """Open video stream with retry logic for RTSP streams."""
    for attempt in range(retry_count):
        try:
            cap = cv2.VideoCapture(source)
            
            # Configure for RTSP stability and real-time display
            if source.startswith('rtsp://'):
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimum buffer for real-time (was 3)
                cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'H264'))
                
            if cap.isOpened():
                # Test if we can actually read a frame
                ret, _ = cap.read()
                if ret:
                    LOGGER.info('Successfully opened video stream: %s', source)
                    return cap
                else:
                    cap.release()
                    
            LOGGER.warning('Attempt %d/%d failed to open stream: %s', attempt + 1, retry_count, source)
            time.sleep(1)
        except Exception as e:
            LOGGER.error('Error opening stream (attempt %d/%d): %s', attempt + 1, retry_count, str(e))
            time.sleep(1)
    
    return None


def videomae_worker(task_queue: queue.Queue, result_queue: queue.Queue, vmae: VideoMAEONNXRunner, fps: float, stop_event: threading.Event):
    """Background worker thread for processing VideoMAE tasks."""
    LOGGER.info('VideoMAE worker thread started')
    
    while not stop_event.is_set():
        try:
            # Get task with timeout to allow checking stop_event
            task = task_queue.get(timeout=0.5)
            
            if task is None:  # Poison pill to stop worker
                break
            
            tid, frames_buf, extra_sec = task
            
            # Process VideoMAE with progress logging
            LOGGER.info('Processing track %s with VideoMAE (%d frames)...', tid, len(frames_buf))
            vres = vmae.predict_buffer(frames_buf, num_frames=16, fps=fps)
            LOGGER.info('Track %s processed: %s (%.2f)', tid, vres.get('label'), vres.get('score', 0.0))
            
            # Put result in queue
            result_queue.put((tid, vres, frames_buf, extra_sec))
            
            task_queue.task_done()
            
        except queue.Empty:
            continue
        except Exception as e:
            LOGGER.exception('VideoMAE worker error: %s', str(e))
            # Mark task as done even on error
            try:
                task_queue.task_done()
            except ValueError:
                pass
            
    LOGGER.info('VideoMAE worker thread stopped')


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--source', '-s', required=True)
    p.add_argument('--no-inout', action='store_true')
    group = p.add_mutually_exclusive_group()
    group.add_argument('--zone-draw', action='store_true', help='Interactively draw zone polygon with mouse')
    group.add_argument('--zone-json', nargs='?', const='coordinate.json', default=None,
                       help='Path to JSON file containing polygon points [[x,y],...]. If provided without a path, uses ./coordinate.json')

    p.add_argument('--buffer-sec', type=float, default=2.0)
    p.add_argument('--extra-sec', type=float, default=1.0)
    p.add_argument('--mobilenet', default='models/mobilenet.onnx')
    p.add_argument('--videomae-dir', default='videomae')
    p.add_argument('--yolo', default='models/yolov8n.onnx', help='YOLO model path (default: ONNX for better performance)')
    p.add_argument('--use-pytorch-yolo', action='store_true', help='Use PyTorch YOLO instead of ONNX')
    p.add_argument('--use-pytorch-videomae', action='store_true', help='Use PyTorch VideoMAE instead of ONNX')
    p.add_argument('--device', default='cuda', help='Device for inference: cuda or cpu (default: cuda)')
    p.add_argument('--deepsort-embedder', default='mobilenet', help='DeepSORT embedder model (mobilenet, torchreid, clip)')
    p.add_argument('--deepsort-half', action='store_true', default=True, help='Use FP16 for DeepSORT GPU (default: True)')
    p.add_argument('--no-deepsort-gpu', action='store_true', help='Disable GPU for DeepSORT (use CPU)')
    p.add_argument('--deepsort-use-embedder', action='store_true', help='Enable deep feature extraction (slower but more accurate). Default is IoU-only for speed.')
    p.add_argument('--conf', type=float, default=0.5)
    p.add_argument('--debug', action='store_true')
    p.add_argument('--rtsp-retry', type=int, default=3)
    p.add_argument('--rtsp-reconnect-interval', type=int, default=30, help='Seconds between RTSP health checks')
    return p.parse_args()



def main():
    args = parse_args()
    logging.basicConfig(level=logging.DEBUG if args.debug else logging.INFO)
    
    # Determine device - default to cuda for better performance
    if args.device is None:
        device = 'cuda' if cv2.cuda.getCudaEnabledDeviceCount() > 0 else 'cpu'
    else:
        device = args.device
    
    LOGGER.info(f'Using device: {device}')

    # Open video stream with proper RTSP handling
    cap = open_video_stream(args.source, retry_count=args.rtsp_retry)
    if cap is None:
        LOGGER.error('Unable to open source %s after %d attempts', args.source, args.rtsp_retry)
        return

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    is_rtsp = args.source.startswith('rtsp://')
    last_rtsp_check = time.time()


    # interactive selectors
    first_ok, first = cap.read()
    if not first_ok:
        LOGGER.error('Unable to read first frame')
        return

    line_a = line_b = None
    if not args.no_inout:
        line_a, line_b = select_lines(first)

    zone = None
    # Load zone from JSON if provided
    if args.zone_json:
        try:
            import json
            p = Path(args.zone_json)
            if not p.exists():
                LOGGER.error('Zone JSON file not found: %s', args.zone_json)
                return
            raw = json.loads(p.read_text())
            # Expect a list of [x,y] pairs or list of dicts with x/y
            if not isinstance(raw, list) or len(raw) < 4:
                LOGGER.error('Zone JSON must be a list of points with at least 4 entries')
                return
            pts = []
            for it in raw:
                if isinstance(it, (list, tuple)) and len(it) >= 2:
                    pts.append((int(it[0]), int(it[1])))
                elif isinstance(it, dict) and 'x' in it and 'y' in it:
                    pts.append((int(it['x']), int(it['y'])))
                else:
                    LOGGER.error('Invalid point format in zone JSON: %s', str(it))
                    return
            zone = pts
            LOGGER.info('Loaded zone polygon from JSON: %s', args.zone_json)
        except Exception as e:
            LOGGER.exception('Failed to load zone JSON: %s', e)
            return
    elif args.zone_draw:
        zone = select_polygon(first, n_points=4)
    else:
        LOGGER.error('Zone polygon is required. Use --zone-draw to interactively draw or --zone-json to load from file.')
        return

    # Initialize components - use ONNX by default for better performance
    LOGGER.info('Initializing AI models...')
    
    # YOLO detector

    LOGGER.info('Using ONNX YOLO (faster)')
    yolo = YOLOONNXDetector(args.yolo, device=device, conf_thresh=args.conf)
    
    # DeepSORT tracker with GPU acceleration
    use_deepsort_gpu = (device == 'cuda' or device == 'gpu' or (isinstance(device, str) and device.isdigit())) and not args.no_deepsort_gpu
    use_embedder = args.deepsort_use_embedder  # Default is False (IoU-only for speed)
    tracker = DeepSortTracker(
        max_age=10, 
        embedder=args.deepsort_embedder, 
        embedder_gpu=use_deepsort_gpu, 
        half=args.deepsort_half,
        use_embedder=use_embedder
    )
    
    mobi = MobileNetONNXRunner(args.mobilenet, device=device)
    
 
    LOGGER.info('Using ONNX VideoMAE (faster with GPU)')
    vmae = VideoMAEONNXRunner(args.videomae_dir, device=device)
    
    inout_api = InOutAPI(line_a, line_b) if not args.no_inout else None

    # VideoMAE async processing setup
    vmae_task_queue = queue.Queue(maxsize=10)  # Limit queue size to prevent memory issues
    vmae_result_queue = queue.Queue()
    vmae_stop_event = threading.Event()
    vmae_thread = threading.Thread(
        target=videomae_worker,
        args=(vmae_task_queue, vmae_result_queue, vmae, fps, vmae_stop_event),
        daemon=True
    )
    vmae_thread.start()

    # -------------------
    # THREADPOOL for background tasks (mobilenet + saving)
    # -------------------
    executor = ThreadPoolExecutor(max_workers=4)
    mobi_futures: Dict[int, Future] = {}        # track_id -> Future for mobilenet
    pending_save_futures: list = []             # keep references to save futures if needed

    def submit_save_clip(frames_buf, out_name):
        """Submit saving frames to background thread to avoid blocking."""
        if not frames_buf:
            LOGGER.warning("No frames to save for %s", out_name)
            return
        # Ensure we copy frames to avoid races (PersonBuffer may mutate)
        try:
            frames_copy = [f.copy() for f in frames_buf]
        except Exception:
            # fallback: if frames_buf is something else, just pass it
            frames_copy = frames_buf
        fut = executor.submit(save_frames_as_video, frames_copy, fps, out_name)
        pending_save_futures.append(fut)
        def _cb(f):
            try:
                f.result()
                LOGGER.info('Background saved clip: %s', out_name)
            except Exception as e:
                LOGGER.exception('Error saving clip in background %s: %s', out_name, e)
        fut.add_done_callback(_cb)

    def submit_mobi_task(tid_local: int, crop_local: np.ndarray) -> Future:
        """Submit mobilenet prediction to executor."""
        def _mobi(c):
            try:
                return mobi.predict_on_crop(c)
            except Exception as e:
                LOGGER.exception("Mobilenet background error for tid %s: %s", tid_local, e)
                return ('error', 0.0)
        # copy crop to avoid mutation by buffer
        try:
            crop_copy = crop_local.copy() if hasattr(crop_local, 'copy') else crop_local
        except Exception:
            crop_copy = crop_local
        fut = executor.submit(_mobi, crop_copy)
        return fut

    def save_videomae_result(tid, vres, frames_buf, context=""):
        """Helper function to save VideoMAE results - single source of truth."""
        if vres.get('label') != 'normal':
            label_safe = str(vres['label']).replace(' ', '_')
            out_name = f"{tid}_{label_safe}_{vres['score']:.2f}.mp4"
            
            # Use frames from vres or fallback to buffer
            frames_to_save = frames_buf if frames_buf else (buffers.get(tid).get_clip_frames() if tid in buffers else None)
            
            if frames_to_save:
                submit_save_clip(frames_to_save, out_name)
                LOGGER.info('Scheduled save clip%s: %s', f' ({context})' if context else '', out_name)
            else:
                LOGGER.warning('No frames available to save for track %s%s', tid, f' ({context})' if context else '')

    buffers = {}  # track_id -> PersonBuffer
    last_mobi_frame = {}  # track_id -> last frame idx mobilenet ran (keeps scheduling frequency)
    mobi_labels = {}  # track_id -> (label, prob) - MobileNet results for display only
    vmae_results = {}  # track_id -> latest VideoMAE result (label, score) - for saving only, not display
    base_max_frames = {}  # preserve original buffer size per track
    awaiting_vmae = {}  # track_id -> extra_frames waiting to be collected
    vmae_processing = set()  # track_ids currently being processed by VideoMAE
    last_vmae_frame = {}  # track_id -> frame_idx when last VideoMAE completed (for cooldown)


    frame_idx = 0
    event_idx = 0
    running = True
    paused = False
    start_time = time.time()
    
    # FPS calculation
    fps_start_time = time.time()
    fps_frame_count = 0
    display_fps = 0.0
    
    # Frame timing for video files (to maintain original playback speed)
    frame_time = 1.0 / fps if fps > 0 else 0.033  # Time per frame in seconds
    last_frame_time = time.time()

    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    while running:
        if paused:
            key = cv2.waitKey(50) & 0xFF
            if key == ord('q'):
                break
            if key == ord('p'):
                paused = False
            continue

        # Check for RTSP health and reconnect if needed
        if is_rtsp and (time.time() - last_rtsp_check) > args.rtsp_reconnect_interval:
            if not cap.isOpened() or not cap.grab():
                LOGGER.warning('RTSP stream appears unhealthy, attempting reconnection...')
                cap.release()
                cap = open_video_stream(args.source, retry_count=args.rtsp_retry)
                if cap is None:
                    LOGGER.error('Failed to reconnect to RTSP stream')
                    break
            last_rtsp_check = time.time()

        # For RTSP only: grab latest frame for real-time display (skip old buffered frames)
        # For video files: read every frame sequentially (no skipping)
        if is_rtsp:
            # Flush old frames from buffer to get latest (real-time streaming)
            for _ in range(2):  # Flush 2 frames
                cap.grab()
        
        ret, frame = cap.read()
        if not ret:
            if is_rtsp:
                LOGGER.warning('Failed to read frame from RTSP, attempting reconnection...')
                cap.release()
                cap = open_video_stream(args.source, retry_count=args.rtsp_retry)
                if cap is None:
                    LOGGER.error('Failed to reconnect to RTSP stream')
                    break
                continue
            else:
                break

        frame_idx += 1
        now = time.time()
        
        # Calculate FPS
        fps_frame_count += 1
        if fps_frame_count >= 30:
            elapsed = time.time() - fps_start_time
            display_fps = fps_frame_count / elapsed if elapsed > 0 else 0.0
            fps_frame_count = 0
            fps_start_time = time.time()

        # Process VideoMAE results from queue -- non-blocking
        # VideoMAE results are ONLY used for saving clips, NOT for display labels
        while not vmae_result_queue.empty():
            try:
                tid, vres, frames_buf, extra_sec = vmae_result_queue.get_nowait()
                
                # Store result for internal tracking only (not for display)
                vmae_results[tid] = (vres.get('label'), vres.get('score', 0.0))
                
                # Log result
                try:
                    ln = vres.get('label_names') or []
                    probs = vres.get('probs') or []
                    prob_str = ', '.join([f"{n}:{p:.3f}" for n, p in zip(ln, probs)]) if ln and probs else str(probs)
                except Exception:
                    prob_str = str(vres.get('probs'))
                try:
                    sum_probs = sum(probs) if isinstance(probs, (list, tuple)) and len(probs) > 0 else None
                except Exception:
                    sum_probs = None
                LOGGER.info('VideoMAE result for %s: label=%s score=%.4f start=%s end=%s probs=%s sum=%.3f (frame %d)', 
                           tid, vres.get('label'), vres.get('score', 0.0), vres.get('start_frame'), 
                           vres.get('end_frame'), prob_str, float(sum_probs) if sum_probs is not None else 0.0, frame_idx)
                
                # Save clip if anomalous - using helper function
                save_videomae_result(tid, vres, frames_buf, context="runtime")
                
                # After VideoMAE processing, remove extra_sec frames (FIFO) and restore base buffer size
                if tid in buffers:
                    # Remove oldest extra_sec frames
                    extra_frames_to_remove = int(round(extra_sec * fps))
                    try:
                        buffers[tid].pop_oldest(extra_frames_to_remove)
                        LOGGER.info('Track %s: removed %d oldest frames (extra-sec) from buffer', tid, extra_frames_to_remove)
                    except Exception:
                        LOGGER.debug('Failed to pop_oldest for track %s', tid)
                    
                    # Restore buffer to base size (buffer_sec) so it continues with FIFO
                    if tid in base_max_frames:
                        try:
                            buffers[tid].set_capacity(base_max_frames[tid])
                            LOGGER.info('Track %s: buffer restored to base size %d for continued monitoring', tid, base_max_frames[tid])
                        except Exception:
                            LOGGER.debug('Failed to set_capacity for track %s', tid)
                
                # Clear VideoMAE state - MobileNet will continue monitoring and can detect suspicious again
                awaiting_vmae.pop(tid, None)
                vmae_processing.discard(tid)
                last_vmae_frame.pop(tid, None)  # Clear the frame marker
                
            except queue.Empty:
                break

        # Real-time YOLO and DeepSORT processing
        dets = yolo.detect(frame)
        tracks = tracker.update(dets, frame=frame)


        active_tracks = []
        for tid, xyxy in tracks:
            active_tracks.append((tid, xyxy))
            cx, cy = bbox_center(xyxy)
            inside_zone = point_in_polygon((cx, cy), zone)

            # Only buffer and run AI for tracks inside the zone. Outside-zone tracks are ignored by AI
            # but are still considered for IN/OUT counting.
            if inside_zone:
                # Initialize buffer with base size (--buffer-sec)
                if tid not in buffers:
                    max_frames = int(round(args.buffer_sec * fps))
                    buffers[tid] = PersonBuffer(tid, max_frames=max_frames, pad=0.1, fps=fps)
                    base_max_frames[tid] = max_frames  # Store base size for future reference
                    LOGGER.info('Track %s: initialized buffer with base size %d frames (%.1f sec)', tid, max_frames, args.buffer_sec)

                # Append current frame crop - buffer uses FIFO when full
                buffers[tid].append(frame, xyxy, timestamp=frame_idx / fps)

                # Run MobileNet inference every N frames (optimized for speed) but DO IT ASYNC NOW
                last = last_mobi_frame.get(tid, -1000)
                mobi_freq = 2
                if (frame_idx - last) >= mobi_freq:
                    last_mobi_frame[tid] = frame_idx
                    crop = buffers[tid].get_latest_crop()
                    if crop is not None:
                        # Submit mobilenet to executor (non-blocking)
                        f = submit_mobi_task(tid, crop)
                        mobi_futures[tid] = f

                # If awaiting VideoMAE (buffer was extended) and buffer is now full, queue for processing
                if tid in awaiting_vmae and tid not in vmae_processing:
                    cur_frames = buffers[tid].get_clip_frames()
                    cur_len = len(cur_frames)
                    # Target: buffer_sec + extra_sec worth of frames
                    target_len = base_max_frames.get(tid, int(round(args.buffer_sec * fps))) + awaiting_vmae[tid]
                    
                    # Check if we've waited long enough (collected extra_sec new frames)
                    start_frame = last_vmae_frame.get(tid, 0)
                    frames_collected = frame_idx - start_frame
                    frames_needed = awaiting_vmae[tid]
                    
                    if cur_len >= target_len and frames_collected >= frames_needed:
                        # Buffer is full AND waited extra_sec, ready for VideoMAE
                        try:
                            frames_buf = cur_frames.copy()  # Make a copy to avoid race conditions
                            extra_sec = args.extra_sec
                            vmae_task_queue.put_nowait((tid, frames_buf, extra_sec))
                            vmae_processing.add(tid)
                            LOGGER.info('Track %s: buffer full (%d frames) and waited %d frames (%.1f sec), queued for VideoMAE', 
                                       tid, cur_len, frames_collected, frames_collected / fps)
                        except queue.Full:
                            LOGGER.warning('VideoMAE queue full, skipping track %s', tid)
                    elif cur_len >= target_len:
                        # Buffer full but haven't waited long enough
                        remaining = frames_needed - frames_collected
                        LOGGER.debug('Track %s: buffer full but need to wait %d more frames for VideoMAE', tid, remaining)

        # process lost ids for inout
        if inout_api is not None:
            current_ids = set(tid for tid, _ in active_tracks)
            prev_ids = set(inout_api.get_state_ids())
            lost = list(prev_ids - current_ids)
            inout_api.process_tracks(active_tracks, lost_ids=lost)
        else:
            lost = []

        # If any awaiting_vmae tracks were lost, queue them for VideoMAE processing
        for lost_tid in list(lost):
            if lost_tid in awaiting_vmae and lost_tid in buffers and lost_tid not in vmae_processing:
                try:
                    frames_buf = buffers[lost_tid].get_clip_frames().copy()
                    extra_sec = args.extra_sec
                    vmae_task_queue.put_nowait((lost_tid, frames_buf, extra_sec))
                    vmae_processing.add(lost_tid)
                    LOGGER.info('Queued lost track %s for VideoMAE processing', lost_tid)
                except queue.Full:
                    LOGGER.warning('VideoMAE queue full, cannot process lost track %s', lost_tid)


        # Non-blocking check of mobilenet futures to update labels when ready
        # MobileNet labels are displayed immediately on bounding boxes
        for tid_in_fut, fut in list(mobi_futures.items()):
            if fut is None:
                continue
            if fut.done():
                try:
                    res = fut.result(timeout=0)
                    if res is not None:
                        label, prob = res
                        # Store MobileNet result for display
                        mobi_labels[tid_in_fut] = (label, prob)
                        
                        if tid_in_fut in buffers:
                            buffers[tid_in_fut].set_label(label, prob)
                            LOGGER.debug('Updated MobileNet label for %s: %s (%.3f)', tid_in_fut, label, prob)
                            # If MobileNet detects suspicious -> schedule VideoMAE extension (non-blocking)
                            if label != 'normal' and prob >= 0.5:
                                if tid_in_fut not in awaiting_vmae and tid_in_fut not in vmae_processing:
                                    # Extend buffer by extra_sec to collect more context for VideoMAE
                                    extra_frames = int(round(args.extra_sec * fps))
                                    buffers[tid_in_fut].extend_capacity(extra_frames)
                                    awaiting_vmae[tid_in_fut] = extra_frames
                                    last_vmae_frame[tid_in_fut] = frame_idx  # Mark when extension started
                                    LOGGER.info('Track %s: MobileNet detected suspicious (%.2f), extending buffer by %d frames (%.1f sec)', 
                                               tid_in_fut, prob, extra_frames, args.extra_sec)
                except Exception as e:
                    LOGGER.debug('Error reading mobilenet future for %s: %s', tid_in_fut, e)
                finally:
                    # Remove finished future to keep dict small
                    mobi_futures.pop(tid_in_fut, None)

        # visualization
        people_in_zone = 0
        # draw selected lines and polygon
        if line_a is not None and line_b is not None:
            cv2.line(frame, line_a[0], line_a[1], (0, 0, 255), 2)
            cv2.line(frame, line_b[0], line_b[1], (255, 0, 0), 2)
        if zone is not None:
            try:
                import numpy as _np
                cv2.polylines(frame, [_np.array(zone, dtype=_np.int32)], True, (0, 255, 255), 2)
            except Exception:
                pass
        for tid, xyxy in active_tracks:
            cx, cy = bbox_center(xyxy)
            inside = point_in_polygon((cx, cy), zone)
            if inside:
                people_in_zone += 1
            suspicious = False
            label = ''
            
            # Display ONLY MobileNet results on bounding boxes
            # Only show label if MobileNet has produced a result
            # Don't show "unknown" or fallback labels before first inference completes
            if tid in mobi_labels:
                mobi_label, mobi_prob = mobi_labels[tid]
                label = f'{mobi_label} ({mobi_prob:.2f})'
                suspicious = mobi_label != 'normal' and mobi_prob >= 0.5
            # If no MobileNet result yet, show empty label (no "unknown")
            
            color = color_for_inside(inside, suspicious=suspicious)
            draw_overlay(frame, xyxy, tid, label, color)

        if inout_api is not None:
            cin, cout = inout_api.get_counts()
            cv2.putText(frame, f'IN: {cin}', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)
            cv2.putText(frame, f'OUT: {cout}', (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)

        cv2.putText(frame, f'People in zone: {people_in_zone}', (10, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        
        cv2.imshow('coreai', frame)
        
        # Frame timing control based on source type
        if is_rtsp:
            # RTSP: Use minimal delay for real-time display
            wait_time = 1
        else:
            # Video file: Calculate delay to maintain original FPS
            elapsed = time.time() - last_frame_time
            target_delay = frame_time - elapsed
            
            if target_delay > 0:
                # Need to wait to maintain frame rate
                wait_time = int(target_delay * 1000)  # Convert to milliseconds
                if wait_time < 1:
                    wait_time = 1
            else:
                # Processing took longer than frame time, no wait
                wait_time = 1
        
        last_frame_time = time.time()
        
        key = cv2.waitKey(wait_time) & 0xFF
        if key == ord('q'):
            break
        if key == ord('p'):
            paused = True
        if key == ord('r'):
            # redraw selectors
            if not args.no_inout:
                line_a, line_b = select_lines(frame)
            zone = select_polygon(frame, n_points=4)

    # Cleanup
    cap.release()
    cv2.destroyAllWindows()

    LOGGER.info('Shutting down - processing remaining buffers...')
    
    # ===== STEP 1: Process all pending MobileNet futures =====
    LOGGER.info('Processing %d pending MobileNet tasks...', len(mobi_futures))
    mobi_remaining = 0
    for tid_mobi, fut_mobi in list(mobi_futures.items()):
        if fut_mobi and not fut_mobi.done():
            try:
                res = fut_mobi.result(timeout=10.0)  # Wait up to 10 seconds per task
                if res:
                    label, prob = res
                    mobi_labels[tid_mobi] = (label, prob)
                    if tid_mobi in buffers:
                        buffers[tid_mobi].set_label(label, prob)
                    LOGGER.info('Processed remaining MobileNet for track %s: %s (%.3f)', tid_mobi, label, prob)
                    
                    # If suspicious and not already queued for VideoMAE, queue it now
                    if label != 'normal' and prob >= 0.5:
                        if tid_mobi not in awaiting_vmae and tid_mobi not in vmae_processing and tid_mobi in buffers:
                            try:
                                frames_buf = buffers[tid_mobi].get_clip_frames().copy()
                                extra_sec = args.extra_sec
                                vmae_task_queue.put_nowait((tid_mobi, frames_buf, extra_sec))
                                vmae_processing.add(tid_mobi)
                                mobi_remaining += 1
                                LOGGER.info('Queued suspicious track %s for VideoMAE (detected during shutdown)', tid_mobi)
                            except queue.Full:
                                LOGGER.warning('VideoMAE queue full, cannot process track %s', tid_mobi)
            except Exception as e:
                LOGGER.warning('Failed to process remaining MobileNet for track %s: %s', tid_mobi, e)
    
    if mobi_remaining > 0:
        LOGGER.info('Queued %d additional tracks from MobileNet for VideoMAE processing', mobi_remaining)
    
    mobi_futures.clear()
    
    # ===== STEP 2: Queue all awaiting_vmae tracks for VideoMAE =====
    awaiting_count = 0
    for tid in list(awaiting_vmae.keys()):
        if tid in buffers and tid not in vmae_processing:
            try:
                frames_buf = buffers[tid].get_clip_frames().copy()
                extra_sec = args.extra_sec
                vmae_task_queue.put_nowait((tid, frames_buf, extra_sec))
                vmae_processing.add(tid)
                awaiting_count += 1
                LOGGER.info('Queued awaiting track %s for VideoMAE processing', tid)
            except queue.Full:
                LOGGER.warning('VideoMAE queue full, cannot process awaiting track %s', tid)
    
    total_vmae = awaiting_count + mobi_remaining
    if total_vmae > 0:
        LOGGER.info('Processing %d tracks with VideoMAE, please wait...', total_vmae)
    
    # ===== STEP 3: Wait for all VideoMAE tasks to complete =====
    if total_vmae > 0:
        LOGGER.info('Waiting for VideoMAE processing to complete...')
        vmae_task_queue.join()
        
        # Process any remaining results using the same helper function
        processed_count = 0
        while not vmae_result_queue.empty():
            try:
                tid, vres, frames_buf, extra_sec = vmae_result_queue.get_nowait()
                processed_count += 1
                LOGGER.info('VideoMAE (shutdown) result for %s: label=%s score=%.4f', 
                           tid, vres.get('label'), vres.get('score', 0.0))
                
                # Save using the same helper function - single source of truth
                save_videomae_result(tid, vres, frames_buf, context="shutdown")
                
            except queue.Empty:
                break
        
        LOGGER.info('All %d VideoMAE tasks processed successfully!', processed_count)
    else:
        LOGGER.info('No remaining tracks to process')
    
    # ===== STEP 4: Stop the worker thread =====
    LOGGER.info('Stopping VideoMAE worker thread...')
    vmae_stop_event.set()
    vmae_task_queue.put(None)  # Send poison pill
    vmae_thread.join(timeout=5.0)
    if vmae_thread.is_alive():
        LOGGER.warning('VideoMAE worker thread did not stop gracefully')
    else:
        LOGGER.info('VideoMAE worker thread stopped')

    # ===== STEP 5: Shutdown executor and wait for background saves =====
    LOGGER.info('Waiting for background saves to complete...')
    try:
        # Note: timeout parameter added in Python 3.9, so we use wait=True only
        executor.shutdown(wait=True)
        LOGGER.info('All background tasks completed')
    except Exception as e:
        LOGGER.exception('Error shutting down executor: %s', e)
    
    LOGGER.info('Shutdown complete!')


if __name__ == '__main__':
    main()
