FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV, PostgreSQL client, and video processing:
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
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

# Upgrade pip and install build tools
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Copy entire backend directory for proper package installation
COPY pyproject.toml /app/
COPY app /app/app

# Install Python dependencies explicitly with all extras
RUN pip install --no-cache-dir \
    fastapi>=0.115.0 \
    uvicorn[standard]>=0.30.0 \
    pydantic>=2.8.0 \
    SQLAlchemy>=2.0.32 \
    psycopg[binary]>=3.2.1 \
    httpx>=0.25.0 \
    opencv-python>=4.8.0 \
    numpy>=1.24.0 \
    psutil>=5.9.0 \
    werkzeug>=2.3.0 \
    python-multipart>=0.0.6 \
    passlib[bcrypt]>=1.7.4 \
    python-jose[cryptography]>=3.3.0 \
    email-validator>=2.0.0 \
    bcrypt==3.2.2

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
