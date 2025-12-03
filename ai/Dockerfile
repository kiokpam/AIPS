# AI Service Dockerfile - GPU Accelerated
# Requires: NVIDIA GPU + nvidia-docker runtime

FROM nvidia/cuda:11.8-cudnn8-runtime-ubuntu22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3.10-venv \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.10 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.10 /usr/bin/python

WORKDIR /app

# Install Python dependencies with GPU support
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir \
    numpy \
    opencv-python \
    torch torchvision --index-url https://download.pytorch.org/whl/cu118 && \
    pip3 install --no-cache-dir \
    onnxruntime-gpu \
    deep-sort-realtime \
    ultralytics \
    requests

# Copy AI code
COPY . .

# Create clips directory
RUN mkdir -p /app/clips

# Environment variables for GPU
ENV BACKEND_URL=http://backend:8000
ENV AI_DEVICE=cuda
ENV PYTHONUNBUFFERED=1
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Run the AI service
CMD ["python3", "service_mode.py"]
