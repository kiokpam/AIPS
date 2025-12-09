"""Unit tests for in/out counter."""
import pytest
import numpy as np
from inout_pkg.inout_counter import InOutCounter


@pytest.mark.unit
class TestInOutCounter:
    """Test in/out counting logic."""
    
    def test_counter_initialization(self):
        """Test counter initialization."""
        # Line A and Line B as (point1, point2) tuples
        line_a = ((100, 100), (200, 100))  # Horizontal line
        line_b = ((100, 200), (200, 200))  # Horizontal line below
        counter = InOutCounter(line_a, line_b)
        
        assert counter.count_in == 0
        assert counter.count_out == 0
        assert len(counter.state) == 0
    
    def test_count_entry(self):
        """Test counting an entry (crossing B then A)."""
        # Line A is bottom, Line B is top
        # Entry: crossing B (top) then A (bottom) = going from outside to inside
        line_a = ((100, 200), (200, 200))  # Bottom line (A)
        line_b = ((100, 100), (200, 100))  # Top line (B)
        counter = InOutCounter(line_a, line_b)
        
        # Track crossing from outside (above B) to inside (below A)
        # Entry: B->A (top to bottom) = IN
        # Track ID 1: starts above line B, moves down crossing B then A
        tracks = [
            (1, (150, 50, 160, 60)),     # Above line B (outside)
            (1, (150, 120, 160, 130)),   # Between lines (crossed B)
            (1, (150, 250, 160, 260)),   # Below line A (crossed both, now inside)
        ]
        
        for track in tracks:
            counter.process_tracks([track])
        
        count_in, count_out = counter.get_counts()
        # B->A = Entry (IN)
        assert count_in == 1
        assert count_out == 0
    
    def test_count_exit(self):
        """Test counting an exit (crossing A then B)."""
        # Line A is bottom, Line B is top
        # Exit: crossing A (bottom) then B (top) = going from inside to outside
        line_a = ((100, 200), (200, 200))  # Bottom line (A)
        line_b = ((100, 100), (200, 100))  # Top line (B)
        counter = InOutCounter(line_a, line_b)
        
        # Track crossing from inside (below A) to outside (above B)
        # Exit: A->B (bottom to top) = OUT
        # Track ID 1: starts below line A (inside), moves up crossing A then B
        tracks = [
            (1, (150, 250, 160, 260)),  # Below line A (inside)
            (1, (150, 150, 160, 160)),  # Between lines (crossed A)
            (1, (150, 50, 160, 60)),    # Above line B (crossed both, now outside)
        ]
        
        for track in tracks:
            counter.process_tracks([track])
        
        count_in, count_out = counter.get_counts()
        # A->B = Exit (OUT)
        assert count_out == 1
        assert count_in == 0
    
    def test_remove_id(self):
        """Test removing a track ID."""
        line_a = ((100, 200), (200, 200))
        line_b = ((100, 100), (200, 100))
        counter = InOutCounter(line_a, line_b)
        
        # Add some state
        counter.process_tracks([(1, (150, 150, 160, 160))])
        assert 1 in counter.state
        
        # Remove ID
        counter.remove_id(1)
        assert 1 not in counter.state
