"""Wrapper around deep-sort-realtime DeepSort tracker with GPU support."""
from typing import List, Tuple, Iterable
import logging
import numpy as np

try:
    from deep_sort_realtime.deepsort_tracker import DeepSort
except Exception:
    DeepSort = None

LOGGER = logging.getLogger("coreai.deepsort")


class DeepSortTracker:
    def __init__(self, max_age: int = 30, embedder: str = 'mobilenet', embedder_gpu: bool = True, 
                 embedder_model_name: str = None, half: bool = True, use_embedder: bool = True):
        """Initialize DeepSORT tracker with GPU support.
        
        Args:
            max_age: Maximum frames to keep track alive without detections
            embedder: Feature extractor ('mobilenet', 'torchreid', 'clip', etc.)
            embedder_gpu: Use GPU for feature extraction
            embedder_model_name: Specific model name for embedder
            half: Use FP16 (half precision) for faster GPU inference
            use_embedder: If False, use IoU-only tracking (much faster)
        """
        if DeepSort is None:
            raise RuntimeError('deep-sort-realtime is required. Install: pip install deep-sort-realtime')
        
        # Configure for GPU acceleration
        kwargs = {
            'max_age': max_age,
            'n_init': 3,  # Number of consecutive detections before track is confirmed
            'max_iou_distance': 0.7,  # Maximum IoU distance for matching
            'nn_budget': 100,  # Maximum size of appearance feature gallery
        }
        
        # If embedder disabled, use IoU-only tracking for maximum speed
        if not use_embedder:
            # Set embedder to None and always provide embeddings
            kwargs['embedder'] = None
            kwargs['max_cosine_distance'] = 2.0  # Maximum possible cosine distance (effectively disables appearance matching)
            kwargs['max_iou_distance'] = 0.7
            LOGGER.info('DeepSORT initialized with IoU-only tracking (no embedder - fastest)')
        else:
            # GPU embedder configuration
            kwargs['max_cosine_distance'] = 0.3  # Maximum cosine distance for feature matching
            
            if embedder_gpu:
                kwargs['embedder'] = embedder
                kwargs['embedder_gpu'] = True
                
                # Use half precision for faster GPU inference
                if half:
                    kwargs['half'] = True
                
                # Optional: specify embedder model
                if embedder_model_name:
                    kwargs['embedder_model_name'] = embedder_model_name
                
                LOGGER.info(f'DeepSORT initialized with GPU embedder: {embedder} (half={half})')
            else:
                kwargs['embedder'] = embedder
                kwargs['embedder_gpu'] = False
                LOGGER.info(f'DeepSORT initialized with CPU embedder: {embedder}')
        
        try:
            self.tracker = DeepSort(**kwargs)
            self.use_embedder = use_embedder
        except Exception as e:
            # Fallback to basic config if advanced options not supported
            LOGGER.warning(f'Failed to initialize DeepSORT with specified config: {e}')
            LOGGER.info('Falling back to basic DeepSORT configuration')
            self.tracker = DeepSort(max_age=max_age)
            self.use_embedder = False

    def update(self, dets: Iterable[Tuple[int, int, int, int, float, int]], frame=None) -> List[Tuple[int, Tuple[int, int, int, int]]]:
        """Update tracks with new detections.
        
        Args:
            dets: List of detections (x1, y1, x2, y2, conf, class_id)
            frame: Optional frame for feature extraction (only used if embedder enabled)
            
        Returns:
            List of (track_id, bbox) tuples
        """
        # Convert detections to (tlwh, conf, class)
        inputs = []
        for x1, y1, x2, y2, conf, cls in dets:
            w = x2 - x1
            h = y2 - y1
            inputs.append(([int(x1), int(y1), int(w), int(h)], float(conf), 'person' if cls == 0 else 'obj'))

        # Only pass frame if embedder is enabled (for maximum speed)
        # When embedder=None, we must provide embeddings
        if self.use_embedder and frame is not None:
            tracks = self.tracker.update_tracks(inputs, frame=frame)
        else:
            # For IoU-only tracking: provide dummy embeddings (normalized random vectors)
            # Using zeros causes "invalid numeric entries" in cost matrix
            # Use unit vectors so cosine distance calculation works (always returns valid 0-2 range)
            dummy_embeds = [np.ones(512, dtype=np.float32) / np.sqrt(512) for _ in inputs]
            tracks = self.tracker.update_tracks(inputs, embeds=dummy_embeds)
            
        out = []
        for tr in tracks:
            if not tr.is_confirmed():
                continue
            try:
                tid = int(tr.track_id)
                l, t, r, b = tr.to_ltrb()
                out.append((tid, (int(l), int(t), int(r), int(b))))
            except Exception:
                continue
        return out
