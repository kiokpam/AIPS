# Advanced Camera Configuration & File Upload API Documentation

This document describes the advanced camera configuration and file upload endpoints designed for React Next.js frontend integration.

## 📁 **File Upload Endpoints**

### **1. Upload Video File**
```http
POST /api/upload/file
```

**Description**: Upload a video file for testing or camera addition.

**Request**: Multipart form data with file
```javascript
const formData = new FormData();
formData.append('file', videoFile);

const response = await fetch('/api/upload/file', {
  method: 'POST',
  body: formData
});
```

**Response**:
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "file": {
    "file_id": "uuid-string",
    "original_filename": "video.mp4",
    "saved_filename": "uuid-string.mp4",
    "file_path": "uploads/uuid-string.mp4",
    "file_size": 15728640,
    "duration": 120.5,
    "fps": 30.0,
    "width": 1920,
    "height": 1080,
    "format": ".mp4"
  }
}
```

**Usage in React**:
```jsx
const FileUploader = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/upload/file', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      setUploadedFile(result.file);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div>
      <input type="file" onChange={handleFileUpload} accept="video/*" />
      {uploading && <p>Uploading...</p>}
      {uploadedFile && (
        <div>
          <p>File uploaded: {uploadedFile.original_filename}</p>
          <p>Duration: {uploadedFile.duration}s</p>
          <p>Resolution: {uploadedFile.width}x{uploadedFile.height}</p>
        </div>
      )}
    </div>
  );
};
```

### **2. List Uploaded Files**
```http
GET /api/upload/files
```

**Description**: List all uploaded files with their information.

**Response**:
```json
{
  "success": true,
  "files": [
    {
      "filename": "uuid-string.mp4",
      "file_path": "uploads/uuid-string.mp4",
      "upload_time": 1705312200.0,
      "file_size": 15728640,
      "duration": 120.5,
      "fps": 30.0,
      "width": 1920,
      "height": 1080,
      "format": ".mp4"
    }
  ],
  "total": 1
}
```

### **3. Get File Information**
```http
GET /api/upload/files/{filename}/info
```

**Description**: Get detailed information about a specific uploaded file.

### **4. Delete File**
```http
DELETE /api/upload/files/{filename}
```

**Description**: Delete an uploaded file.

### **5. Preview File**
```http
POST /api/upload/files/{filename}/preview
```

**Description**: Get preview stream URL for an uploaded file.

**Response**:
```json
{
  "success": true,
  "filename": "uuid-string.mp4",
  "preview_url": "/api/preview/stream?source=uploads/uuid-string.mp4",
  "file_path": "uploads/uuid-string.mp4"
}
```

### **6. Upload Configuration**
```http
GET /api/upload/config
```

**Description**: Get upload configuration and limits.

**Response**:
```json
{
  "success": true,
  "config": {
    "max_file_size_mb": 100,
    "allowed_extensions": [".mp4", ".avi", ".mov", ".mkv", ".wmv", ".flv", ".webm", ".m4v"],
    "upload_directory": "uploads",
    "cleanup_age_hours": 24
  }
}
```

## 🎥 **Advanced Camera Configuration**

### **1. Create Camera with Advanced Config**
```http
POST /api/cameras/
```

**Description**: Create a new camera with advanced configuration options.

**Request Body**:
```json
{
  "store_id": "store_001",
  "name": "Entrance Camera",
  "source": "rtsp://192.168.1.100:554/stream",  // or file path or webcam ID
  "ai_services": ["people_counting", "behavior_detection"],
  "model_name": "yolov8n.pt",
  "device": "auto",  // "auto", "cuda", "cpu"
  "conf_thresh": 0.5,
  "iou_thresh": 0.45,
  "max_det": 300,
  "skip_frame": 3
}
```

**Response**:
```json
{
  "id": "cam_001",
  "store_id": "store_001",
  "name": "Entrance Camera",
  "source": "rtsp://192.168.1.100:554/stream",
  "ai_services": ["people_counting", "behavior_detection"],
  "model_name": "yolov8n.pt",
  "device": "auto",
  "conf_thresh": 0.5,
  "iou_thresh": 0.45,
  "max_det": 300,
  "skip_frame": 3,
  "is_active": true
}
```

**Usage in React**:
```jsx
const CameraCreator = () => {
  const [cameraConfig, setCameraConfig] = useState({
    store_id: '',
    name: '',
    source: '',
    model_name: 'yolov8n.pt',
    device: 'auto',
    conf_thresh: 0.5,
    iou_thresh: 0.45,
    max_det: 300,
    skip_frame: 3
  });
  
  const createCamera = async () => {
    try {
      const response = await fetch('/api/cameras/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cameraConfig)
      });
      const result = await response.json();
      console.log('Camera created:', result);
    } catch (error) {
      console.error('Failed to create camera:', error);
    }
  };
  
  return (
    <div className="camera-creator">
      <h3>Create New Camera</h3>
      
      <div className="form-group">
        <label>Store ID</label>
        <input 
          value={cameraConfig.store_id}
          onChange={(e) => setCameraConfig({...cameraConfig, store_id: e.target.value})}
        />
      </div>
      
      <div className="form-group">
        <label>Camera Name</label>
        <input 
          value={cameraConfig.name}
          onChange={(e) => setCameraConfig({...cameraConfig, name: e.target.value})}
        />
      </div>
      
      <div className="form-group">
        <label>Source (RTSP URL, File Path, or Webcam ID)</label>
        <input 
          value={cameraConfig.source}
          onChange={(e) => setCameraConfig({...cameraConfig, source: e.target.value})}
          placeholder="rtsp://192.168.1.100:554/stream"
        />
      </div>
      
      <div className="form-group">
        <label>Model</label>
        <select 
          value={cameraConfig.model_name}
          onChange={(e) => setCameraConfig({...cameraConfig, model_name: e.target.value})}
        >
          <option value="yolov8n.pt">YOLOv8 Nano (Fastest)</option>
          <option value="yolov8s.pt">YOLOv8 Small</option>
          <option value="yolov8m.pt">YOLOv8 Medium</option>
          <option value="yolov8l.pt">YOLOv8 Large</option>
          <option value="yolov8x.pt">YOLOv8 Extra Large (Most Accurate)</option>
        </select>
      </div>
      
      <div className="form-group">
        <label>Device</label>
        <select 
          value={cameraConfig.device}
          onChange={(e) => setCameraConfig({...cameraConfig, device: e.target.value})}
        >
          <option value="auto">Auto (GPU if available)</option>
          <option value="cuda">GPU (CUDA)</option>
          <option value="cpu">CPU</option>
        </select>
      </div>
      
      <div className="form-group">
        <label>Confidence Threshold: {cameraConfig.conf_thresh}</label>
        <input 
          type="range" 
          min="0.1" 
          max="1.0" 
          step="0.05"
          value={cameraConfig.conf_thresh}
          onChange={(e) => setCameraConfig({...cameraConfig, conf_thresh: parseFloat(e.target.value)})}
        />
      </div>
      
      <div className="form-group">
        <label>IOU Threshold: {cameraConfig.iou_thresh}</label>
        <input 
          type="range" 
          min="0.1" 
          max="1.0" 
          step="0.05"
          value={cameraConfig.iou_thresh}
          onChange={(e) => setCameraConfig({...cameraConfig, iou_thresh: parseFloat(e.target.value)})}
        />
      </div>
      
      <div className="form-group">
        <label>Max Detections: {cameraConfig.max_det}</label>
        <input 
          type="number" 
          min="1" 
          max="1000"
          value={cameraConfig.max_det}
          onChange={(e) => setCameraConfig({...cameraConfig, max_det: parseInt(e.target.value)})}
        />
      </div>
      
      <div className="form-group">
        <label>Skip Frames: {cameraConfig.skip_frame}</label>
        <input 
          type="number" 
          min="1" 
          max="10"
          value={cameraConfig.skip_frame}
          onChange={(e) => setCameraConfig({...cameraConfig, skip_frame: parseInt(e.target.value)})}
        />
      </div>
      
      <button onClick={createCamera}>Create Camera</button>
    </div>
  );
};
```

### **2. Get Camera Configuration**
```http
GET /api/cameras/{camera_id}/config
```

**Description**: Get current camera configuration.

**Response**:
```json
{
  "camera_id": "cam_001",
  "config": {
    "camera_id": "cam_001",
    "source": "rtsp://192.168.1.100:554/stream",
    "model_name": "yolov8n.pt",
    "device": "auto",
    "conf_thresh": 0.5,
    "iou_thresh": 0.45,
    "max_det": 300,
    "skip_frame": 3,
    "ai_services": ["people_counting", "behavior_detection"]
  }
}
```

### **3. Update Camera Configuration**
```http
PUT /api/cameras/{camera_id}/config
```

**Description**: Update camera configuration.

**Request Body**:
```json
{
  "model_name": "yolov8s.pt",
  "device": "cuda",
  "conf_thresh": 0.6,
  "iou_thresh": 0.5,
  "max_det": 200,
  "skip_frame": 2
}
```

**Response**:
```json
{
  "message": "Camera configuration updated successfully",
  "config": {
    "camera_id": "cam_001",
    "source": "rtsp://192.168.1.100:554/stream",
    "model_name": "yolov8s.pt",
    "device": "cuda",
    "conf_thresh": 0.6,
    "iou_thresh": 0.5,
    "max_det": 200,
    "skip_frame": 2,
    "ai_services": ["people_counting", "behavior_detection"]
  }
}
```

## 🎯 **Configuration Options Explained**

### **Model Selection**
- **yolov8n.pt**: Nano - Fastest, lowest accuracy
- **yolov8s.pt**: Small - Good balance
- **yolov8m.pt**: Medium - Better accuracy
- **yolov8l.pt**: Large - High accuracy
- **yolov8x.pt**: Extra Large - Highest accuracy, slowest

### **Device Selection**
- **auto**: Automatically choose GPU if available, otherwise CPU
- **cuda**: Force GPU usage (requires CUDA)
- **cpu**: Force CPU usage

### **Detection Parameters**
- **conf_thresh**: Confidence threshold (0.1-1.0) - Higher = fewer false positives
- **iou_thresh**: Intersection over Union threshold (0.1-1.0) - Higher = less overlap
- **max_det**: Maximum detections per frame (1-1000) - Higher = more objects detected
- **skip_frame**: Process every N frames (1-10) - Higher = better performance

## 🔧 **React Integration Examples**

### **Complete Camera Management Component**
```jsx
const AdvancedCameraManager = () => {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [config, setConfig] = useState(null);
  
  useEffect(() => {
    fetchCameras();
  }, []);
  
  const fetchCameras = async () => {
    const response = await fetch('/api/cameras/');
    const data = await response.json();
    setCameras(data);
  };
  
  const updateCameraConfig = async (cameraId, newConfig) => {
    try {
      const response = await fetch(`/api/cameras/${cameraId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const result = await response.json();
      setConfig(result.config);
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };
  
  return (
    <div className="advanced-camera-manager">
      <h2>Advanced Camera Management</h2>
      
      <div className="cameras-list">
        {cameras.map(camera => (
          <div key={camera.id} className="camera-card">
            <h3>{camera.name}</h3>
            <p>Source: {camera.source}</p>
            <p>Model: {camera.model_name}</p>
            <p>Device: {camera.device}</p>
            <p>Status: {camera.is_active ? 'Active' : 'Inactive'}</p>
            <button onClick={() => setSelectedCamera(camera.id)}>
              Configure
            </button>
          </div>
        ))}
      </div>
      
      {selectedCamera && (
        <CameraConfigurator 
          cameraId={selectedCamera}
          onConfigUpdate={updateCameraConfig}
        />
      )}
    </div>
  );
};

const CameraConfigurator = ({ cameraId, onConfigUpdate }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchConfig();
  }, [cameraId]);
  
  const fetchConfig = async () => {
    try {
      const response = await fetch(`/api/cameras/${cameraId}/config`);
      const data = await response.json();
      setConfig(data.config);
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleConfigChange = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
  };
  
  const saveConfig = () => {
    onConfigUpdate(cameraId, config);
  };
  
  if (loading) return <div>Loading...</div>;
  if (!config) return <div>No configuration found</div>;
  
  return (
    <div className="camera-configurator">
      <h3>Camera Configuration</h3>
      
      <div className="config-grid">
        <div className="config-item">
          <label>Model</label>
          <select 
            value={config.model_name}
            onChange={(e) => handleConfigChange('model_name', e.target.value)}
          >
            <option value="yolov8n.pt">YOLOv8 Nano</option>
            <option value="yolov8s.pt">YOLOv8 Small</option>
            <option value="yolov8m.pt">YOLOv8 Medium</option>
            <option value="yolov8l.pt">YOLOv8 Large</option>
            <option value="yolov8x.pt">YOLOv8 Extra Large</option>
          </select>
        </div>
        
        <div className="config-item">
          <label>Device</label>
          <select 
            value={config.device}
            onChange={(e) => handleConfigChange('device', e.target.value)}
          >
            <option value="auto">Auto</option>
            <option value="cuda">GPU</option>
            <option value="cpu">CPU</option>
          </select>
        </div>
        
        <div className="config-item">
          <label>Confidence: {config.conf_thresh}</label>
          <input 
            type="range" 
            min="0.1" 
            max="1.0" 
            step="0.05"
            value={config.conf_thresh}
            onChange={(e) => handleConfigChange('conf_thresh', parseFloat(e.target.value))}
          />
        </div>
        
        <div className="config-item">
          <label>IOU: {config.iou_thresh}</label>
          <input 
            type="range" 
            min="0.1" 
            max="1.0" 
            step="0.05"
            value={config.iou_thresh}
            onChange={(e) => handleConfigChange('iou_thresh', parseFloat(e.target.value))}
          />
        </div>
      </div>
      
      <button onClick={saveConfig}>Save Configuration</button>
    </div>
  );
};
```

## 🚀 **Key Features**

1. **File Upload System**: Complete video file upload and management
2. **Advanced Camera Config**: Model selection, device selection, detection parameters
3. **Real-time Configuration**: Update camera settings without restart
4. **File Validation**: Automatic file type and size validation
5. **Preview System**: Test uploaded files before adding as cameras
6. **Configuration Management**: Get and update camera settings
7. **React Integration**: Ready-to-use React components

This advanced camera configuration and file upload system provides everything needed for comprehensive camera management in your React Next.js frontend!
