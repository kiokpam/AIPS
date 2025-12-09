FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV and video processing:
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgtk-3-0 \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libgl1-mesa-dev \
  && rm -rf /var/lib/apt/lists/*

# Copy dependency file and application code
COPY pyproject.toml /app/
COPY app /app/app

# Install the package (now that app/ exists, it can find the package)
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]


