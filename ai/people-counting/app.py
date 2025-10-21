from flask import Flask, render_template, Response, request, jsonify, send_from_directory
from flask_cors import CORS
from camera_manager import CameraManager, VideoStream
import time
import os
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)  # allow cross-origin requests
manager = CameraManager()

# Uploads directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.route('/')
def index():
    return "People counting AI service"


@app.route('/api/camera/add', methods=['POST'])
def add_camera():
    try:
        data = request.json
        source = data.get('source')  # rtsp url or local file path
        model = data.get('model', 'yolov8n.pt')
        device = data.get('device', 'auto')  # "auto", "cuda", "cpu"
        
        if not source:
            return jsonify({'error': 'Missing source parameter'}), 400
        
        cam_id = manager.add_camera(source, model, device)
        return jsonify({'cam_id': cam_id})
        
    except RuntimeError as e:
        error_msg = str(e)
        return jsonify({'error': error_msg}), 400
        
    except Exception as e:
        error_msg = f"Unexpected error while adding camera: {str(e)}"
        return jsonify({'error': error_msg}), 500

@app.route('/api/camera/list')
def list_cams():
    return jsonify({'cameras': manager.list_cameras()})

@app.route('/api/camera/<cam_id>/set_task', methods=['POST'])
def set_task(cam_id):
    data = request.json
    task = data.get('task')  # "zone" or "line"
    params = data.get('params', {})
    manager.set_task(cam_id, task, params)
    return jsonify({'ok': True})

@app.route('/api/camera/<cam_id>/clear_task', methods=['POST'])
def clear_task(cam_id):
    manager.clear_task(cam_id)
    return jsonify({'ok': True, 'message': 'Task cleared, showing normal video stream'})

@app.route('/api/camera/<cam_id>/remove', methods=['DELETE'])
def remove_camera(cam_id):
    try:
        manager.remove_camera(cam_id)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/camera/<cam_id>/update_config', methods=['POST'])
def update_config(cam_id):
    data = request.json
    worker = manager.get_worker(cam_id)
    if not worker:
        return jsonify({'error': 'Camera not found'}), 404
    return jsonify({'ok': True, 'message': 'Config update placeholder'})

def gen_cam_stream(worker):
    send_times = []
    while True:
        jpeg = worker.get_jpeg_bytes()
        if jpeg is None:
            time.sleep(0.01)
            continue

        now = time.time()
        send_times.append(now)
        cutoff = now - 2.0
        send_times = [t for t in send_times if t > cutoff]

        if len(send_times) >= 5:
            span = send_times[-1] - send_times[0]
            if span > 0:
                fps_now = (len(send_times) - 1) / span
                worker.display_fps = round(min(fps_now, 60.0), 1)
            else:
                worker.display_fps = 0
        else:
            video_fps = getattr(getattr(worker, 'stream', None), 'video_fps', 0) or 0
            if isinstance(video_fps, (int, float)) and video_fps > 0:
                worker.display_fps = round(min(video_fps, 60.0), 1)
            else:
                worker.display_fps = 0

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + jpeg + b'\r\n')

        actual_fps = getattr(worker, 'display_fps', 0)
        if actual_fps > 0:
            frame_delay = 1.0 / actual_fps
            time.sleep(min(frame_delay * 0.8, 0.033))
        else:
            time.sleep(0.033)

@app.route('/camera/<cam_id>/stream')
def stream(cam_id):
    worker = manager.get_worker(cam_id)
    if not worker:
        return "Not found", 404
    return Response(gen_cam_stream(worker), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    f = request.files['file']
    if f.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    fname = secure_filename(f.filename)
    save_path = os.path.join(UPLOAD_DIR, fname)
    f.save(save_path)
    return jsonify({'path': save_path})

def gen_preview_stream(src):
    stream = VideoStream(src)
    try:
        while True:
            frame = stream.read()
            if frame is None:
                time.sleep(0.01)
                continue
            import cv2
            ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if not ret:
                time.sleep(0.01)
                continue
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.03)
    finally:
        stream.stop()

@app.route('/preview')
def preview_stream():
    src = request.args.get('source', '').strip()
    if not src:
        return 'Missing source', 400
    return Response(gen_preview_stream(src), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/camera/<cam_id>/stats')
def get_camera_stats(cam_id):
    worker = manager.get_worker(cam_id)
    if not worker:
        return jsonify({'error': 'Camera not found'}), 404
    frame_width, frame_height = 0, 0
    if worker.frame is not None:
        frame_height, frame_width = worker.frame.shape[:2]
    has_task = (
        (worker.task == "zone" and 'zone' in worker.task_params and getattr(worker, 'model', None) is not None) or
        (worker.task == "line" and getattr(worker, 'line_state', None) is not None and getattr(worker, 'model', None) is not None)
    )
    stats = {
        'people_count': getattr(worker, 'current_count', 0),
        'fps': getattr(worker, 'display_fps', 0),
        'status': 'online' if worker.running else 'offline',
        'frame_width': frame_width,
        'frame_height': frame_height,
        'device': getattr(worker, 'device', 'auto'),
        'has_task': has_task,
        'model_loaded': worker.model is not None,
        'task': getattr(worker, 'task', None),
        'skip_frame': getattr(worker, 'skip_frame', 1)
    }
    return jsonify(stats)

@app.route('/api/stats/summary')
def get_system_stats():
    total_cameras = len(manager.list_cameras())
    total_people = 0
    for cam_id in manager.list_cameras():
        worker = manager.get_worker(cam_id)
        if worker:
            total_people += getattr(worker, 'current_count', 0)
    return jsonify({
        'total_cameras': total_cameras,
        'total_people': total_people
    })

@app.route('/api/system/gpu_info')
def get_gpu_info():
    from models import get_device_info
    return jsonify(get_device_info())

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, threaded=True, debug=True)
