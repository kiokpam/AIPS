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
  VideoOff
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
    // Model configuration removed - AI services will handle all model settings
    skip_frame: 3
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await onAdd(formData);
      onClose();
      setFormData({
        name: '',
        source: '',
        // Model configuration removed - AI services will handle all model settings
        skip_frame: 3
      });
    } catch (error) {
      toast.error('Failed to add camera');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Add New Camera</h2>
          <p className="text-slate-600 mt-1">Configure a new camera for monitoring</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label block mb-2">Camera Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="input"
                placeholder="Enter camera name"
                required
              />
            </div>

            <div>
              <label className="label block mb-2">Source</label>
              <input
                type="text"
                value={formData.source}
                onChange={(e) => setFormData({...formData, source: e.target.value})}
                className="input"
                placeholder="RTSP URL, file path, or webcam ID"
                required
              />
            </div>

            {/* Model configuration removed - AI services will handle all model settings */}
            <div>
              <label className="label block mb-2">Skip Frames</label>
              <input
                type="number"
                min="1"
                max="10"
                value={formData.skip_frame}
                onChange={(e) => setFormData({...formData, skip_frame: parseInt(e.target.value)})}
                className="input"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline btn-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary btn-md"
            >
              {isLoading ? 'Adding...' : 'Add Camera'}
            </button>
          </div>
        </form>
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
          // Model configuration removed - AI services will handle all model settings
          skip_frame: 3,
          is_active: true
        },
        {
          id: '2',
          store_id: 'store_1',
          name: 'Checkout Camera',
          source: 'rtsp://192.168.1.101:554/stream',
          ai_services: ['people_counting'],
          // Model configuration removed - AI services will handle all model settings
          skip_frame: 2,
          is_active: true
        },
        {
          id: '3',
          store_id: 'store_1',
          name: 'Security Camera 1',
          source: 'rtsp://192.168.1.102:554/stream',
          ai_services: ['behavior_detection'],
          // Model configuration removed - AI services will handle all model settings
          skip_frame: 1,
          is_active: false
        },
        {
          id: '4',
          store_id: 'store_1',
          name: 'Parking Lot Camera',
          source: 'rtsp://192.168.1.103:554/stream',
          ai_services: ['people_counting', 'behavior_detection'],
          // Model configuration removed - AI services will handle all model settings
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
