"""Thin wrapper to reuse InOutCounter from provided inout_counter.py (placed in inout_pkg to avoid name clash).
"""
from typing import Iterable, Tuple
from .inout_counter import InOutCounter


class InOutAPI:
    def __init__(self, line_a: Tuple[Tuple[int, int], Tuple[int, int]], line_b: Tuple[Tuple[int, int], Tuple[int, int]]):
        self.counter = InOutCounter(line_a, line_b)

    def process_tracks(self, tracks, lost_ids: Iterable[int] = None):
        # adapt tracks to expected format: list of (id, bbox)
        self.counter.process_tracks(tracks, lost_ids=lost_ids)

    def get_counts(self):
        return self.counter.get_counts()

    def get_state_ids(self):
        return list(self.counter.state.keys())
