'use client';

import { useState, useEffect, useRef } from 'react';
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
import { cameraApi, storeApi, type Camera as CameraType } from '@/lib/api';
import toast from 'react-hot-toast';

// Drawing Canvas Component
const DrawingCanvas = ({
  width,
  height,
  className,
  onClick,
  onMouseEnter,
  onMouseLeave,
  drawnAreas,
  currentDrawing,
  drawingMode,
  drawZone,
  drawLine
}: {
  width: number;
  height: number;
  className: string;
  onClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  drawnAreas: any[];
  currentDrawing: any;
  drawingMode: 'zone' | 'line' | null;
  drawZone: (ctx: CanvasRenderingContext2D, points: any[], color: string, lineWidth: number, isDraft?: boolean) => void;
  drawLine: (ctx: CanvasRenderingContext2D, p1: any, p2: any, color: string, lineWidth: number, isDraft?: boolean) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updateCanvasSize = () => {
      // Find the video element to match its dimensions
      const videoElement = canvas.parentElement?.querySelector('video, img') as HTMLVideoElement | HTMLImageElement;
      if (videoElement) {
        // Get the actual video/image dimensions and position
        const videoRect = videoElement.getBoundingClientRect();
        const containerRect = canvas.parentElement?.getBoundingClientRect();
        
        if (!containerRect) return;
        
        // Calculate the video's position relative to the container
        const videoLeft = videoRect.left - containerRect.left;
        const videoTop = videoRect.top - containerRect.top;
        
        // Set canvas size to match the video element size exactly
        canvas.width = videoRect.width;
        canvas.height = videoRect.height;
        
        // Position canvas exactly over the video element
        canvas.style.position = 'absolute';
        canvas.style.left = videoLeft + 'px';
        canvas.style.top = videoTop + 'px';
        canvas.style.width = videoRect.width + 'px';
        canvas.style.height = videoRect.height + 'px';
        canvas.style.pointerEvents = 'auto';
        canvas.style.border = '2px solid red'; // Debug border
        canvas.style.backgroundColor = 'rgba(255, 0, 0, 0.1)'; // Debug background
        canvas.style.zIndex = '20';
        
        console.log('=== CANVAS POSITIONING DEBUG ===');
        console.log('Video rect:', videoRect);
        console.log('Container rect:', containerRect);
        console.log('Video position in container:', videoLeft, videoTop);
        console.log('Canvas size:', videoRect.width, 'x', videoRect.height);
        console.log('Canvas position:', canvas.style.left, canvas.style.top);
        console.log('================================');
        
        // Store video element reference for click handling
        (canvas as any).videoElement = videoElement;
      } else {
        // Fallback to container size
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        console.log('Canvas fallback size:', rect.width, 'x', rect.height);
      }
    };

    // More robust video detection and positioning
    const setupVideoTracking = () => {
      const videoElement = canvas.parentElement?.querySelector('video, img') as HTMLVideoElement | HTMLImageElement;
      if (videoElement) {
        // Multiple event listeners for different load states
        videoElement.addEventListener('load', updateCanvasSize);
        videoElement.addEventListener('loadeddata', updateCanvasSize);
        videoElement.addEventListener('loadedmetadata', updateCanvasSize);
        videoElement.addEventListener('canplay', updateCanvasSize);
        
        // Also listen for video resize events
        videoElement.addEventListener('resize', updateCanvasSize);
        
        // Store reference for later use
        (canvas as any).videoElement = videoElement;
        
        console.log('Video tracking setup complete');
      }
    };

    // Initial setup with multiple attempts
    setupVideoTracking();
    setTimeout(setupVideoTracking, 100);
    setTimeout(setupVideoTracking, 500);
    setTimeout(setupVideoTracking, 1000);
    setTimeout(setupVideoTracking, 2000);

    // Handle window resize
    const handleResize = () => {
      updateCanvasSize();
      redrawCanvas();
    };

    window.addEventListener('resize', handleResize);
    
    // Use MutationObserver to detect when video element is added
    const observer = new MutationObserver(() => {
      setupVideoTracking();
      updateCanvasSize();
    });
    
    if (canvas.parentElement) {
      observer.observe(canvas.parentElement, { 
        childList: true, 
        subtree: true 
      });
    }

    const redrawCanvas = () => {
      if (!canvas || !ctx) return;
      
      // Ensure canvas is properly positioned before drawing
      updateCanvasSize();
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      console.log('Drawing canvas - drawnAreas:', drawnAreas, 'currentDrawing:', currentDrawing);

      // Draw completed areas
      drawnAreas.forEach(area => {
        if (area.type === 'zone' && area.isComplete) {
          console.log('Drawing completed zone:', area);
          drawZone(ctx, area.points, '#10b981', 2);
        } else if (area.type === 'line' && area.isComplete) {
          console.log('Drawing completed line:', area);
          drawLine(ctx, area.points[0], area.points[1], '#ef4444', 2);
        }
      });

      // Draw current drawing
      if (currentDrawing) {
        if (currentDrawing.type === 'zone') {
          drawZone(ctx, currentDrawing.points, '#3b82f6', 2, true);
        } else if (currentDrawing.type === 'line') {
          if (currentDrawing.points.length === 1) {
            // Show only the first point
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.arc(currentDrawing.points[0].x, currentDrawing.points[0].y, 4, 0, Math.PI * 2);
            ctx.fill();
          } else if (currentDrawing.points.length === 2) {
            // Show the line between two points
            drawLine(ctx, currentDrawing.points[0], currentDrawing.points[1], '#3b82f6', 3, true);
            // Show both points
            currentDrawing.points.forEach((point: any) => {
              ctx.fillStyle = '#3b82f6';
              ctx.beginPath();
              ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
              ctx.fill();
            });
          }
        }
      }
    };

    // Initial draw
    redrawCanvas();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [drawnAreas, currentDrawing]);


  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ zIndex: 10 }}
    />
  );
};

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
  const [currentDrawing, setCurrentDrawing] = useState<any>(null);
  const [drawingMode, setDrawingMode] = useState<'zone' | 'line' | null>(null);

  // Drawing functions - defined at component level for accessibility
  const drawZone = (ctx: CanvasRenderingContext2D, points: any[], color: string, lineWidth: number, isDraft = false) => {
    if (points.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(isDraft ? [5, 5] : []);

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    if (isDraft) {
      ctx.stroke();
    } else {
      ctx.closePath();
      ctx.stroke();
    }
  };

  const drawLine = (ctx: CanvasRenderingContext2D, p1: any, p2: any, color: string, lineWidth: number, isDraft = false) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(isDraft ? [5, 5] : []);

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        toast.error('Please enter a camera name');
        return;
      }

      if (!formData.source.trim()) {
        toast.error('Please enter a source URL or select a video file');
        return;
      }

      // Convert drawn areas to backend format
      const zones = drawnAreas
        .filter(area => area.type === 'zone' && area.isComplete)
        .map((area, index) => ({
          id: `zone_${index + 1}`,
          name: `Zone ${index + 1}`,
          polygon: area.points.map((p: any) => [p.x, p.y])
        }));

      const lines = drawnAreas
        .filter(area => area.type === 'line' && area.isComplete)
        .map((area, index) => ({
          id: `line_${index + 1}`,
          name: `Line ${index + 1}`,
          p1: [area.points[0].x, area.points[0].y],
          p2: [area.points[1].x, area.points[1].y]
        }));

      const cameraData = {
        name: formData.name.trim(),
        source: formData.sourceType === 'video_file' && selectedFile 
          ? selectedFile.name 
          : formData.source.trim(),
        sourceType: formData.sourceType,
        model_name: formData.model_name,
        device: formData.device,
        conf_thresh: formData.conf_thresh,
        iou_thresh: formData.iou_thresh,
        max_det: formData.max_det,
        skip_frame: formData.skip_frame,
        taskType: formData.taskType,
        allowMultipleAreas: formData.allowMultipleAreas,
        zones,
        lines
      };

      console.log('Submitting camera data:', cameraData);
      
      await onAdd(cameraData);
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error adding camera:', error);
      toast.error(`Failed to add camera: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    setCurrentDrawing(null);
    setDrawingMode(null);
    setIsDrawing(false);
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
    if (!isDrawing || !drawingMode) return;
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    
    // Get precise click coordinates relative to canvas
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Validate coordinates are within canvas bounds
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) {
      console.warn('Click outside canvas bounds:', x, y, 'Canvas:', canvas.width, 'x', canvas.height);
      return;
    }
    
    console.log('=== CLICK COORDINATES DEBUG ===');
    console.log('Mouse position:', e.clientX, e.clientY);
    console.log('Canvas rect:', rect);
    console.log('Click coordinates:', x, y);
    console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
    console.log('================================');
    
    // Add visual feedback for debugging
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Clear previous debug markers
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Redraw all existing content manually
      drawnAreas.forEach(area => {
        if (area.type === 'zone' && area.isComplete) {
          drawZone(ctx, area.points, '#10b981', 2);
        } else if (area.type === 'line' && area.isComplete) {
          drawLine(ctx, area.points[0], area.points[1], '#ef4444', 2);
        }
      });
      
      // Draw current drawing
      if (currentDrawing) {
        if (currentDrawing.type === 'zone') {
          drawZone(ctx, currentDrawing.points, '#3b82f6', 2, true);
        } else if (currentDrawing.type === 'line') {
          if (currentDrawing.points.length === 1) {
            // Show only the first point
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.arc(currentDrawing.points[0].x, currentDrawing.points[0].y, 4, 0, Math.PI * 2);
            ctx.fill();
          } else if (currentDrawing.points.length === 2) {
            // Show the line between two points
            drawLine(ctx, currentDrawing.points[0], currentDrawing.points[1], '#3b82f6', 3, true);
            // Show both points
            currentDrawing.points.forEach((point: any) => {
              ctx.fillStyle = '#3b82f6';
              ctx.beginPath();
              ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
              ctx.fill();
            });
          }
        }
      }
      
      // Add new debug marker
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Add coordinate text
      ctx.fillStyle = '#ff0000';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(`(${Math.round(x)}, ${Math.round(y)})`, x + 8, y - 8);
      
      // Add crosshair
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x + 10, y);
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
    }
    
    if (drawingMode === 'zone') {
      handleZoneClick(x, y);
    } else if (drawingMode === 'line') {
      handleLineClick(x, y);
    }
  };

  const handleZoneClick = (x: number, y: number) => {
    if (!currentDrawing) {
      // Start new zone
      setCurrentDrawing({
        id: Date.now(),
        type: 'zone',
        points: [{ x, y }],
        isComplete: false
      });
    } else {
      // Add point to current zone
      const newPoints = [...currentDrawing.points, { x, y }];
      setCurrentDrawing({
        ...currentDrawing,
        points: newPoints
      });
    }
  };

  const handleLineClick = (x: number, y: number) => {
    console.log('Line click:', x, y, 'Current drawing:', currentDrawing);
    if (!currentDrawing) {
      // Start new line with first point
      console.log('Starting new line');
      setCurrentDrawing({
        id: Date.now(),
        type: 'line',
        points: [{ x, y }],
        isComplete: false
      });
    } else if (currentDrawing.points.length === 1) {
      // Complete the line with second point
      console.log('Completing line');
      const newPoints = [...currentDrawing.points, { x, y }];
      const completedLine = {
        ...currentDrawing,
        points: newPoints,
        isComplete: true
      };

      setDrawnAreas(prev => {
        const newAreas = [...prev, completedLine];
        console.log('Added line to drawn areas:', newAreas);
        return newAreas;
      });
      setCurrentDrawing(null);
    }
  };

  const finishZone = () => {
    if (currentDrawing && currentDrawing.type === 'zone' && currentDrawing.points.length >= 3) {
      const completedZone = {
        ...currentDrawing,
        isComplete: true
      };
      setDrawnAreas(prev => [...prev, completedZone]);
      setCurrentDrawing(null);
    }
  };

  const cancelCurrentDrawing = () => {
    setCurrentDrawing(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col mx-4 my-4"
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

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
          {/* Left Panel - Configuration */}
          <div className="w-full lg:w-1/2 p-6 overflow-y-auto border-b lg:border-b-0 lg:border-r border-slate-200 flex-shrink-0 max-h-96 lg:max-h-none">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Camera Name */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Camera Name *
                </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter camera name"
                required
              />
            </div>

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
                         Task Type
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

                     {/* Drawing Mode Controls */}
                     {isPreviewConnected && (
            <div>
                         <label className="block text-sm font-medium text-slate-700 mb-2">
                           Drawing Mode
                         </label>
                         <div className="space-y-2">
                           <div className="flex space-x-2">
                             <button
                               type="button"
                               onClick={() => {
                                 setDrawingMode('zone');
                                 setIsDrawing(true);
                                 setCurrentDrawing(null);
                               }}
                               className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                 drawingMode === 'zone'
                                   ? 'bg-green-600 text-white'
                                   : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                               }`}
                             >
                               Draw Zone
                             </button>
                             <button
                               type="button"
                               onClick={() => {
                                 setDrawingMode('line');
                                 setIsDrawing(true);
                                 setCurrentDrawing(null);
                               }}
                               className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                 drawingMode === 'line'
                                   ? 'bg-green-600 text-white'
                                   : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                               }`}
                             >
                               Draw Line
                             </button>
                             <button
                               type="button"
                               onClick={() => {
                                 setDrawingMode(null);
                                 setIsDrawing(false);
                                 setCurrentDrawing(null);
                               }}
                               className="px-4 py-2 rounded-lg font-medium transition-colors bg-slate-200 text-slate-700 hover:bg-slate-300"
                             >
                               Stop Drawing
                             </button>
            </div>

                           {/* Current Drawing Status */}
                           {currentDrawing && (
                             <div className="p-3 bg-blue-50 rounded-lg">
                               <p className="text-sm text-blue-800">
                                 <strong>Drawing {currentDrawing.type}:</strong> 
                                 {currentDrawing.type === 'zone' 
                                   ? ` ${currentDrawing.points.length} points (minimum 3)`
                                   : ` ${currentDrawing.points.length}/2 points`
                                 }
                               </p>
                               <div className="flex space-x-2 mt-2">
                                 {currentDrawing.type === 'zone' && currentDrawing.points.length >= 3 && (
                                   <button
                                     type="button"
                                     onClick={finishZone}
                                     className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                                   >
                                     Finish Zone
                                   </button>
                                 )}
                                 <button
                                   type="button"
                                   onClick={cancelCurrentDrawing}
                                   className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                                 >
                                   Cancel
                                 </button>
                               </div>
                             </div>
                           )}
                         </div>
                       </div>
                     )}

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
          <div className="w-full lg:w-1/2 p-6 flex flex-col min-h-0 flex-1">
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
            <div className="flex-1 bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center relative min-h-0">
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
                      style={{ pointerEvents: 'none' }}
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
                      style={{ pointerEvents: 'none' }}
                      onError={(e) => {
                        console.error('Stream error:', e);
                        setPreviewError('Failed to load video stream');
                        setIsPreviewConnected(false);
                      }}
                    />
                  )}
                  
                         {/* Drawing Overlay */}
                          <div className="absolute top-0 left-0 w-full h-full pointer-events-auto" style={{ zIndex: 20 }}>
                            <DrawingCanvas
                              width={0}
                              height={0}
                              className="w-full h-full cursor-crosshair"
                              onClick={handleCanvasClick}
                              onMouseEnter={() => setIsDrawing(true)}
                              onMouseLeave={() => setIsDrawing(false)}
                              drawnAreas={drawnAreas}
                              currentDrawing={currentDrawing}
                              drawingMode={drawingMode}
                              drawZone={drawZone}
                              drawLine={drawLine}
                            />
                          </div>
                  
                  {/* Drawing Mode Indicator */}
                  {isDrawing && (
                    <div className="absolute top-2 left-2 bg-blue-600 text-white px-2 py-1 rounded text-xs">
                      Drawing Mode: {formData.taskType}
                    </div>
                  )}
                  
                  {/* Debug Controls */}
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const canvas = document.querySelector('canvas');
                        if (canvas) {
                          const videoElement = canvas.parentElement?.querySelector('video, img');
                          if (videoElement) {
                            const videoRect = videoElement.getBoundingClientRect();
                            const containerRect = canvas.parentElement?.getBoundingClientRect();
                            console.log('=== MANUAL DEBUG ===');
                            console.log('Video rect:', videoRect);
                            console.log('Container rect:', containerRect);
                            console.log('Canvas rect:', canvas.getBoundingClientRect());
                            console.log('Canvas size:', canvas.width, 'x', canvas.height);
                            console.log('==================');
                          }
                        }
                      }}
                      className="bg-red-500 text-white px-2 py-1 rounded text-xs"
                    >
                      Debug
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const canvas = document.querySelector('canvas');
                        if (canvas) {
                          const ctx = canvas.getContext('2d');
                          if (ctx) {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            // Trigger redraw
                            setTimeout(() => {
                              const event = new Event('resize');
                              window.dispatchEvent(event);
                            }, 100);
                          }
                        }
                      }}
                      className="bg-green-500 text-white px-2 py-1 rounded text-xs"
                    >
                      Refresh
                    </button>
                  </div>
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
              <div className="mt-4 p-3 bg-blue-50 rounded-lg flex-shrink-0">
                <p className="text-sm text-blue-800">
                  <strong>Drawing Instructions:</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-1 space-y-1">
                  <li>• <strong>Zone:</strong> Click multiple points to create a polygon (minimum 3 points), then click "Finish Zone"</li>
                  <li>• <strong>Line:</strong> Click two points to create a counting line</li>
                  <li>• Use "Draw Zone" or "Draw Line" buttons to start drawing</li>
                  <li>• Click "Stop Drawing" to exit drawing mode</li>
                  <li>• Use Undo/Clear buttons to manage drawn areas</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-slate-200 bg-slate-50 flex-shrink-0">
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
      const list = await cameraApi.getCameras();
      setCameras(list);
    } catch (error) {
      console.error('Failed to load cameras:', error);
      toast.error('Failed to load cameras');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCamera = async (cameraData: any) => {
    try {
      // Extract zones/lines for future config API (optional)
      const { zones, lines, ...cameraConfig } = cameraData;

      // Build backend payload according to CameraCreate
      // Ensure a store exists; create a default one if backend has none
      let storeId = 'store_1';
      try {
        const stores = await storeApi.getStores();
        if (stores && stores.length > 0) {
          storeId = stores[0].id;
        } else {
          const createdStore = await storeApi.createStore('Default Store');
          storeId = createdStore.id;
        }
      } catch (e) {
        console.warn('Store lookup/creation failed, falling back to store_1:', e);
      }

      const payload = {
        store_id: storeId,
        name: cameraConfig.name,
        source: cameraConfig.source,
        ai_services: ['people_counting'],
        model_name: cameraConfig.model_name,
        device: cameraConfig.device,
        conf_thresh: cameraConfig.conf_thresh,
        iou_thresh: cameraConfig.iou_thresh,
        max_det: cameraConfig.max_det,
        skip_frame: cameraConfig.skip_frame
      };

      console.log('Creating camera via API:', payload);
      const created = await cameraApi.createCamera(payload);

      // Optionally, attach zones/lines to a separate config endpoint if needed
      // await cameraApi.updateCameraConfig(created.id, { zones, lines });

      // Optionally start camera for live preview immediately
      try {
        await cameraApi.startCamera(created.id);
      } catch (e) {
        console.warn('Start camera failed (optional):', e);
      }

      // Refresh list from backend
      await loadCameras();
      toast.success('Camera added successfully');
    } catch (error) {
      console.error('Error in handleAddCamera:', error);
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
