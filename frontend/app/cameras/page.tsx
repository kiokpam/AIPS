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
  Save,
  Brain
} from 'lucide-react';
import { cameraApi, storeApi, tasksApi, type Camera as CameraType } from '@/lib/api';
import { useI18n } from '@/src/contexts/I18nContext';
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
        
        // Prefer the media's intrinsic resolution for the canvas drawing buffer
        const naturalW = (videoElement as HTMLVideoElement).videoWidth || (videoElement as HTMLImageElement).naturalWidth || videoRect.width;
        const naturalH = (videoElement as HTMLVideoElement).videoHeight || (videoElement as HTMLImageElement).naturalHeight || videoRect.height;
        canvas.width = naturalW;
        canvas.height = naturalH;
        
        // Position canvas exactly over the video element
        canvas.style.position = 'absolute';
        canvas.style.left = videoLeft + 'px';
        canvas.style.top = videoTop + 'px';
        canvas.style.width = videoRect.width + 'px';
        canvas.style.height = videoRect.height + 'px';
        canvas.style.pointerEvents = 'auto';
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
  const { t } = useI18n();
  const [isStreaming, setIsStreaming] = useState(!!camera.is_active);
  const [isStarting, setIsStarting] = useState(false);
  const [streamRetry, setStreamRetry] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const [showAIDetails, setShowAIDetails] = useState(false);
  const [aiModel, setAiModel] = useState(camera.model_name || 'yolov8n.pt');
  const [aiDevice, setAiDevice] = useState(camera.device || 'auto');
  const [aiConf, setAiConf] = useState<number>(typeof camera.conf_thresh === 'number' ? camera.conf_thresh : 0.5);
  const [taskInfo, setTaskInfo] = useState<{ zones: any[]; lines: any[] } | null>(null);
  const [saving, setSaving] = useState(false);

  // Client-side overlay fallback: draw zones/lines over MJPEG <img>
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  const [streamNonce, setStreamNonce] = useState<number>(Date.now());

  // When backend reports active, automatically try to show the stream
  useEffect(() => {
    if (camera.is_active) {
      setIsStarting(true);
      setIsStreaming(true);
    } else {
      setIsStarting(false);
      setIsStreaming(false);
    }
  }, [camera.is_active]);

  // While starting, periodically refresh the MJPEG URL with a cache-busting nonce
  useEffect(() => {
    if (!isStreaming) return;
    let timer: any;
    let attempts = 0;
    const maxAttempts = 30; // ~60 seconds (2s * 30)
    const tick = () => {
      if (!isStarting) return; // first frame arrived
      attempts += 1;
      setStreamNonce(Date.now());
      if (attempts < maxAttempts) {
        timer = setTimeout(tick, 2000);
      }
    };
    // Kick off if starting
    if (isStarting) timer = setTimeout(tick, 0);
    return () => { if (timer) clearTimeout(timer); };
  }, [isStreaming, isStarting]);

  // Fetch frame size - prefer from image element (most accurate), fallback to stats
  useEffect(() => {
    let mounted = true;
    
    // First try to get from the actual image element (matches preview calculation)
    const tryFromImage = () => {
      if (!imgRef.current) return null;
      const img = imgRef.current;
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      if (naturalW > 0 && naturalH > 0) {
        console.log('Camera page frame size from image element:', naturalW, 'x', naturalH);
        return { w: naturalW, h: naturalH };
      }
      return null;
    };
    
    // Try image element first (most accurate, matches preview)
    const imgSize = tryFromImage();
    if (imgSize && mounted) {
      setFrameSize(imgSize);
      return;
    }
    
    // Fallback to stats API
    (async () => {
      try {
        const stats = await cameraApi.getCameraStats(camera.id);
        const w = (stats as any)?.config?.width;
        const h = (stats as any)?.config?.height;
        if (mounted && typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
          console.log('Camera page frame size from stats API:', w, 'x', h);
          setFrameSize({ w, h });
        }
      } catch {}
    })();
    
    // Also listen for image load to update when it becomes available
    const img = imgRef.current;
    if (img) {
      const handleLoad = () => {
        const imgSize = tryFromImage();
        if (imgSize && mounted) {
          setFrameSize(imgSize);
        }
      };
      img.addEventListener('load', handleLoad);
      img.addEventListener('loadedmetadata', handleLoad);
      return () => {
        mounted = false;
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('loadedmetadata', handleLoad);
      };
    }
    
    return () => { mounted = false; };
  }, [camera.id]);

  // Draw overlay when we have tasks + frame size + img laid out
  useEffect(() => {
    const canvas = overlayRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !taskInfo || !frameSize) return;

    const container = img.parentElement as HTMLElement | null;
    if (!container) return;

    const resizeAndDraw = () => {
      const containerRect = container.getBoundingClientRect();
      const cw = Math.max(1, Math.floor(containerRect.width));
      const ch = Math.max(1, Math.floor(containerRect.height));
      canvas.width = cw;
      canvas.height = ch;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, cw, ch);

      // Compute object-contain content box for the frame
      const frameW = frameSize.w;
      const frameH = frameSize.h;
      const scale = Math.min(cw / frameW, ch / frameH);
      const contentW = frameW * scale;
      const contentH = frameH * scale;
      const offsetX = (cw - contentW) / 2;
      const offsetY = (ch - contentH) / 2;

      const mapPoint = (p: number[]) => {
        // p can be normalized [0..1] or pixel [x,y]
        const x = (p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1) ? p[0] * frameW : p[0];
        const y = (p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1) ? p[1] * frameH : p[1];
        return [offsetX + x * scale, offsetY + y * scale];
      };

      // Draw zones
      (taskInfo.zones || []).forEach((z: any) => {
        const poly = (z.polygon || []).map((p: number[]) => mapPoint(p));
        if (poly.length >= 2) {
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(poly[0][0], poly[0][1]);
          for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
          ctx.closePath();
          ctx.stroke();
          if (z.name) {
            ctx.fillStyle = '#10b981';
            ctx.font = '14px sans-serif';
            ctx.fillText(String(z.name), poly[0][0] + 4, poly[0][1] + 16);
          }
        }
      });

      // Draw lines
      (taskInfo.lines || []).forEach((l: any) => {
        if (!l.p1 || !l.p2) return;
        const p1 = mapPoint(l.p1);
        const p2 = mapPoint(l.p2);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
        if (l.name) {
          ctx.fillStyle = '#3b82f6';
          ctx.font = '14px sans-serif';
          const midX = (p1[0] + p2[0]) / 2;
          const midY = (p1[1] + p2[1]) / 2;
          ctx.fillText(String(l.name), midX + 4, midY - 4);
        }
      });
    };

    resizeAndDraw();
    const onResize = () => resizeAndDraw();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => resizeAndDraw());
    ro.observe(container);
    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
    };
  }, [taskInfo, frameSize]);

  const handleStreamToggle = () => {
    setIsStreaming(!isStreaming);
    toast.success(isStreaming ? t('camera_stopped') : t('camera_started'));
  };

  // Poll camera stats to get current people count
  useEffect(() => {
    let isMounted = true;
    let timer: any;

    const fetchStats = async () => {
      try {
        const stats = await cameraApi.getCameraStats(camera.id);
        const count = stats?.stats?.current_count ?? stats?.current_count ?? null;
        if (isMounted) setCurrentCount(typeof count === 'number' ? count : null);
      } catch (_) {
        if (isMounted) setCurrentCount(null);
      } finally {
        timer = setTimeout(fetchStats, 5000);
      }
    };

    fetchStats();
    return () => { isMounted = false; if (timer) clearTimeout(timer); };
  }, [camera.id]);

  // Load AI details when modal opens
  useEffect(() => {
    if (!showAIDetails) return;
    let mounted = true;
    (async () => {
      try {
        const cfg = await cameraApi.getCameraConfig(camera.id);
        if (mounted) {
          setAiModel(cfg?.config?.model_name ?? aiModel);
          setAiDevice(cfg?.config?.device ?? aiDevice);
          setAiConf(cfg?.config?.conf_thresh ?? aiConf);
        }
      } catch {}
      try {
        const tasks = await tasksApi.getCameraTaskConfig(camera.id);
        if (mounted) setTaskInfo({ zones: tasks?.zones || [], lines: tasks?.lines || [] });
      } catch {}
    })();
    return () => { mounted = false; };
  }, [showAIDetails, camera.id]);

  // Auto-load task config for overlay on mount and refresh periodically
  useEffect(() => {
    let mounted = true;
    let timer: any;
    const loadTasks = async () => {
      try {
        const tasks = await tasksApi.getCameraTaskConfig(camera.id);
        if (mounted) setTaskInfo({ zones: tasks?.zones || [], lines: tasks?.lines || [] });
      } catch {}
      timer = setTimeout(loadTasks, 5000);
    };
    loadTasks();
    return () => { mounted = false; if (timer) clearTimeout(timer); };
  }, [camera.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="camera-card"
    >
      {/* Camera Preview */}
      <div className="camera-preview">
        {isStreaming ? (
          <div className="relative w-full h-full">
            <img
              ref={imgRef}
              src={`${cameraApi.getCameraStreamUrl(camera.id)}&t=${streamNonce}`}
              alt={`${camera.name} stream`}
              className="video-stream"
              onLoad={() => {
                setIsStarting(false);
                setStreamRetry(0);
              }}
              onError={() => {
                // Retry a few times while the worker warms up
                if (streamRetry < 20) {
                  setStreamRetry((n) => n + 1);
                  setIsStarting(true);
                  setTimeout(() => {
                    setIsStreaming(false);
                    setTimeout(() => setIsStreaming(true), 300);
                  }, 300);
                } else {
                  setIsStarting(false);
                  setIsStreaming(false);
                }
              }}
            />
            {/* Client-side overlay fallback to ensure zones/lines are visible */}
            <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
          </div>
        ) : (
          <div className="video-placeholder">
            <Camera className="w-12 h-12 text-slate-400" />
            <p className="text-sm text-slate-500 mt-2">{isStarting ? t('starting') : t('camera_offline')}</p>
          </div>
        )}
        
        {/* Status Overlay */}
        <div className="absolute top-3 left-3 flex items-center space-x-2">
          <div className={`status-indicator ${camera.is_active ? 'status-online' : 'status-offline'}`} />
          <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
            {camera.is_active ? (isStarting ? t('starting') : t('online')) : t('offline')}
          </span>
        </div>

        {/* People count badge */}
        <div className="absolute bottom-3 left-3">
          <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
            {t('people_count')}: {currentCount !== null ? currentCount : '—'}
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
                 className="absolute right-0 mt-2 w-48 bg-white text-slate-900 rounded-lg shadow-lg border border-slate-200 py-1 z-10"
              >
                <button
                  onClick={() => {
                    onEdit(camera);
                    setShowMenu(false);
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Settings className="w-4 h-4 mr-3" />
                  {t('configure')}
                </button>
                <button
                  onClick={() => {
                    setShowAIDetails(true);
                    setShowMenu(false);
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Brain className="w-4 h-4 mr-3" />
                  {t('ai_details')}
                </button>
                <button
                  onClick={() => {
                    onToggle(camera.id, !camera.is_active);
                    setShowMenu(false);
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {camera.is_active ? <Pause className="w-4 h-4 mr-3" /> : <Play className="w-4 h-4 mr-3" />}
                  {camera.is_active ? t('stop') : t('start')}
                </button>
                <button
                  onClick={() => {
                    onDelete(camera.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <AlertCircle className="w-4 h-4 mr-3" />
                  {t('delete')}
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
            onClick={() => setShowAIDetails(true)}
            className="btn-outline btn-sm"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (confirm(t('confirm_delete'))) onDelete(camera.id);
            }}
            className="btn-outline btn-sm text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* AI Details Modal */}
      <AnimatePresence>
        {showAIDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
            onClick={() => setShowAIDetails(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">{t('ai_details')}</h3>
                <button className="text-slate-500 hover:text-slate-700" onClick={() => setShowAIDetails(false)}>{t('close')}</button>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="label block mb-2">{t('model')}</label>
                  <input className="input" value={aiModel} onChange={(e) => setAiModel(e.target.value)} />
                </div>
                <div>
                  <label className="label block mb-2">{t('device')}</label>
                  <input className="input" value={aiDevice} onChange={(e) => setAiDevice(e.target.value)} />
                </div>
                <div>
                  <label className="label block mb-2">{t('confidence')}</label>
                  <input className="input" type="number" min={0} max={1} step={0.01} value={aiConf} onChange={(e) => setAiConf(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
              <div className="mt-6 grid md:grid-cols-2 gap-6">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="text-sm text-slate-500 mb-2">{t('people_count')}</div>
                  <div className="text-3xl font-bold text-slate-900">{currentCount ?? '—'}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="text-sm text-slate-500 mb-2">{t('zones')} / {t('lines')}</div>
                  <div className="text-slate-900">{taskInfo?.zones?.length ?? 0} / {taskInfo?.lines?.length ?? 0}</div>
                </div>
              </div>
              <div className="mt-4 grid md:grid-cols-2 gap-6 max-h-48 overflow-auto">
                <div>
                  <div className="text-sm font-medium text-slate-700 mb-2">{t('zones')}</div>
                  <ul className="text-sm text-slate-600 space-y-1">
                    {(taskInfo?.zones || []).map((z: any) => (
                      <li key={z.id} className="truncate">{z.name || z.id}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700 mb-2">{t('lines')}</div>
                  <ul className="text-sm text-slate-600 space-y-1">
                    {(taskInfo?.lines || []).map((l: any) => (
                      <li key={l.id} className="truncate">{l.name || l.id}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button className="btn-outline" onClick={() => setShowAIDetails(false)}>{t('close')}</button>
                <button
                  className="btn-primary"
                  onClick={async () => {
                    try {
                      setSaving(true);
                      await cameraApi.updateCameraConfig(camera.id, {
                        model_name: aiModel,
                        device: aiDevice,
                        conf_thresh: aiConf,
                      });
                      toast.success(t('save_changes'));
                    } catch (e) {
                      toast.error(t('preview_error'));
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {t('save_changes')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const AddCameraModal = ({ isOpen, onClose, onAdd }: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (cameraData: any) => void;
}) => {
  const { t } = useI18n();
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
  const [drawSize, setDrawSize] = useState<{ w: number; h: number } | null>(null);
  const [contentBox, setContentBox] = useState<{
    displayW: number; displayH: number; offsetX: number; offsetY: number; naturalW: number; naturalH: number
  } | null>(null);

  // Helper function to convert normalized coordinates back to canvas coordinates for display
  const normalizedToCanvas = (fx: number, fy: number, canvas: HTMLCanvasElement) => {
    if (!contentBox) {
      // Fallback to canvas-relative coordinates
      return {
        x: fx * canvas.width,
        y: fy * canvas.height
      };
    }
    
    // Convert normalized coordinates back to content box coordinates
    const xInContent = fx * contentBox.displayW;
    const yInContent = fy * contentBox.displayH;
    
    // Convert to canvas coordinates
    return {
      x: xInContent + contentBox.offsetX,
      y: yInContent + contentBox.offsetY
    };
  };

  // Drawing functions - defined at component level for accessibility
  const drawZone = (ctx: CanvasRenderingContext2D, points: any[], color: string, lineWidth: number, isDraft = false) => {
    if (points.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(isDraft ? [5, 5] : []);

    ctx.beginPath();
    
    // Prefer direct pixel coords for immediate on-screen draw; fall back to normalized
    const firstPoint = (points[0].x !== undefined && points[0].y !== undefined)
      ? { x: points[0].x, y: points[0].y }
      : normalizedToCanvas(points[0].fx, points[0].fy, ctx.canvas);
    
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < points.length; i++) {
      const point = (points[i].x !== undefined && points[i].y !== undefined)
        ? { x: points[i].x, y: points[i].y }
        : normalizedToCanvas(points[i].fx, points[i].fy, ctx.canvas);
      ctx.lineTo(point.x, point.y);
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

    // Prefer direct pixel coords for immediate on-screen draw; fall back to normalized
    const point1 = (p1.x !== undefined && p1.y !== undefined)
      ? { x: p1.x, y: p1.y }
      : normalizedToCanvas(p1.fx, p1.fy, ctx.canvas);
    const point2 = (p2.x !== undefined && p2.y !== undefined)
      ? { x: p2.x, y: p2.y }
      : normalizedToCanvas(p2.fx, p2.fy, ctx.canvas);

    ctx.beginPath();
    ctx.moveTo(point1.x, point1.y);
    ctx.lineTo(point2.x, point2.y);
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

      // Convert drawn areas to backend format using normalized coordinates
      // For now, we'll store the normalized coordinates and convert them in handleAddCamera
      const zones = drawnAreas
        .filter(area => area.type === 'zone' && area.isComplete)
        .map((area, index) => ({
          id: `zone_${index + 1}`,
          name: `Zone ${index + 1}`,
          points: area.points.map((p: any) => ({ x: p.x, y: p.y, fx: p.fx, fy: p.fy }))
        }));

      const lines = drawnAreas
        .filter(area => area.type === 'line' && area.isComplete)
        .map((area, index) => ({
          id: `line_${index + 1}`,
          name: `Line ${index + 1}`,
          points: area.points.map((p: any) => ({ x: p.x, y: p.y, fx: p.fx, fy: p.fy }))
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
        lines,
        canvasSize: drawSize ? { w: drawSize.w, h: drawSize.h } : null,
        contentBox: contentBox ? { ...contentBox } : null
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
        
        // Test the source first with timeout and retry
        try {
          const testResponse = await Promise.race([
            fetch(`http://localhost:8000/api/preview/test?source=${encodedSource}`),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 10000))
          ]) as Response;
          
          if (!testResponse.ok) {
            // If test endpoint fails, try connecting anyway (might be concurrent connection issue)
            console.warn('Preview test failed, attempting connection anyway:', testResponse.status);
          } else {
            const testResult = await testResponse.json();
            
            if (!testResult.accessible) {
              // Check if error is about concurrent connections (might still work for preview)
              const errorMsg = testResult.error || 'Cannot access video source';
              if (errorMsg.includes('connection failed') && errorMsg.includes('timeout')) {
                // Source might be in use, but preview stream might still work
                console.warn('Source test failed but attempting preview anyway:', errorMsg);
              } else {
                throw new Error(errorMsg);
              }
            }
          }
        } catch (error) {
          // If test fails but it's a timeout or connection issue, try preview anyway
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes('timeout') || errorMsg.includes('Connection refused')) {
            console.warn('Preview test timed out, attempting connection anyway');
            // Continue to try preview stream
          } else {
            throw error;
          }
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
    // Track drawing canvas size for later coordinate scaling
    if (!drawSize || drawSize.w !== canvas.width || drawSize.h !== canvas.height) {
      setDrawSize({ w: canvas.width, h: canvas.height });
    }

    // Compute content (letterboxed) box for object-contain media
    const mediaEl = canvas.parentElement?.querySelector('video, img') as HTMLVideoElement | HTMLImageElement | null;
    if (mediaEl) {
      const containerW = canvas.width;
      const containerH = canvas.height;
      const naturalW = (mediaEl as HTMLVideoElement).videoWidth || (mediaEl as HTMLImageElement).naturalWidth || containerW;
      const naturalH = (mediaEl as HTMLVideoElement).videoHeight || (mediaEl as HTMLImageElement).naturalHeight || containerH;
      const scale = Math.min(containerW / naturalW, containerH / naturalH);
      const displayW = naturalW * scale;
      const displayH = naturalH * scale;
      const offsetX = (containerW - displayW) / 2;
      const offsetY = (containerH - displayH) / 2;
      setContentBox({ displayW, displayH, offsetX, offsetY, naturalW, naturalH });
    }
    const rect = canvas.getBoundingClientRect();
    // Map display coordinates to intrinsic canvas coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Validate coordinates are within canvas bounds
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) {
      console.warn('Click outside canvas bounds:', x, y, 'Canvas:', canvas.width, 'x', canvas.height);
      return;
    }

    // Also store normalized coordinates relative to the content (letterboxed) box
    // so they map correctly back to the original frame dimensions
    let fx = 0;
    let fy = 0;
    if (contentBox && contentBox.displayW > 0 && contentBox.displayH > 0) {
      fx = (x - contentBox.offsetX) / contentBox.displayW;
      fy = (y - contentBox.offsetY) / contentBox.displayH;
    } else {
      // Fallback to canvas-relative normalization
      fx = canvas.width > 0 ? x / canvas.width : 0;
      fy = canvas.height > 0 ? y / canvas.height : 0;
    }
    // Clamp to [0,1] to avoid any numeric drift or clicks slightly outside
    fx = Math.max(0, Math.min(1, fx));
    fy = Math.max(0, Math.min(1, fy));
    
    console.log('=== CLICK COORDINATES DEBUG ===');
    console.log('Mouse position:', e.clientX, e.clientY);
    console.log('Canvas rect:', rect);
    console.log('Click coordinates:', x, y);
    console.log('Normalized coordinates:', fx, fy);
    console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
    console.log('Content box:', contentBox);
    console.log('================================');
    
    // Add visual feedback for debugging
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Clear previous debug markers
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Redraw all existing content manually
      drawnAreas.forEach(area => {
        if (area.type === 'zone' && area.isComplete) {
          // Convert normalized coords to pixel coords for display if needed
          const displayPoints = area.points.map((p: any) => {
            if (p.x !== undefined && p.y !== undefined) {
              return { x: p.x, y: p.y, fx: p.fx, fy: p.fy };
            } else if (p.fx !== undefined && p.fy !== undefined) {
              const pixel = normalizedToCanvas(p.fx, p.fy, canvas);
              return { x: pixel.x, y: pixel.y, fx: p.fx, fy: p.fy };
            }
            return p;
          });
          drawZone(ctx, displayPoints, '#10b981', 2);
        } else if (area.type === 'line' && area.isComplete) {
          // Convert normalized coords to pixel coords for display if needed
          const p1 = area.points[0];
          const p2 = area.points[1];
          const displayP1 = (p1.x !== undefined && p1.y !== undefined) 
            ? { x: p1.x, y: p1.y, fx: p1.fx, fy: p1.fy }
            : { x: normalizedToCanvas(p1.fx, p1.fy, canvas).x, y: normalizedToCanvas(p1.fx, p1.fy, canvas).y, fx: p1.fx, fy: p1.fy };
          const displayP2 = (p2.x !== undefined && p2.y !== undefined)
            ? { x: p2.x, y: p2.y, fx: p2.fx, fy: p2.fy }
            : { x: normalizedToCanvas(p2.fx, p2.fy, canvas).x, y: normalizedToCanvas(p2.fx, p2.fy, canvas).y, fx: p2.fx, fy: p2.fy };
          drawLine(ctx, displayP1, displayP2, '#ef4444', 2);
        }
      });
      
      // Draw current drawing
      if (currentDrawing) {
        if (currentDrawing.type === 'zone') {
          // Convert normalized coords to pixel coords for display if needed
          const displayPoints = currentDrawing.points.map((p: any) => {
            if (p.x !== undefined && p.y !== undefined) {
              return { x: p.x, y: p.y, fx: p.fx, fy: p.fy };
            } else if (p.fx !== undefined && p.fy !== undefined) {
              const pixel = normalizedToCanvas(p.fx, p.fy, canvas);
              return { x: pixel.x, y: pixel.y, fx: p.fx, fy: p.fy };
            }
            return p;
          });
          drawZone(ctx, displayPoints, '#3b82f6', 2, true);
        } else if (currentDrawing.type === 'line') {
          if (currentDrawing.points.length === 1) {
            // Show only the first point
            const p = currentDrawing.points[0];
            const displayP = (p.x !== undefined && p.y !== undefined)
              ? { x: p.x, y: p.y }
              : normalizedToCanvas(p.fx, p.fy, canvas);
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.arc(displayP.x, displayP.y, 4, 0, Math.PI * 2);
            ctx.fill();
          } else if (currentDrawing.points.length === 2) {
            // Show the line between two points
            const p1 = currentDrawing.points[0];
            const p2 = currentDrawing.points[1];
            const displayP1 = (p1.x !== undefined && p1.y !== undefined)
              ? { x: p1.x, y: p1.y, fx: p1.fx, fy: p1.fy }
              : { x: normalizedToCanvas(p1.fx, p1.fy, canvas).x, y: normalizedToCanvas(p1.fx, p1.fy, canvas).y, fx: p1.fx, fy: p1.fy };
            const displayP2 = (p2.x !== undefined && p2.y !== undefined)
              ? { x: p2.x, y: p2.y, fx: p2.fx, fy: p2.fy }
              : { x: normalizedToCanvas(p2.fx, p2.fy, canvas).x, y: normalizedToCanvas(p2.fx, p2.fy, canvas).y, fx: p2.fx, fy: p2.fy };
            drawLine(ctx, displayP1, displayP2, '#3b82f6', 3, true);
            // Show both points
            [displayP1, displayP2].forEach((point: any) => {
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
      ctx.fillText(`f(${fx.toFixed(3)}, ${fy.toFixed(3)})`, x + 8, y + 20);
      
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
      handleZoneClick(x, y, fx, fy);
    } else if (drawingMode === 'line') {
      handleLineClick(x, y, fx, fy);
    }
  };

  const handleZoneClick = (x: number, y: number, fx: number, fy: number) => {
    if (!currentDrawing) {
      // Start new zone
      setCurrentDrawing({
        id: Date.now(),
        type: 'zone',
        points: [{ x, y, fx, fy }],
        isComplete: false
      });
    } else {
      // If clicking near the first point, finish the zone (codedash_ai behavior)
      if (currentDrawing.type === 'zone' && currentDrawing.points.length >= 3) {
        const fx0 = currentDrawing.points[0].x;
        const fy0 = currentDrawing.points[0].y;
        if (Math.hypot(x - fx0, y - fy0) <= 20) {
          const completedZone = {
            ...currentDrawing,
            isComplete: true,
          };
          setDrawnAreas(prev => [...prev, completedZone]);
          setCurrentDrawing(null);
          return;
        }
      }
      // Add point to current zone
      const newPoints = [...currentDrawing.points, { x, y, fx, fy }];
      setCurrentDrawing({
        ...currentDrawing,
        points: newPoints
      });
    }
  };

  const handleLineClick = (x: number, y: number, fx: number, fy: number) => {
    console.log('Line click:', x, y, 'Normalized:', fx, fy, 'Current drawing:', currentDrawing);
    if (!currentDrawing) {
      // Start new line with first point
      console.log('Starting new line');
      setCurrentDrawing({
        id: Date.now(),
        type: 'line',
        points: [{ x, y, fx, fy }],
        isComplete: false
      });
    } else if (currentDrawing.points.length === 1) {
      // Complete the line with second point
      console.log('Completing line');
      const newPoints = [...currentDrawing.points, { x, y, fx, fy }];
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
        className="bg-white text-slate-900 rounded-xl shadow-xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col mx-4 my-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50">
          <h2 className="text-xl font-semibold text-slate-900">{t('camera_config')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
          {/* Left Panel - Configuration */}
          <div className="w-full lg:w-1/3 p-6 overflow-y-auto border-b lg:border-b-0 lg:border-r border-slate-200 flex-shrink-0 max-h-96 lg:max-h-none">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Camera Name */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t('camera_name')} *
                </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={t('camera_name')}
                required
              />
            </div>

              {/* Source Type */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t('source_type')}
                </label>
                <select
                  value={formData.sourceType}
                  onChange={(e) => setFormData({...formData, sourceType: e.target.value})}
                  className="input w-full"
                >
                  <option value="video_file">{t('video_file')}</option>
                  <option value="rtsp">RTSP Stream</option>
                  <option value="webcam">Webcam</option>
                </select>
              </div>

              {/* Source Input */}
              {formData.sourceType === 'video_file' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t('video_file')}
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
                      {t('choose_file')}
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
                    {formData.sourceType === 'rtsp' ? t('rtsp_url') : t('webcam_id')}
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
                    {isPreviewConnected ? t('disconnect_preview') : t('connect_preview')}
                  </>
                )}
              </button>

              {/* Preview Error */}
              {previewError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">
                    <strong>{t('preview_error')}:</strong> {previewError}
                  </p>
                </div>
              )}

                     {/* Task Type */}
            <div>
                         <label className="block text-sm font-medium text-slate-700 mb-2">
                           {t('task_type')}
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
                           {t('zone')}
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
                           {t('line')}
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
                               {t('stop_drawing')}
                             </button>
            </div>

                           {/* Current Drawing Status */}
                           {currentDrawing && (
                           <div className="p-3 bg-blue-50 rounded-lg">
                               <p className="text-sm text-blue-800">
                               <strong>{t('drawing_mode')} {currentDrawing.type}:</strong> 
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
                                     {t('finish_zone')}
                                   </button>
                                 )}
                                 <button
                                   type="button"
                                   onClick={cancelCurrentDrawing}
                                   className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                                 >
                                   {t('cancel')}
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
          <div className="w-full lg:w-2/3 p-6 flex flex-col min-h-0 flex-1">
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
            <div className="relative w-full h-[72vh] min-h-[480px] bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center">
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
              {t('cancel')}
            </button>
            <button
            onClick={handleSubmit}
              disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? 'Saving...' : t('save')}
            </button>
          </div>
      </motion.div>
    </div>
  );
};

export default function CamerasPage() {
  const { t } = useI18n();
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
      toast.error(t('failed_load_cameras'));
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

      // Optimistically add as active while backend starts the worker
      setCameras(prev => [...prev, { ...created, is_active: true }]);
      toast('Starting camera...', { icon: '⏳' });

      // Auto-start camera immediately after creation (requested behavior)
      try {
        await cameraApi.startCamera(created.id);
      } catch (e) {
        console.warn('Start camera after create failed (will retry on refresh):', e);
      }

      // Briefly wait and poll stats to reduce "offline" flicker
      const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
      const maxAttempts = 20; // up to ~10s
      for (let i = 0; i < maxAttempts; i++) {
        try {
          // if stats endpoint exists, use it to check running; ignore failure
          const stats = await cameraApi.getCameraStats(created.id);
          if (stats && stats.running) break;
        } catch (_) {}
        await wait(500);
      }

      // Persist zones/lines to backend tasks using normalized coordinates
      try {
        const taskType: 'zone' | 'line' | 'both' =
          zones.length > 0 && lines.length > 0 ? 'both' : zones.length > 0 ? 'zone' : lines.length > 0 ? 'line' : 'zone';
        
        // Prefer frame dimensions from preview contentBox (most accurate), fallback to backend fetch
        const frameSize = (() => {
          // Use contentBox natural dimensions if available (from preview media element)
          if (cameraData.contentBox && cameraData.contentBox.naturalW > 0 && cameraData.contentBox.naturalH > 0) {
            console.log('Using preview contentBox dimensions:', cameraData.contentBox.naturalW, 'x', cameraData.contentBox.naturalH);
            return { w: cameraData.contentBox.naturalW, h: cameraData.contentBox.naturalH };
          }
          
          // Fallback to backend fetch
          console.log('ContentBox not available, will fetch from backend');
          return null;
        })();
        
        // If we don't have contentBox dimensions, fetch from backend
        const finalFrameSize = frameSize || await (async () => {
          const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
          const url = `${base}/api/cameras/${created.id}/frame?overlay=false&_=${Date.now()}`;
          
          // Retry up to 3 times with delay
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const result = await new Promise<{ w: number; h: number }>((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                  const w = img.naturalWidth || img.width;
                  const h = img.naturalHeight || img.height;
                  console.log(`Frame image loaded (attempt ${attempt}):`, w, 'x', h);
                  if (w > 0 && h > 0) {
                    resolve({ w, h });
                  } else {
                    reject(new Error('Invalid frame dimensions'));
                  }
                };
                img.onerror = () => {
                  reject(new Error('Failed to load frame image'));
                };
                img.src = url;
              });
              
              if (result.w > 0 && result.h > 0) {
                return result;
              }
    } catch (error) {
              console.warn(`Frame load attempt ${attempt} failed:`, error);
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
              }
            }
          }
          
          console.warn('All frame load attempts failed, using fallback dimensions');
          return { w: 1920, h: 1080 }; // Fallback to common resolution
        })();
        
        const frameW = finalFrameSize.w;
        const frameH = finalFrameSize.h;
        
        console.log('Frame dimensions for coordinate conversion:', frameW, 'x', frameH);
        console.log('Original zones with normalized coords:', zones);
        
        // Backend schemas require integer pixels; convert from normalized to frame pixels
        const scaledZones = zones.map((z: any) => ({
          name: z.name,
          polygon: z.points.map((p: any) => [
            Math.round((p.fx || 0) * frameW),
            Math.round((p.fy || 0) * frameH)
          ]),
          is_active: true,
          camera_id: created.id,
        }));
        
        const scaledLines = lines.map((l: any) => ({
          name: l.name,
          p1: [
            Math.round((l.points[0].fx || 0) * frameW),
            Math.round((l.points[0].fy || 0) * frameH)
          ],
          p2: [
            Math.round((l.points[1].fx || 0) * frameW),
            Math.round((l.points[1].fy || 0) * frameH)
          ],
          is_active: true,
          camera_id: created.id,
        }));
        
        console.log('Converted zones:', scaledZones);
        console.log('Converted lines:', scaledLines);

        if (scaledZones.length > 0 || scaledLines.length > 0) {
          await tasksApi.setCameraTasks(created.id, {
            task_type: taskType,
            zones: scaledZones,
            lines: scaledLines,
          });
        }
      } catch (e) {
        console.warn('Failed to save tasks (zones/lines):', e);
      }

      // Refresh list from backend to reflect final state
      await loadCameras();
      toast.success('Camera added, tasks saved and started');
    } catch (error) {
      console.error('Error in handleAddCamera:', error);
      throw error;
    }
  };

  const handleToggleCamera = async (id: string, isActive: boolean) => {
    try {
      // Invert current state on click: if active -> stop; if inactive -> start
      if (isActive) {
        await cameraApi.stopCamera(id);
        toast.success(t('camera_stopped'));
      } else {
        await cameraApi.startCamera(id);
        toast.success(t('camera_started'));
      }
      // Refresh list to reflect real backend state
      await loadCameras();
    } catch (error) {
      console.error('Failed to toggle camera', error);
      toast.error(t('failed_toggle_camera'));
    }
  };

  const handleDeleteCamera = async (id: string) => {
    if (confirm('Are you sure you want to delete this camera?')) {
      try {
        await cameraApi.deleteCamera(id);
        await loadCameras();
        toast.success(t('camera_deleted'));
      } catch (error) {
        toast.error(t('camera_failed_delete'));
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
      <div className="space-y-6 text-slate-100">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{t('cameras_title')}</h1>
          <p className="text-slate-300 mt-1">{t('cameras_sub')}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary btn-md mt-4 sm:mt-0"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('add_camera')}
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
