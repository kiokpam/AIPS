
# NOTE: Trước khi chạy script này, hãy activate môi trường conda của bạn:
# conda activate aips

param(
    [switch]$SkipInstall
)

if (-not $SkipInstall) {
    Write-Host "Installing backend requirements..."
    pip install -r "backend/requirements.txt"
    Write-Host "Installing ai service requirements..."
    pip install -r "ai/people-counting/requirements.txt"
}

Write-Host "Starting backend (uvicorn). The backend will start the AI Flask service automatically."
# Đảm bảo PYTHONPATH trỏ về thư mục gốc repo để import backend.app.* không lỗi
$env:PYTHONPATH = (Get-Location).Path
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
