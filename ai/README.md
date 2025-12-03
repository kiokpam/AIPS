# CoreAI - Real-time Person Detection & Behavior Analysis

A comprehensive AI-powered video analytics system for real-time person detection, tracking, zone monitoring, and behavior analysis using computer vision and deep learning models.

## 🎯 Features

- **Real-time Person Detection**: YOLO-based object detection optimized with ONNX runtime
- **Multi-Object Tracking**: DeepSORT tracking with GPU acceleration
- **Zone Monitoring**: Interactive polygon-based zone definition and monitoring
- **In/Out Counting**: Track people entering and exiting defined areas
- **Behavior Analysis**: 
  - Fast MobileNet screening for suspicious behavior
  - Detailed VideoMAE analysis for anomaly detection
- **Multi-threaded Processing**: Asynchronous inference to maintain real-time performance
- **RTSP Support**: Robust RTSP stream handling with auto-reconnection
- **Video File Support**: Process pre-recorded video files

## 🏗️ Architecture

```
Video Source (RTSP/File)
    ↓
YOLO Detector (ONNX)
    ↓
DeepSORT Tracker
    ↓
Zone Filter → Person Buffer (per track)
    ↓
MobileNet (fast screening) → VideoMAE (detailed analysis)
    ↓
Event Detection & Clip Saving
```

## 📋 Requirements

- Python 3.8+
- CUDA-capable GPU (recommended for real-time performance)
- See `requirements.txt` for full dependencies

## 🚀 Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd coreAI
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
```

3. **Download/Prepare Models**

**YOLO Model** (place in `models/` directory):
- `yolov8n.onnx` - YOLO object detection model
- `mobilenet_pytorch_best.pth` - MobileNet behavior classifier

**VideoMAE Model** - Download from Google Drive:

📦 **[Download VideoMAE Models from Google Drive]**



Your `videomae/` directory structure should look like:
```
videomae/
├── videomae.onnx
├── videomae.onnx.data
```

4. **Verify GPU Setup (Optional)**

Run the test script to verify ONNX Runtime and GPU acceleration:

```bash
python test_onnx.py
```

This will check:
- ✓ ONNX Runtime installation and version
- ✓ CUDA GPU availability for acceleration
- ✓ YOLO ONNX model loading
- ✓ VideoMAE ONNX model loading
- ✓ Sample inference tests

Expected output with GPU:
```
Testing ONNX Runtime Installation
✓ onnxruntime installed
  Version: 1.x.x
  Available providers: ['CUDAExecutionProvider', 'CPUExecutionProvider']
✓ CUDA GPU acceleration available
```

If CUDA is not available, install `onnxruntime-gpu` and ensure CUDA drivers are properly installed.

## 📖 Usage

### Basic Usage

```bash
python main.py --source <video_source> --zone-draw
```

### RTSP Stream Example

```bash
python main.py \
    --source rtsp://username:password@camera-ip:554/stream \
    --zone-draw \
    --device cuda
```

### Video File Example

```bash
python main.py \
    --source video.mp4 \
    --zone-json coordinate.json \
    --device cuda
```

### Command Line Arguments

#### Required Arguments
- `--source`, `-s`: Video source (RTSP URL, video file path, or camera index)

#### Zone Configuration
- `--zone-draw`: Interactively draw zone polygon with mouse
- `--zone-json [PATH]`: Load zone polygon from JSON file (default: `coordinate.json`)

#### Model Configuration
- `--yolo PATH`: YOLO model path (default: `models/yolov8n.onnx`)
- `--mobilenet PATH`: MobileNet model path (default: `models/mobilenet_pytorch_best.pth`)
- `--videomae-dir PATH`: VideoMAE directory (default: `videomae`)
- `--device DEVICE`: Inference device - `cuda` or `cpu` (default: `cuda`)

#### Buffer & Timing
- `--buffer-sec FLOAT`: Base buffer size in seconds (default: `2.0`)
- `--extra-sec FLOAT`: Extra buffer for VideoMAE analysis (default: `1.0`)

#### Detection Configuration
- `--conf FLOAT`: Confidence threshold for YOLO (default: `0.5`)

#### DeepSORT Configuration
- `--deepsort-embedder MODEL`: Embedder model (default: `mobilenet`)
- `--deepsort-half`: Enable FP16 for GPU acceleration (default: enabled)
- `--no-deepsort-gpu`: Disable GPU for DeepSORT
- `--deepsort-use-embedder`: Enable deep feature extraction (slower but more accurate)

#### RTSP Options
- `--rtsp-retry INT`: Number of connection retry attempts (default: `3`)
- `--rtsp-reconnect-interval INT`: Health check interval in seconds (default: `30`)

#### Other Options
- `--no-inout`: Disable in/out counting
- `--debug`: Enable debug logging

### Interactive Controls

During video playback:
- **Q**: Quit the application
- **P**: Pause/Resume playback
- **R**: Redraw zone and lines

## 📁 Project Structure

```
coreAI/
├── main.py                      # Main application entry point
├── requirements.txt             # Python dependencies
├── coordinate.json              # Zone polygon coordinates (optional)
│
├── ai/                          # AI inference modules
│   ├── mobilenet_runner.py      # MobileNet behavior classifier
│   └── videomae_onnx_runner.py  # VideoMAE anomaly detector
│
├── detectors/                   # Detection & tracking
│   ├── yolo_onnx_detector.py    # YOLO object detector
│   └── deepsort_tracker.py      # DeepSORT tracker wrapper
│
├── buffers/                     # Data buffering
│   └── person_buffer.py         # Per-track circular buffer
│
├── inout_pkg/                   # In/Out counting
│   ├── inout_api.py             # API wrapper
│   └── inout_counter.py         # Counting logic
│
├── zone/                        # Zone utilities
│   └── zone.py                  # Polygon operations
│
├── ui/                          # User interface
│   └── selector.py              # Interactive selection tools
│
├── utils/                       # Utilities
│   ├── visual.py                # Visualization helpers
│   └── io_helpers.py            # I/O operations
│
├── models/                      # Model files
│   ├── yolov8n.onnx
│   ├── yolov8n.pt
│   └── mobilenet_pytorch_best.pth
│
└── videomae/                    # VideoMAE files
    ├── videomae.onnx
    └── videomae.onnx.data
    ├── configs.json
    └── preprocessor_config.json
```

## 🔧 Configuration

### Zone Polygon JSON Format

Create a `coordinate.json` file with polygon points:

```json
[
  [100, 200],
  [500, 200],
  [500, 600],
  [100, 600]
]
```

Or with named coordinates:

```json
[
  {"x": 100, "y": 200},
  {"x": 500, "y": 200},
  {"x": 500, "y": 600},
  {"x": 100, "y": 600}
]
```

## 🎬 How It Works

1. **Video Capture**: Reads frames from RTSP stream or video file
2. **Detection**: YOLO detects people in each frame
3. **Tracking**: DeepSORT maintains consistent track IDs across frames
4. **Zone Filtering**: Only tracks inside the defined zone are buffered
5. **Behavior Screening**: MobileNet runs fast screening every few frames
6. **Anomaly Detection**: When suspicious behavior is detected, VideoMAE performs detailed analysis
7. **Event Logging**: Anomalous clips are automatically saved with metadata

## 🎯 Performance Optimization

- **ONNX Runtime**: Optimized inference for YOLO and VideoMAE
- **GPU Acceleration**: CUDA support for all models
- **Asynchronous Processing**: Non-blocking inference using ThreadPoolExecutor
- **Frame Buffering**: Smart buffering strategy for RTSP streams
- **Adaptive Monitoring**: MobileNet screens frequently, VideoMAE analyzes only when needed

## 📊 Output

The system generates:
- **Video Clips**: Saved when suspicious behavior is detected (`<track_id>_<label>_<score>.mp4`)
- **Console Logs**: Real-time detection and tracking information
- **Visual Overlay**: Bounding boxes, labels, and zone visualization

## 🐛 Troubleshooting

### RTSP Connection Issues
- Verify stream URL and credentials
- Adjust `--rtsp-retry` and `--rtsp-reconnect-interval`
- Check network connectivity

### Performance Issues
- Ensure GPU is available and CUDA is properly installed
- Reduce `--buffer-sec` for lower memory usage
- Disable `--deepsort-use-embedder` for faster tracking

### ONNX Runtime Issues
- For CPU-only systems, edit `requirements.txt` to use `onnxruntime` instead of `onnxruntime-gpu`
- Verify ONNX model compatibility

## 📝 License

[Your License Here]

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Contact

[Your Contact Information]

## 🙏 Acknowledgments

- YOLOv8 by Ultralytics
- DeepSORT implementation
- VideoMAE model
- OpenCV community
