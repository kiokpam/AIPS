# AI Service Dockerfile - GPU Accelerated
# Requires: NVIDIA GPU + nvidia-docker runtime

# Use CUDA 12.1.1 runtime and install cuDNN 9 to satisfy onnxruntime-gpu requirements
# Compatible with NVIDIA drivers 525.60.13+ (CUDA 12.0+)
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Add NVIDIA apt repository for cuDNN 9
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    gnupg \
    && wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb \
    && dpkg -i cuda-keyring_1.1-1_all.deb \
    && rm cuda-keyring_1.1-1_all.deb \
    && apt-get update

# Install system dependencies including cuDNN 9 for CUDA 12
RUN apt-get install -y --no-install-recommends \
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
    libcudnn9-cuda-12 \
    libcudnn9-dev-cuda-12 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.10 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.10 /usr/bin/python

WORKDIR /app

# Install Python dependencies with GPU support
# Using CUDA 12.1 compatible versions
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir \
    "numpy<2" \
    opencv-python && \
    pip3 install --no-cache-dir \
    torch torchvision --index-url https://download.pytorch.org/whl/cu121 && \
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
