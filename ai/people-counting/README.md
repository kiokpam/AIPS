People-counting AI service (integrated from codedash_ai)

Quick start (Windows / Conda):

1. Create and activate a Python environment (recommended conda):

   conda create -n aips-ai python=3.11 -y
   conda activate aips-ai

2. Install dependencies:

   pip install -r requirements.txt

3. Run the AI Flask service (it will listen on port 5001):

   python app.py

API endpoints available (Flask service):

- POST /api/camera/add  {source, model, device}
- GET  /api/camera/list
- GET  /camera/<cam_id>/stream  (mjpeg stream)
- POST /api/camera/<cam_id>/set_task  {task: "zone"|"line", params: {...}}
- POST /api/camera/<cam_id>/clear_task
- DELETE /api/camera/<cam_id>/remove
- POST /api/upload  (multipart file upload)
- GET  /preview?source=...  (mjpeg preview)
- GET  /api/camera/<cam_id>/stats
- GET  /api/stats/summary
- GET  /api/system/gpu_info

Notes:
- The FastAPI backend includes a proxy router at /api/ai/* that forwards requests to this Flask service on port 5001.
- For full model inference you need ultralytics and a compatible PyTorch installation.

Docker
------
You can build and run the AI service in Docker (CPU mode) using the provided compose file:

1. Build and run:

    docker compose -f docker-compose.ai.yml up --build

2. The service will be available on port 5001 on the host.

GPU / Torch notes
------------------
- If you want GPU support, you should install the correct `torch` wheel for your CUDA version
   before installing `ultralytics` in the image. The simple Dockerfile here installs CPU
   versions and is a starting point. For production GPU images, use NVIDIA base images and
   the recommended torch install commands from https://pytorch.org.

