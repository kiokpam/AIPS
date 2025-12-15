# Start all services except the backend (backend runs natively)
# Usage: powershell -ExecutionPolicy Bypass -File .\start-system-no-backend.ps1

$ErrorActionPreference = 'Stop'

Write-Host "🚀 Starting AIPS (containers only, no backend)"

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed or not in PATH."
    exit 1
}

try {
    docker info | Out-Null
} catch {
    Write-Error "❌ Docker is not running. Please start Docker Desktop."
    exit 1
}

# Check docker-compose (supports both docker-compose and docker compose)
$composeCmd = $null
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $composeCmd = 'docker-compose'
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
    $composeCmd = 'docker compose'
}

if (-not $composeCmd) {
    Write-Error "❌ docker-compose is not available. Install Docker Compose or use Docker Desktop with 'docker compose'."
    exit 1
}

# Prepare shared dirs
New-Item -ItemType Directory -Force -Path "backend/uploads" | Out-Null
New-Item -ItemType Directory -Force -Path "clips" | Out-Null

Write-Host "Stopping any existing stack..."
try {
    & $composeCmd down --remove-orphans | Out-Null
} catch {
    Write-Warning "Could not run down: $_"
}

Write-Host "Starting containers (all services except backend, which is not defined in compose)..."
& $composeCmd up --build -d

Write-Host "\nServices status (backend runs natively outside compose):"
& $composeCmd ps

Write-Host "\nDone. Start backend natively, for example:"
Write-Host "  cd backend"
Write-Host "  python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
Write-Host "\nContainers should call the API at http://host.docker.internal:8000"
