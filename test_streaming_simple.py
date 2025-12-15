#!/usr/bin/env python3
"""
Simple test to check if USB camera streaming works
"""
import sys
import time
import logging

# Setup logging to see what's happening
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

sys.path.insert(0, 'backend')

from app.services.camera_manager import VideoStream

def test_usb_camera(device_index=0):
    """Test streaming from USB camera"""
    print(f"\n=== Testing USB Camera {device_index} ===")
    
    try:
        stream = VideoStream(device_index)
        print(f"✓ VideoStream created for device {device_index}")
        print(f"  - is_usb: {stream.is_usb}")
        print(f"  - is_rtsp: {stream.is_rtsp}")
        print(f"  - video_fps: {stream.video_fps}")
        print(f"  - frame_delay: {stream.frame_delay}")
        
        # Test reading frames
        print(f"\nReading 30 frames (should take ~1 second at 30 FPS)...")
        start_time = time.time()
        for i in range(30):
            frame = stream.read()
            if frame is not None:
                print(f"  Frame {i+1}: {frame.shape}")
            else:
                print(f"  Frame {i+1}: None (waiting for capture thread)")
            time.sleep(0.1)  # Wait 100ms between reads
        
        elapsed = time.time() - start_time
        print(f"\n✓ Completed in {elapsed:.2f} seconds")
        print(f"  Expected: ~1 second, Actual: {elapsed:.2f}s")
        
        # Check FPS
        fps = stream.get_fps()
        print(f"  Camera FPS: {fps:.1f}")
        
        stream.stop()
        print(f"✓ Stream stopped successfully")
        
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test_usb_camera(0)
