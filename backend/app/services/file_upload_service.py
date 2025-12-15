"""
File Upload Service
Handles video file uploads for testing and camera addition
"""

import uuid
import shutil
from typing import Dict, Any, Optional, List
from pathlib import Path
from werkzeug.utils import secure_filename
from fastapi import UploadFile, HTTPException
import cv2

class FileUploadService:
    """Service for handling file uploads and validation"""
    
    def __init__(self):
        # Create uploads directory
        self.upload_dir = Path("uploads")
        self.upload_dir.mkdir(exist_ok=True)
        
        # Allowed file extensions
        self.allowed_extensions = {
            '.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v',
            '.3gp', '.ogv', '.ts', '.mts', '.m2ts'
        }
        
        # Maximum file size (100MB)
        self.max_file_size = 100 * 1024 * 1024
        
        # Cleanup old files (older than 24 hours)
        self.cleanup_old_files()
    
    def is_allowed_file(self, filename: str) -> bool:
        """Check if file extension is allowed"""
        if not filename:
            return False
        return Path(filename).suffix.lower() in self.allowed_extensions
    
    def validate_file(self, file: UploadFile) -> Dict[str, Any]:
        """Validate uploaded file"""
        # Check file extension
        if not self.is_allowed_file(file.filename):
            return {
                "valid": False,
                "error": f"File type not allowed. Allowed types: {', '.join(self.allowed_extensions)}"
            }
        
        # Check file size
        if hasattr(file, 'size') and file.size > self.max_file_size:
            return {
                "valid": False,
                "error": f"File too large. Maximum size: {self.max_file_size // (1024*1024)}MB"
            }
        
        return {"valid": True}
    
    def save_uploaded_file(self, file: UploadFile) -> Dict[str, Any]:
        """Save uploaded file and return file information"""
        try:
            # Validate file
            validation = self.validate_file(file)
            if not validation["valid"]:
                raise HTTPException(status_code=400, detail=validation["error"])
            
            # Generate unique filename
            file_id = str(uuid.uuid4())
            original_filename = secure_filename(file.filename)
            file_extension = Path(original_filename).suffix.lower()
            new_filename = f"{file_id}{file_extension}"
            
            # Save file
            file_path = self.upload_dir / new_filename
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Get file information
            file_info = self.get_file_info(file_path)
            
            return {
                "file_id": file_id,
                "original_filename": original_filename,
                "saved_filename": new_filename,
                "file_path": str(file_path),
                "file_size": file_info["file_size"],
                "duration": file_info["duration"],
                "fps": file_info["fps"],
                "width": file_info["width"],
                "height": file_info["height"],
                "format": file_info["format"]
            }
            
        except Exception as e:
            # Clean up file if it was created
            if 'file_path' in locals() and file_path.exists():
                file_path.unlink()
            raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    def get_file_info(self, file_path: Path) -> Dict[str, Any]:
        """Get video file information using OpenCV"""
        try:
            cap = cv2.VideoCapture(str(file_path))
            if not cap.isOpened():
                return {
                    "file_size": 0,
                    "duration": 0,
                    "fps": 0,
                    "width": 0,
                    "height": 0,
                    "format": "unknown"
                }
            
            # Get video properties
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration = frame_count / fps if fps > 0 else 0
            
            # Get file size
            file_size = file_path.stat().st_size
            
            cap.release()
            
            return {
                "file_size": file_size,
                "duration": duration,
                "fps": fps,
                "width": width,
                "height": height,
                "format": file_path.suffix.lower()
            }
            
        except Exception as e:
            return {
                "file_size": file_path.stat().st_size if file_path.exists() else 0,
                "duration": 0,
                "fps": 0,
                "width": 0,
                "height": 0,
                "format": file_path.suffix.lower(),
                "error": str(e)
            }
    
    def list_uploaded_files(self) -> List[Dict[str, Any]]:
        """List all uploaded files"""
        files = []
        for file_path in self.upload_dir.iterdir():
            if file_path.is_file():
                file_info = self.get_file_info(file_path)
                files.append({
                    "filename": file_path.name,
                    "file_path": str(file_path),
                    "upload_time": file_path.stat().st_mtime,
                    **file_info
                })
        
        # Sort by upload time (newest first)
        files.sort(key=lambda x: x["upload_time"], reverse=True)
        return files
    
    def delete_file(self, filename: str) -> bool:
        """Delete uploaded file"""
        try:
            file_path = self.upload_dir / filename
            if file_path.exists():
                file_path.unlink()
                return True
            return False
        except Exception:
            return False
    
    def cleanup_old_files(self, max_age_hours: int = 24):
        """Clean up files older than specified hours"""
        import time
        current_time = time.time()
        max_age_seconds = max_age_hours * 3600
        
        for file_path in self.upload_dir.iterdir():
            if file_path.is_file():
                file_age = current_time - file_path.stat().st_mtime
                if file_age > max_age_seconds:
                    try:
                        file_path.unlink()
                    except Exception:
                        pass  # Ignore errors during cleanup
    
    def get_file_path(self, filename: str) -> Optional[Path]:
        """Get file path for a given filename"""
        file_path = self.upload_dir / filename
        return file_path if file_path.exists() else None

# Global file upload service instance
file_upload_service = FileUploadService()
