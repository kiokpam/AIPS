FROM python:3.11-slim

# Install OS deps needed by opencv / torch (may vary by platform)
RUN apt-get update && apt-get install -y --no-install-recommends \
	build-essential \
	libglib2.0-0 \
	libsm6 \
	libxrender1 \
	libxext6 \
	ffmpeg \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY . /app

EXPOSE 5001

# Run the Flask AI service
CMD ["python", "app.py"]

# NOTE: ultralytics and torch can be large and may require specific wheel builds
# for GPU support. For production, build a tailored image with the correct
# torch wheel for your CUDA version. This Dockerfile is a starting point for CPU.
