'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Plus,
  Play,
  Pause,
  Settings,
  MoreVertical,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  Clock,
  Wifi,
  WifiOff,
  Video,
  VideoOff,
  X,
  Undo,
  Trash2,
  Save
} from 'lucide-react';
import { cameraApi, type Camera as CameraType } from '@/lib/api';
import toast from 'react-hot-toast';

const CameraCard = ({ camera, onEdit, onDelete, onToggle }: {
  camera: CameraType;
  onEdit: (camera: CameraType) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
}) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleStreamToggle = () => {
    setIsStreaming(!isStreaming);
    toast.success(isStreaming ? 'Stream stopped' : 'Stream started');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="camera-card"
    >
      {/* Camera Preview */}
      <div className="camera-preview">
        {isStreaming ? (
          <img
            src={cameraApi.getCameraStreamUrl(camera.id)}
            alt={`${camera.name} stream`}
            className="video-stream"
            onError={() => setIsStreaming(false)}
          />
        ) : (
          <div className="video-placeholder">
            <Camera className="w-12 h-12 text-slate-400" />
            <p className="text-sm text-slate-500 mt-2">Camera Offline</p>
          </div>
        )}
        
        {/* Status Overlay */}
        <div className="absolute top-3 left-3 flex items-center space-x-2">
          <div className={`status-indicator ${camera.is_active ? 'status-online' : 'status-offline'}`} />
          <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
            {camera.is_active ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Stream Toggle */}
        <button
          onClick={handleStreamToggle}
          className="absolute top-3 right-3 p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
        >
          {isStreaming ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
        </button>

        {/* Menu Button */}
        <div className="absolute top-3 right-12 relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-10"
              >
                <button
                  onClick={() => {
                    onEdit(camera);
                    setShowMenu(false);
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Settings className="w-4 h-4 mr-3" />
                  Configure
                </button>
                <button
                  onClick={() => {
                    onToggle(camera.id, !camera.is_active);
                    setShowMenu(false);
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {camera.is_active ? <Pause className="w-4 h-4 mr-3" /> : <Play className="w-4 h-4 mr-3" />}
                  {camera.is_active ? 'Stop' : 'Start'}
                </button>
                <button
                  onClick={() => {
                    onDelete(camera.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <AlertCircle className="w-4 h-4 mr-3" />
                  Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Camera Info */}
      <div className="camera-info">
        <h3 className="camera-title">{camera.name}</h3>
        
        <div className="camera-status">
          <div className="flex items-center space-x-2">
            {camera.is_active ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <Clock className="w-4 h-4 text-slate-400" />
            )}
            <span className="text-sm text-slate-600">
              {camera.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="space-y-2 text-xs text-slate-500">
          <div className="flex justify-between">
            <span>Model:</span>
            <span className="font-medium">{camera.model_name}</span>
          </div>
          <div className="flex justify-between">
            <span>Device:</span>
            <span className="font-medium">{camera.device}</span>
          </div>
          <div className="flex justify-between">
            <span>AI Services:</span>
            <span className="font-medium">{camera.ai_services.length}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2 mt-4">
          <button
            onClick={() => onToggle(camera.id, !camera.is_active)}
            className={`btn-sm flex-1 ${
              camera.is_active 
                ? 'btn-danger' 
                : 'btn-success'
            }`}
          >
            {camera.is_active ? (
              <>
                <Pause className="w-4 h-4 mr-1" />
                Stop
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-1" />
                Start
              </>
            )}
          </button>
          <button
            onClick={() => onEdit(camera)}
            className="btn-outline btn-sm"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const AddCameraModal = ({ isOpen, onClose, onAdd }: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (cameraData: any) => void;
}) => {
  const [formData, setFormData] = useState({
    name: '',
    source: '',
    sourceType: 'video_file', // 'video_file', 'rtsp', 'webcam'
    model_name: 'yolov8n.pt',
    device: 'auto',
    conf_thresh: 0.5,
    iou_thresh: 0.45,
    max_det: 300,
    skip_frame: 3,
    taskType: 'zone', // 'zone' or 'line'
    allowMultipleAreas: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewConnected, setIsPreviewConnected] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [drawnAreas, setDrawnAreas] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const cameraData = {
        ...formData,
        source: formData.sourceType === 'video_file' && selectedFile 
          ? selectedFile.name 
          : formData.source,
        drawnAreas
      };
      await onAdd(cameraData);
      onClose();
      resetForm();
    } catch (error) {
      toast.error('Failed to add camera');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      source: '',
      sourceType: 'video_file',
      model_name: 'yolov8n.pt',
      device: 'auto',
      conf_thresh: 0.5,
      iou_thresh: 0.45,
      max_det: 300,
      skip_frame: 3,
      taskType: 'zone',
      allowMultipleAreas: true
    });
    setSelectedFile(null);
    setDrawnAreas([]);
    setIsPreviewConnected(false);
    setPreviewUrl('');
    setPreviewError('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFormData({...formData, source: file.name});
    }
  };

  const handleConnectPreview = async () => {
    if (isPreviewConnected) {
      // Disconnect preview
      setPreviewUrl('');
      setIsPreviewConnected(false);
      setPreviewError('');
      toast.success('Preview disconnected');
      return;
    }

    // Validate source
    if (!formData.source.trim()) {
      toast.error('Please enter a source URL or select a video file');
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError('');

    try {
      let sourceUrl = '';

      if (formData.sourceType === 'video_file' && selectedFile) {
        // For video files, we need to upload them first or use a local preview
        // For now, create a local object URL
        sourceUrl = URL.createObjectURL(selectedFile);
        setPreviewUrl(sourceUrl);
        setIsPreviewConnected(true);
        toast.success('Preview connected');
      } else if (formData.sourceType === 'rtsp' || formData.sourceType === 'webcam') {
        // Use backend preview endpoint for RTSP and webcam
        const encodedSource = encodeURIComponent(formData.source);
        sourceUrl = `http://localhost:8000/api/preview/stream?source=${encodedSource}`;
        
        // Test the source first
        const testResponse = await fetch(`http://localhost:8000/api/preview/test?source=${encodedSource}`);
        const testResult = await testResponse.json();
        
        if (!testResult.accessible) {
          throw new Error(testResult.error || 'Cannot access video source');
        }

        setPreviewUrl(sourceUrl);
        setIsPreviewConnected(true);
        toast.success('Preview connected');
      }
    } catch (error) {
      console.error('Preview connection error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect preview';
      setPreviewError(errorMessage);
      toast.error(`Preview error: ${errorMessage}`);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleUndo = () => {
    setDrawnAreas(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setDrawnAreas([]);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Add drawing logic here
    const newArea = {
      id: Date.now(),
      type: formData.taskType,
      points: [{ x, y }],
      timestamp: new Date()
    };
    
    setDrawnAreas(prev => [...prev, newArea]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[95vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50">
          <h2 className="text-xl font-semibold text-slate-900">Camera Configuration</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex h-[calc(95vh-120px)]">
          {/* Left Panel - Configuration */}
          <div className="w-1/2 p-6 overflow-y-auto border-r border-slate-200">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Source Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Source Type
                </label>
                <select
                  value={formData.sourceType}
                  onChange={(e) => setFormData({...formData, sourceType: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="video_file">Video File</option>
                  <option value="rtsp">RTSP Stream</option>
                  <option value="webcam">Webcam</option>
                </select>
              </div>

              {/* Source Input */}
              {formData.sourceType === 'video_file' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Video File
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="video-file"
                    />
                    <label
                      htmlFor="video-file"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
                    >
                      Choose File
                    </label>
                    <input
                      type="text"
                      value={formData.source}
                      readOnly
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg bg-slate-50"
                      placeholder="No file selected"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {formData.sourceType === 'rtsp' ? 'RTSP URL' : 'Webcam ID'}
                  </label>
                  <input
                    type="text"
                    value={formData.source}
                    onChange={(e) => setFormData({...formData, source: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={formData.sourceType === 'rtsp' ? 'rtsp://...' : '0, 1, 2...'}
                    required
                  />
                </div>
              )}

              {/* Connect Preview Button */}
              <button
                type="button"
                onClick={handleConnectPreview}
                disabled={isLoadingPreview || (!formData.source && formData.sourceType !== 'webcam')}
                className={`w-full flex items-center justify-center px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isPreviewConnected
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isLoadingPreview ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Connecting...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    {isPreviewConnected ? 'Disconnect Preview' : 'Connect Preview'}
                  </>
                )}
              </button>

              {/* Preview Error */}
              {previewError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">
                    <strong>Preview Error:</strong> {previewError}
                  </p>
                </div>
              )}

              {/* Task Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Task
                </label>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, taskType: 'zone'})}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      formData.taskType === 'zone'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    Zone
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, taskType: 'line'})}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      formData.taskType === 'line'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    Line
                  </button>
                </div>
              </div>

              {/* Advanced Settings */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Confidence: {formData.conf_thresh}
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={formData.conf_thresh}
                    onChange={(e) => setFormData({...formData, conf_thresh: parseFloat(e.target.value)})}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    IoU: {formData.iou_thresh}
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={formData.iou_thresh}
                    onChange={(e) => setFormData({...formData, iou_thresh: parseFloat(e.target.value)})}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    MaxDet: {formData.max_det}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="1000"
                    step="1"
                    value={formData.max_det}
                    onChange={(e) => setFormData({...formData, max_det: parseInt(e.target.value)})}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Multiple Areas Option */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Draw Multiple Areas
                </label>
                <p className="text-sm text-slate-600 mb-3">
                  Allow drawing and counting multiple areas for 1 camera (set up when drawing)
                </p>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.allowMultipleAreas}
                    onChange={(e) => setFormData({...formData, allowMultipleAreas: e.target.checked})}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-slate-700">Enable multiple areas</span>
                </label>
              </div>
            </form>
          </div>

          {/* Right Panel - Video Preview */}
          <div className="w-1/2 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-slate-900">Preview</h3>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={drawnAreas.length === 0}
                  className="p-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Undo className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={drawnAreas.length === 0}
                  className="p-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Video Preview */}
            <div className="flex-1 bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center relative">
              {isLoadingPreview ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-slate-500">Connecting to preview...</p>
                </div>
              ) : isPreviewConnected && previewUrl ? (
                <div className="relative w-full h-full">
                  {formData.sourceType === 'video_file' ? (
                    <video
                      src={previewUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full h-full object-contain bg-black rounded border"
                      onError={(e) => {
                        console.error('Video error:', e);
                        setPreviewError('Failed to load video file');
                        setIsPreviewConnected(false);
                      }}
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Video Stream"
                      className="w-full h-full object-contain bg-black rounded border"
                      onError={(e) => {
                        console.error('Stream error:', e);
                        setPreviewError('Failed to load video stream');
                        setIsPreviewConnected(false);
                      }}
                    />
                  )}
                  
                  {/* Drawing Overlay */}
                  <canvas
                    width={400}
                    height={300}
                    className="absolute top-0 left-0 w-full h-full pointer-events-auto cursor-crosshair"
                    onClick={handleCanvasClick}
                    onMouseEnter={() => setIsDrawing(true)}
                    onMouseLeave={() => setIsDrawing(false)}
                    style={{ zIndex: 10 }}
                  />
                  
                  {/* Drawing Mode Indicator */}
                  {isDrawing && (
                    <div className="absolute top-2 left-2 bg-blue-600 text-white px-2 py-1 rounded text-xs">
                      Drawing Mode: {formData.taskType}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <Video className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-500">Connect preview to see video feed</p>
                  {formData.sourceType === 'rtsp' && (
                    <p className="text-xs text-slate-400 mt-2">
                      Note: RTSP streams may take a moment to load
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Drawing Instructions */}
            {isPreviewConnected && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Drawing Mode:</strong> Click on the video to draw {formData.taskType}s for counting.
                  {formData.allowMultipleAreas && ' You can draw multiple areas.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState<CameraType | null>(null);

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    try {
      setIsLoading(true);
      // Mock data for demo - replace with real API call
      const mockCameras: CameraType[] = [
        {
          id: '1',
          store_id: 'store_1',
          name: 'Entrance Camera',
          source: 'rtsp://192.168.1.100:554/stream',
          ai_services: ['people_counting', 'behavior_detection'],
          model_name: 'yolov8n.pt',
          device: 'auto',
          conf_thresh: 0.5,
          iou_thresh: 0.45,
          max_det: 300,
          skip_frame: 3,
          is_active: true
        },
        {
          id: '2',
          store_id: 'store_1',
          name: 'Checkout Camera',
          source: 'rtsp://192.168.1.101:554/stream',
          ai_services: ['people_counting'],
          model_name: 'yolov8s.pt',
          device: 'cuda',
          conf_thresh: 0.6,
          iou_thresh: 0.5,
          max_det: 200,
          skip_frame: 2,
          is_active: true
        },
        {
          id: '3',
          store_id: 'store_1',
          name: 'Security Camera 1',
          source: 'rtsp://192.168.1.102:554/stream',
          ai_services: ['behavior_detection'],
          model_name: 'yolov8m.pt',
          device: 'auto',
          conf_thresh: 0.7,
          iou_thresh: 0.4,
          max_det: 150,
          skip_frame: 1,
          is_active: false
        },
        {
          id: '4',
          store_id: 'store_1',
          name: 'Parking Lot Camera',
          source: 'rtsp://192.168.1.103:554/stream',
          ai_services: ['people_counting', 'behavior_detection'],
          model_name: 'yolov8n.pt',
          device: 'cpu',
          conf_thresh: 0.4,
          iou_thresh: 0.6,
          max_det: 500,
          skip_frame: 5,
          is_active: true
        }
      ];
      
      setCameras(mockCameras);
    } catch (error) {
      toast.error('Failed to load cameras');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCamera = async (cameraData: any) => {
    try {
      // Mock API call - replace with real implementation
      const newCamera: CameraType = {
        id: Date.now().toString(),
        store_id: 'store_1',
        ...cameraData,
        is_active: false
      };
      
      setCameras(prev => [...prev, newCamera]);
      toast.success('Camera added successfully');
    } catch (error) {
      throw error;
    }
  };

  const handleToggleCamera = async (id: string, isActive: boolean) => {
    try {
      setCameras(prev => prev.map(camera => 
        camera.id === id ? { ...camera, is_active: isActive } : camera
      ));
      toast.success(`Camera ${isActive ? 'started' : 'stopped'}`);
    } catch (error) {
      toast.error('Failed to toggle camera');
    }
  };

  const handleDeleteCamera = async (id: string) => {
    if (confirm('Are you sure you want to delete this camera?')) {
      try {
        setCameras(prev => prev.filter(camera => camera.id !== id));
        toast.success('Camera deleted successfully');
      } catch (error) {
        toast.error('Failed to delete camera');
      }
    }
  };

  const handleEditCamera = (camera: CameraType) => {
    setEditingCamera(camera);
    // Open edit modal or navigate to edit page
    toast('Edit functionality coming soon');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cameras</h1>
          <p className="text-slate-600 mt-1">Manage your surveillance cameras</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary btn-md mt-4 sm:mt-0"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Camera
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Total Cameras</p>
              <p className="stat-value">{cameras.length}</p>
            </div>
            <Camera className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Active</p>
              <p className="stat-value">{cameras.filter(c => c.is_active).length}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Offline</p>
              <p className="stat-value">{cameras.filter(c => !c.is_active).length}</p>
            </div>
            <Clock className="w-8 h-8 text-slate-400" />
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">AI Services</p>
              <p className="stat-value">{cameras.reduce((acc, c) => acc + c.ai_services.length, 0)}</p>
            </div>
            <Eye className="w-8 h-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Camera Grid - 2 cameras per row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {cameras.map((camera) => (
          <CameraCard
            key={camera.id}
            camera={camera}
            onEdit={handleEditCamera}
            onDelete={handleDeleteCamera}
            onToggle={handleToggleCamera}
          />
        ))}
      </div>

      {/* Add Camera Modal */}
      <AddCameraModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddCamera}
      />
    </div>
  );
}
