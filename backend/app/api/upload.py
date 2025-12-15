"""
File Upload API endpoints
Handles video file uploads for testing and camera addition
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from typing import Dict, Any
from app.services.file_upload_service import file_upload_service
from app.api.deps import CurrentMembership, require_manager

router = APIRouter(prefix="/upload", tags=["upload"])

@router.post("/file")
async def upload_file(
    file: UploadFile = File(...),
    current: CurrentMembership = Depends(require_manager),
) -> Dict[str, Any]:
    """Upload a video file for testing or camera addition"""
    try:
        result = file_upload_service.save_uploaded_file(file)
        return {
            "success": True,
            "message": "File uploaded successfully",
            "file": result
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.get("/files")
def list_uploaded_files(
    current: CurrentMembership = Depends(require_manager),
) -> Dict[str, Any]:
    """List all uploaded files"""
    try:
        files = file_upload_service.list_uploaded_files()
        return {
            "success": True,
            "files": files,
            "total": len(files)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")

@router.get("/files/{filename}/info")
def get_file_info(
    filename: str,
    current: CurrentMembership = Depends(require_manager),
) -> Dict[str, Any]:
    """Get information about a specific uploaded file"""
    try:
        file_path = file_upload_service.get_file_path(filename)
        if not file_path:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_info = file_upload_service.get_file_info(file_path)
        return {
            "success": True,
            "filename": filename,
            "file_path": str(file_path),
            "info": file_info
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get file info: {str(e)}")

@router.delete("/files/{filename}")
def delete_file(
    filename: str,
    current: CurrentMembership = Depends(require_manager),
) -> Dict[str, Any]:
    """Delete an uploaded file"""
    try:
        success = file_upload_service.delete_file(filename)
        if success:
            return {
                "success": True,
                "message": "File deleted successfully"
            }
        else:
            raise HTTPException(status_code=404, detail="File not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")

@router.post("/files/{filename}/preview")
def preview_file(
    filename: str,
    current: CurrentMembership = Depends(require_manager),
) -> Dict[str, Any]:
    """Get preview stream URL for an uploaded file"""
    try:
        file_path = file_upload_service.get_file_path(filename)
        if not file_path:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Return preview URL that can be used with the preview streaming endpoint
        preview_url = f"/api/preview/stream?source={file_path}"
        
        return {
            "success": True,
            "filename": filename,
            "preview_url": preview_url,
            "file_path": str(file_path)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create preview: {str(e)}")

@router.post("/cleanup")
def cleanup_old_files(
    current: CurrentMembership = Depends(require_manager),
) -> Dict[str, Any]:
    """Manually trigger cleanup of old uploaded files"""
    try:
        file_upload_service.cleanup_old_files()
        return {
            "success": True,
            "message": "Cleanup completed"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")

@router.get("/config")
def get_upload_config(
    current: CurrentMembership = Depends(require_manager),
) -> Dict[str, Any]:
    """Get upload configuration and limits"""
    return {
        "success": True,
        "config": {
            "max_file_size_mb": file_upload_service.max_file_size // (1024 * 1024),
            "allowed_extensions": list(file_upload_service.allowed_extensions),
            "upload_directory": str(file_upload_service.upload_dir),
            "cleanup_age_hours": 24
        }
    }
