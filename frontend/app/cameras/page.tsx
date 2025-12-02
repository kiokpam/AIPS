'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Brain,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity
} from 'lucide-react';
import { cameraApi, storeApi, eventsApi, type Camera as CameraType } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/src/contexts/I18nContext';
import toast from 'react-hot-toast';

// Simple drawing canvas component used for overlaying zones/lines on top of the preview image.
// This is intentionally kept local to this page so that the AI/drawing logic can evolve
// without affecting the rest of the app structure.
type DrawingCanvasProps = React.CanvasHTMLAttributes<HTMLCanvasElement> & {
  drawnAreas: any[];
  currentDrawing: any;
  drawingMode: 'zone' | 'line' | null;
  drawZone: (ctx: CanvasRenderingContext2D, points: any[], color: string, lineWidth: number, isDraft?: boolean) => void;
  drawLine: (ctx: CanvasRenderingContext2D, p1: any, p2: any, color: string, lineWidth: number, isDraft?: boolean) => void;
};

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  drawnAreas,
  currentDrawing,
  drawingMode,
  drawZone,
  drawLine,
  ...rest
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawZoneRef = useRef(drawZone);
  const drawLineRef = useRef(drawLine);

  // Update refs when functions change (but don't trigger re-render)
  useEffect(() => {
    drawZoneRef.current = drawZone;
    drawLineRef.current = drawLine;
  }, [drawZone, drawLine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use requestAnimationFrame to batch redraws and prevent excessive renders
    const rafId = requestAnimationFrame(() => {
      // Clear previous drawings
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Helper to normalize width/height from CSS to canvas pixels
      const rect = canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      // Redraw saved areas
      drawnAreas.forEach((area) => {
        if (area.type === 'zone' && area.isComplete) {
          drawZoneRef.current(ctx, area.points, '#10b981', 2);
        } else if (area.type === 'line' && area.isComplete) {
          drawLineRef.current(ctx, area.p1, area.p2, '#3b82f6', 3);
        }
      });

      // Draw current draft
      if (currentDrawing) {
        if (currentDrawing.type === 'zone') {
          drawZoneRef.current(ctx, currentDrawing.points || [], '#3b82f6', 2, true);
        } else if (currentDrawing.type === 'line') {
          drawLineRef.current(ctx, currentDrawing.p1, currentDrawing.p2, '#3b82f6', 3, true);
        }
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [drawnAreas, currentDrawing, drawingMode]); // Removed drawZone and drawLine from dependencies

  return <canvas ref={canvasRef} {...rest} />;
};

// Temporary placeholder APIs for AI-related services.
// These do NOT call any real backend AI services and are meant only
// to keep the UI compiling and working until AI microservices are integrated.
const inOutApi: any = {
  // Return zeroed counts for now
  getCounts: async (_cameraId: string) => ({
    count_in: 0,
    count_out: 0,
    cumulative: 0,
  }),
  // Return empty "today" stats
  getTodayStats: async (_cameraId: string) => ({
    count_in_today: 0,
    count_out_today: 0,
  }),
  // Registration / reset / unregister are no-ops for now
  registerCamera: async (_cameraId: string) => {
    return;
  },
  resetCounts: async (_cameraId: string) => {
    return;
  },
  unregisterCamera: async (_cameraId: string) => {
    return;
  },
};

const tasksApi: any = {
  // Return empty task config so the overlay logic can run without errors
  getCameraTaskConfig: async (_cameraId: string) => ({
    zones: [],
    lines: [],
  }),
  // No-op setters so camera creation flow can complete
  setCameraTasks: async (_cameraId: string, _payload: any) => {
    return;
  },
  clearCameraTasks: async (_cameraId: string) => {
    return;
  },
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
  // Model configuration removed - AI services will handle all model settings
  const [taskInfo, setTaskInfo] = useState<{ zones: any[]; lines: any[] } | null>(null);
  const [saving, setSaving] = useState(false);
  
  // In/Out counting state
  const hasInOutCounting = camera.ai_services?.includes('in_out_counting') || false;
  const [inOutCounts, setInOutCounts] = useState<{ count_in: number; count_out: number; cumulative: number } | null>(null);
  const [isInOutRegistered, setIsInOutRegistered] = useState(false);
  const [isRegisteringInOut, setIsRegisteringInOut] = useState(false);
  
  // Today's stats and behaviors
  const [todayStats, setTodayStats] = useState<{ count_in_today: number; count_out_today: number } | null>(null);
  const [recentBehaviors, setRecentBehaviors] = useState<Array<{ type: string; severity: string; timestamp: string }>>([]);
  const router = useRouter();

  // Client-side overlay fallback: draw zones over MJPEG <img>
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  const [streamNonce, setStreamNonce] = useState<number>(Date.now());

  // When backend reports active, automatically try to show the stream
  useEffect(() => {
    if (camera.is_active) {
      setIsStreaming(true);
      // Check if camera is actually running via stats
      cameraApi.getCameraStats(camera.id)
        .then(stats => {
          if (stats && stats.running) {
            setIsStarting(false); // Camera is running, not just starting
          } else {
            setIsStarting(true); // Camera is starting but not running yet
          }
        })
        .catch(() => {
          setIsStarting(true); // Assume starting if stats unavailable
        });
    } else {
      setIsStarting(false);
      setIsStreaming(false);
    }
  }, [camera.is_active, camera.id]);
  
  // Periodically check if camera has finished starting
  useEffect(() => {
    if (!isStarting || !camera.is_active) return;
    
    const checkInterval = setInterval(async () => {
      try {
        const stats = await cameraApi.getCameraStats(camera.id);
        if (stats && stats.running && stats.frame_count > 0) {
          setIsStarting(false); // Camera is now running
          clearInterval(checkInterval);
        }
      } catch (_) {
        // Stats not available yet, keep checking
      }
    }, 2000); // Check every 2 seconds
    
    // Stop checking after 30 seconds
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      setIsStarting(false); // Give up, assume it's running or failed
    }, 30000);
    
    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, [isStarting, camera.is_active, camera.id]);

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
        // Frame size detected from image element
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
          // Frame size detected from stats API
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
    
    // Redraw when taskInfo, frameSize, or streaming state changes

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

      /**
       * Map pixel coordinates (relative to frame) to overlay canvas coordinates
       * Backend stores coordinates as pixels [x, y] relative to frame size
       */
      const mapPoint = (p: number[]): [number, number] => {
        // Backend always stores pixel coordinates [x, y] relative to frame size
        // We need to scale and offset them to fit the overlay canvas
        const frameX = p[0]; // Pixel X in frame coordinates
        const frameY = p[1]; // Pixel Y in frame coordinates
        
        // Scale pixel coordinates to overlay canvas
        const canvasX = offsetX + frameX * scale;
        const canvasY = offsetY + frameY * scale;
        
        return [canvasX, canvasY];
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
      (taskInfo.lines || []).forEach((line: any) => {
        if (line.p1 && line.p2 && Array.isArray(line.p1) && Array.isArray(line.p2)) {
          // Backend stores lines as pixel coordinates [x, y]
          const p1 = mapPoint(line.p1);
          const p2 = mapPoint(line.p2);
          const isIn = line.name?.toLowerCase().includes('in');
          ctx.strokeStyle = isIn ? '#22c55e' : '#3b82f6';
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(p1[0], p1[1]);
          ctx.lineTo(p2[0], p2[1]);
          ctx.stroke();
          // Draw endpoints
          ctx.fillStyle = isIn ? '#22c55e' : '#3b82f6';
          ctx.beginPath();
          ctx.arc(p1[0], p1[1], 6, 0, 2 * Math.PI);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p2[0], p2[1], 6, 0, 2 * Math.PI);
          ctx.fill();
          // Draw label
          if (line.name) {
            ctx.fillStyle = isIn ? '#22c55e' : '#3b82f6';
            ctx.font = '14px sans-serif';
            ctx.fillText(String(line.name), (p1[0] + p2[0]) / 2 + 4, (p1[1] + p2[1]) / 2 + 16);
          }
        }
      });
    };

    // Throttle resize events to prevent excessive redraws
    let rafId: number | null = null;
    const throttledResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        resizeAndDraw();
        rafId = null;
      });
    };

    resizeAndDraw();
    window.addEventListener('resize', throttledResize);
    const ro = new ResizeObserver(throttledResize);
    ro.observe(container);
    
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', throttledResize);
      ro.disconnect();
    };
  }, [taskInfo, frameSize, isStreaming]);

  const handleStreamToggle = () => {
    setIsStreaming(!isStreaming);
    toast.success(isStreaming ? t('camera_stopped') : t('camera_started'));
  };

  // Poll camera stats to get current people count
  useEffect(() => {
    let isMounted = true;
    let timer: NodeJS.Timeout | null = null;

    const fetchStats = async () => {
      if (!isMounted) return; // Don't run if unmounted
      
      try {
        const stats = await cameraApi.getCameraStats(camera.id);
        const count = stats?.stats?.current_count ?? stats?.current_count ?? null;
        if (isMounted) setCurrentCount(typeof count === 'number' ? count : null);
      } catch (_) {
        if (isMounted) setCurrentCount(null);
      }
      
      // Schedule next fetch only if still mounted
      if (isMounted) {
        timer = setTimeout(fetchStats, 5000);
      }
    };

    fetchStats();
    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [camera.id]);

  // Poll in/out counts if camera has in_out_counting enabled
  useEffect(() => {
    if (!hasInOutCounting) return;
    
    let isMounted = true;
    let timer: any;

    const checkRegistration = async () => {
      try {
        const counts = await inOutApi.getCounts(camera.id);
        if (isMounted) {
          setInOutCounts({
            count_in: counts.count_in,
            count_out: counts.count_out,
            cumulative: counts.cumulative
          });
          setIsInOutRegistered(true);
        }
      } catch (error: any) {
        if (isMounted) {
          if (error.response?.status === 404) {
            setIsInOutRegistered(false);
          }
          setInOutCounts(null);
        }
      }
    };

    const fetchCounts = async () => {
      if (!isMounted) return; // Don't run if unmounted
      
      try {
        const counts = await inOutApi.getCounts(camera.id);
        if (isMounted) {
          setInOutCounts({
            count_in: counts.count_in,
            count_out: counts.count_out,
            cumulative: counts.cumulative
          });
        }
      } catch (_) {
        // Ignore errors, will retry
      }
      
      // Schedule next fetch only if still mounted
      if (isMounted) {
        timer = setTimeout(fetchCounts, 5000);
      }
    };

    // First check if registered
    checkRegistration().then(() => {
      if (isMounted && isInOutRegistered) {
        fetchCounts();
      }
    });

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [camera.id, hasInOutCounting]); // Removed isInOutRegistered from dependencies to prevent loop

  // Fetch today's stats and recent behaviors
  useEffect(() => {
    let isMounted = true;
    
    const fetchStats = async () => {
      try {
        // Fetch today's in/out stats if camera has in_out_counting
        if (hasInOutCounting) {
          const stats = await inOutApi.getTodayStats(camera.id);
          if (isMounted) setTodayStats(stats);
        }
        
        // Fetch recent behaviors if camera has behavior_detection
        if (camera.ai_services?.includes('behavior_detection')) {
          const behaviors = await eventsApi.getCameraRecentBehaviors(camera.id, 3);
          if (isMounted) setRecentBehaviors(behaviors);
        }
      } catch (error) {
        // Silently fail - stats are optional
        console.warn('Failed to fetch camera stats:', error);
      }
    };

    fetchStats();
    // Refresh every 30 seconds
    const timer = setInterval(fetchStats, 30000);
    
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [camera.id, hasInOutCounting, camera.ai_services]);

  // Load AI details when modal opens
  useEffect(() => {
    if (!showAIDetails) return;
    let mounted = true;
    (async () => {
      try {
        const cfg = await cameraApi.getCameraConfig(camera.id);
        // Model configuration removed - AI services will handle all model settings
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
        if (mounted) {
          const newTaskInfo = { zones: tasks?.zones || [], lines: tasks?.lines || [] };
          // Task info loaded
          setTaskInfo(newTaskInfo);
        }
      } catch (e) {
        console.warn('Failed to load task config:', e);
      }
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
          {hasInOutCounting && inOutCounts && (
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-white bg-green-600/70 px-2 py-1 rounded">
                IN: {inOutCounts.count_in}
              </span>
              <span className="text-xs text-white bg-blue-600/70 px-2 py-1 rounded">
                OUT: {inOutCounts.count_out}
              </span>
              <span className="text-xs text-white bg-purple-600/70 px-2 py-1 rounded">
                Net: {inOutCounts.cumulative}
              </span>
            </div>
          )}
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
                {hasInOutCounting && (
                  <>
                    {!isInOutRegistered ? (
                      <button
                        onClick={async () => {
                          try {
                            setIsRegisteringInOut(true);
                            await inOutApi.registerCamera(camera.id);
                            setIsInOutRegistered(true);
                            toast.success('Camera registered for in/out counting');
                            setShowMenu(false);
                          } catch (error: any) {
                            toast.error(error.response?.data?.detail || 'Failed to register camera');
                          } finally {
                            setIsRegisteringInOut(false);
                          }
                        }}
                        disabled={isRegisteringInOut}
                        className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                      >
                        <TrendingUp className="w-4 h-4 mr-3" />
                        {isRegisteringInOut ? 'Registering...' : 'Enable In/Out Counting'}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={async () => {
                            try {
                              await inOutApi.resetCounts(camera.id);
                              toast.success('Counts reset');
                              setShowMenu(false);
                            } catch (error: any) {
                              toast.error(error.response?.data?.detail || 'Failed to reset counts');
                            }
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Undo className="w-4 h-4 mr-3" />
                          Reset Counts
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await inOutApi.unregisterCamera(camera.id);
                              setIsInOutRegistered(false);
                              setInOutCounts(null);
                              toast.success('Camera unregistered from in/out counting');
                              setShowMenu(false);
                            } catch (error: any) {
                              toast.error(error.response?.data?.detail || 'Failed to unregister camera');
                            }
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <X className="w-4 h-4 mr-3" />
                          Disable In/Out Counting
                        </button>
                      </>
                    )}
                  </>
                )}
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
            <span>AI Services:</span>
            <span className="font-medium">{camera.ai_services.length}</span>
          </div>
        </div>

        {/* Today's Stats Summary */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="space-y-3">
            {/* Today's In/Out Counts */}
            {hasInOutCounting && (
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-700">Today's Counts</span>
                  <Clock className="w-3 h-3 text-slate-400" />
                </div>
                {todayStats ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-600">{todayStats.count_in_today}</div>
                      <div className="text-xs text-slate-500">IN</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600">{todayStats.count_out_today}</div>
                      <div className="text-xs text-slate-500">OUT</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 text-center py-1">No data today</div>
                )}
              </div>
            )}

            {/* Recent Behaviors */}
            {camera.ai_services?.includes('behavior_detection') && (
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-700">Recent Behaviors</span>
                  <Activity className="w-3 h-3 text-slate-400" />
                </div>
                {recentBehaviors.length > 0 ? (
                  <div className="space-y-1">
                    {recentBehaviors.slice(0, 3).map((behavior, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 capitalize truncate flex-1">{behavior.type}</span>
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                          behavior.severity === 'high' ? 'bg-red-100 text-red-700' :
                          behavior.severity === 'medium' ? 'bg-orange-100 text-orange-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {behavior.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 text-center py-1">No behaviors detected</div>
                )}
              </div>
            )}

            {/* View Details Button - Always show if camera has any AI services */}
            {(hasInOutCounting || camera.ai_services?.includes('behavior_detection')) && (
              <button
                onClick={() => router.push('/dashboard/in-out')}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <BarChart3 className="w-3 h-3" />
                View Dashboard
              </button>
            )}
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
              {/* Model configuration removed - AI services will handle all model settings */}
              <div className="mt-6 grid md:grid-cols-2 gap-6">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="text-sm text-slate-500 mb-2">{t('people_count')}</div>
                  <div className="text-3xl font-bold text-slate-900">{currentCount ?? '—'}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="text-sm text-slate-500 mb-2">{t('zones')}</div>
                  <div className="text-slate-900">{taskInfo?.zones?.length ?? 0}</div>
                </div>
              </div>
              {hasInOutCounting && inOutCounts && (
                <div className="mt-4 grid md:grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="text-sm text-green-600 mb-2 flex items-center">
                      <TrendingUp className="w-4 h-4 mr-1" />
                      Count In
                    </div>
                    <div className="text-2xl font-bold text-green-900">{inOutCounts.count_in}</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-sm text-blue-600 mb-2 flex items-center">
                      <TrendingDown className="w-4 h-4 mr-1" />
                      Count Out
                    </div>
                    <div className="text-2xl font-bold text-blue-900">{inOutCounts.count_out}</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <div className="text-sm text-purple-600 mb-2">Net (Inside)</div>
                    <div className="text-2xl font-bold text-purple-900">{inOutCounts.cumulative}</div>
                  </div>
                </div>
              )}
              <div className="mt-4 grid md:grid-cols-2 gap-6 max-h-48 overflow-auto">
                <div>
                  <div className="text-sm font-medium text-slate-700 mb-2">{t('zones')}</div>
                  <ul className="text-sm text-slate-600 space-y-1">
                    {(taskInfo?.zones || []).map((z: any) => (
                      <li key={z.id} className="truncate">{z.name || z.id}</li>
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
                      // Model configuration removed - AI services will handle all model settings
                      await cameraApi.updateCameraConfig(camera.id, {});
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
    source: '', // RTSP URL only
    // Model configuration removed - AI services will handle all model settings
    skip_frame: 3,
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

  // Drawing functions - memoized to prevent re-renders
  const drawZone = useCallback((ctx: CanvasRenderingContext2D, points: any[], color: string, lineWidth: number, isDraft = false) => {
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
  }, []);

  const drawLine = useCallback((ctx: CanvasRenderingContext2D, p1: any, p2: any, color: string, lineWidth: number, isDraft = false) => {
    if (!p1 || !p2) return;

    // Convert coordinates if needed
    const point1 = (p1.x !== undefined && p1.y !== undefined)
      ? { x: p1.x, y: p1.y }
      : normalizedToCanvas(p1.fx || 0, p1.fy || 0, ctx.canvas);
    
    const point2 = (p2.x !== undefined && p2.y !== undefined)
      ? { x: p2.x, y: p2.y }
      : normalizedToCanvas(p2.fx || 0, p2.fy || 0, ctx.canvas);

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(isDraft ? [5, 5] : []);
    ctx.beginPath();
    ctx.moveTo(point1.x, point1.y);
    ctx.lineTo(point2.x, point2.y);
    ctx.stroke();

    // Draw endpoints
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point1.x, point1.y, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(point2.x, point2.y, 6, 0, 2 * Math.PI);
    ctx.fill();
  }, []);


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
        toast.error('Please enter an RTSP URL');
        return;
      }

      // Convert drawn areas to backend format using normalized coordinates
      const zones = drawnAreas
        .filter(area => area.type === 'zone' && area.isComplete)
        .map((area, index) => ({
          id: `zone_${index + 1}`,
          name: `Zone ${index + 1}`,
          points: area.points.map((p: any) => ({ x: p.x, y: p.y, fx: p.fx, fy: p.fy }))
        }));

      // Convert drawn lines to backend format - preserve normalized coordinates
      const lines = drawnAreas
        .filter(area => area.type === 'line' && area.isComplete)
        .map((area, index) => {
          // Determine if it's IN or OUT line based on name or order
          const isIn = area.name?.toLowerCase().includes('in') || index === 0;
          return {
            id: `line_${index + 1}`,
            name: isIn ? 'IN' : 'OUT',
            p1: { fx: area.p1.fx, fy: area.p1.fy }, // Store normalized coordinates
            p2: { fx: area.p2.fx, fy: area.p2.fy }  // Store normalized coordinates
          };
        });

      const cameraData = {
        name: formData.name.trim(),
        source: formData.source.trim(), // RTSP URL only
        // Model configuration removed - AI services will handle all model settings
        skip_frame: formData.skip_frame,
        allowMultipleAreas: formData.allowMultipleAreas,
        zones,
        lines,
        canvasSize: drawSize ? { w: drawSize.w, h: drawSize.h } : null,
        contentBox: contentBox ? { ...contentBox } : null
      };

      // Submitting camera data
      
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
        source: '', // RTSP URL only
        // Model configuration removed - AI services will handle all model settings
        skip_frame: 3,
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
      toast.error('Please enter an RTSP URL');
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError('');

    try {
      // Get API base URL and auth token
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const baseUrl = apiBaseUrl.endsWith('/api') ? apiBaseUrl : `${apiBaseUrl.replace(/\/+$/, '')}/api`;
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        throw new Error('Authentication required. Please log in again.');
      }

      // Use backend preview endpoint for RTSP
      const encodedSource = encodeURIComponent(formData.source);
      const sourceUrl = `${baseUrl}/preview/stream?source=${encodedSource}&token=${encodeURIComponent(token)}`;
      
      // Test the source first with timeout and retry
      try {
        const testUrl = `${baseUrl}/preview/test?source=${encodedSource}&token=${encodeURIComponent(token)}`;
        const testResponse = await Promise.race([
          fetch(testUrl, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }),
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
      // Click outside canvas bounds - ignored
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
    
    // Removed debug console.log and manual canvas redraw - DrawingCanvas will handle redraw via useEffect
    
    if (drawingMode === 'zone') {
      handleZoneClick(x, y, fx, fy);
    } else if (drawingMode === 'line') {
      handleLineClick(x, y, fx, fy);
    }
  };

  const handleLineClick = (x: number, y: number, fx: number, fy: number) => {
    if (!currentDrawing) {
      // Start new line - first point
      setCurrentDrawing({
        id: Date.now(),
        type: 'line',
        p1: { x, y, fx, fy },
        p2: null,
        isComplete: false
      });
    } else if (currentDrawing.type === 'line' && !currentDrawing.p2) {
      // Complete the line - second point
      const completedLine = {
        ...currentDrawing,
        p2: { x, y, fx, fy },
        isComplete: true,
        name: `Line ${drawnAreas.filter(a => a.type === 'line').length + 1}`
      };
      setDrawnAreas(prev => [...prev, completedLine]);
      setCurrentDrawing(null);
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

              {/* RTSP Source Input */}
            <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    RTSP URL *
                  </label>
              <input
                type="text"
                value={formData.source}
                onChange={(e) => setFormData({...formData, source: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="rtsp://..."
                required
              />
            </div>

              {/* Connect Preview Button */}
              <button
                type="button"
                onClick={handleConnectPreview}
                disabled={isLoadingPreview || !formData.source}
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
                                   ? 'bg-blue-600 text-white'
                                   : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                               }`}
                             >
                               Draw Line (IN/OUT)
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
                                   : currentDrawing.type === 'line'
                                   ? ` Click ${currentDrawing.p2 ? 'to finish' : 'second point'}`
                                   : ''
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
                  <img
                    src={previewUrl}
                    alt="RTSP Stream"
                    className="w-full h-full object-contain bg-black rounded border"
                    style={{ pointerEvents: 'none' }}
                    onError={(e) => {
                      console.error('Stream error:', e);
                      setPreviewError('Failed to load RTSP stream');
                      setIsPreviewConnected(false);
                    }}
                  />
                  
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
                      Drawing Mode: Zone
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
                  {formData.source && (
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
                  <li>• Use "Draw Zone" button to start drawing</li>
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
      // Extract zones and lines for future config API (optional)
      const { zones, lines, ...cameraConfig } = cameraData;

      // Build backend payload according to CameraCreate
      // Ensure a store exists; create a default one if backend has none
      let storeId: string | null = null;
      try {
        const stores = await storeApi.getStores();
        if (stores && stores.length > 0) {
          storeId = stores[0].id;
        } else {
          const createdStore = await storeApi.createStore('Default Store');
          storeId = createdStore.id;
        }
      } catch (e) {
        console.error('Store lookup/creation failed:', e);
        toast.error('Failed to get or create a store. Please create a store first in the Managers page.');
        throw new Error('No store available. Please create a store first.');
      }
      
      if (!storeId) {
        toast.error('No store available. Please create a store first.');
        throw new Error('No store available');
      }

      // Auto-add in_out_counting if lines are drawn
      const hasLines = lines && lines.length >= 2;
      const aiServices = ['people_counting', 'behavior_detection'];
      if (hasLines) {
        aiServices.push('in_out_counting');
      }

      const payload = {
        store_id: storeId,
        name: cameraConfig.name,
        source: cameraConfig.source, // RTSP URL only
        ai_services: aiServices,
        // Model configuration removed - AI services will handle all model settings
        skip_frame: cameraConfig.skip_frame || 3
      };

      // Creating camera via API
      const created = await cameraApi.createCamera(payload);

      // Optimistically add as active while backend starts the worker
      setCameras(prev => [...prev, { ...created, is_active: true }]);
      toast('Starting camera...', { icon: '⏳' });

      // Auto-start camera immediately after creation (requested behavior)
      try {
        await cameraApi.startCamera(created.id);
      } catch (e) {
        // Start camera after create failed (will retry on refresh)
      }

      // Briefly wait and poll stats to reduce "offline" flicker
      const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
      const maxAttempts = 20; // up to ~10s
      let cameraRunning = false;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          // if stats endpoint exists, use it to check running; ignore failure
          const stats = await cameraApi.getCameraStats(created.id);
          if (stats && stats.running) {
            cameraRunning = true;
            break;
          }
        } catch (_) {}
        await wait(500);
      }
      
      // Update camera status based on actual running state
      if (cameraRunning) {
        setCameras(prev => prev.map(c => 
          c.id === created.id ? { ...c, is_active: true } : c
        ));
        toast.success('Camera started successfully');
      } else {
        setCameras(prev => prev.map(c => 
          c.id === created.id ? { ...c, is_active: false } : c
        ));
        toast.error('Camera created but failed to start. Check RTSP stream accessibility.', { duration: 5000 });
      }

      // Persist zones to backend tasks using normalized coordinates
      try {
        // Prefer frame dimensions from preview contentBox (most accurate), fallback to backend fetch
        const frameSize = (() => {
          // Use contentBox natural dimensions if available (from preview media element)
          if (cameraData.contentBox && cameraData.contentBox.naturalW > 0 && cameraData.contentBox.naturalH > 0) {
            // Using preview contentBox dimensions
            return { w: cameraData.contentBox.naturalW, h: cameraData.contentBox.naturalH };
          }
          
          // Fallback to backend fetch
          // ContentBox not available, will fetch from backend
          return null;
        })();
        
        // If we don't have contentBox dimensions, fetch from backend
        const finalFrameSize = frameSize || await (async () => {
          // First, verify camera is running and has frames
          let cameraReady = false;
          for (let check = 0; check < 5; check++) {
            try {
              const stats = await cameraApi.getCameraStats(created.id);
              if (stats && stats.running && stats.frame_count > 0) {
                cameraReady = true;
                break;
              }
            } catch (_) {
              // Camera not ready yet
            }
            if (!cameraReady) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between checks
            }
          }
          
          if (!cameraReady) {
            // Camera not ready for frame fetch, using fallback dimensions
            return { w: 1920, h: 1080 }; // Fallback to common resolution
          }
          
          const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
          const baseUrl = base.endsWith('/api') ? base : `${base.replace(/\/+$/, '')}/api`;
          const token = localStorage.getItem('auth_token');
          
          // Retry up to 3 times with delay
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const url = `${baseUrl}/cameras/${created.id}/frame?overlay=false&token=${encodeURIComponent(token || '')}&_=${Date.now()}`;
              const result = await new Promise<{ w: number; h: number }>((resolve, reject) => {
                const img = new Image();
                const timeout = setTimeout(() => {
                  reject(new Error('Frame load timeout'));
                }, 5000); // 5 second timeout
                
                img.onload = () => {
                  clearTimeout(timeout);
                  const w = img.naturalWidth || img.width;
                  const h = img.naturalHeight || img.height;
                  if (w > 0 && h > 0) {
                    console.log(`Frame image loaded (attempt ${attempt}):`, w, 'x', h);
                    resolve({ w, h });
                  } else {
                    reject(new Error('Invalid frame dimensions'));
                  }
                };
                img.onerror = () => {
                  clearTimeout(timeout);
                  reject(new Error('Failed to load frame image'));
                };
                img.src = url;
              });
              
              if (result.w > 0 && result.h > 0) {
                return result;
              }
            } catch (error) {
              // Only log on last attempt to reduce console noise
              if (attempt === 3) {
                console.debug(`Frame load failed after ${attempt} attempts, using fallback dimensions`);
              }
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds between retries
              }
            }
          }
          
          return { w: 1920, h: 1080 }; // Fallback to common resolution
        })();
        
        const frameW = finalFrameSize.w;
        const frameH = finalFrameSize.h;
        
        // Backend schemas require integer pixels; convert from normalized to frame pixels
        const scaledZones = zones.map((z: any) => ({
          name: z.name,
          polygon: z.points.map((p: any) => {
            // Ensure we have normalized coordinates
            const fx = p.fx ?? 0;
            const fy = p.fy ?? 0;
            return [
              Math.round(Math.max(0, Math.min(1, fx)) * frameW),
              Math.round(Math.max(0, Math.min(1, fy)) * frameH)
            ];
          }),
          is_active: true,
          camera_id: created.id,
        }));

        // Convert lines if present - convert normalized coordinates to pixel coordinates
        const scaledLines = lines && lines.length > 0 ? lines.map((l: any) => {
          // Lines should have normalized coordinates {fx, fy} in p1 and p2
          const p1_fx = (l.p1 && typeof l.p1 === 'object' && 'fx' in l.p1) ? l.p1.fx : 0;
          const p1_fy = (l.p1 && typeof l.p1 === 'object' && 'fy' in l.p1) ? l.p1.fy : 0;
          const p2_fx = (l.p2 && typeof l.p2 === 'object' && 'fx' in l.p2) ? l.p2.fx : 0;
          const p2_fy = (l.p2 && typeof l.p2 === 'object' && 'fy' in l.p2) ? l.p2.fy : 0;
          
          // Clamp normalized coordinates to [0, 1] range
          const clamped_p1_fx = Math.max(0, Math.min(1, p1_fx));
          const clamped_p1_fy = Math.max(0, Math.min(1, p1_fy));
          const clamped_p2_fx = Math.max(0, Math.min(1, p2_fx));
          const clamped_p2_fy = Math.max(0, Math.min(1, p2_fy));
          
          // Convert normalized to pixel coordinates
          const p1_pixel = [
            Math.round(clamped_p1_fx * frameW),
            Math.round(clamped_p1_fy * frameH)
          ];
          const p2_pixel = [
            Math.round(clamped_p2_fx * frameW),
            Math.round(clamped_p2_fy * frameH)
          ];
          
          // Log for debugging if needed
          if (process.env.NODE_ENV === 'development') {
            console.log('Converting line:', l.name, 
              'normalized p1:', [clamped_p1_fx, clamped_p1_fy], 
              'normalized p2:', [clamped_p2_fx, clamped_p2_fy],
              'frame:', frameW, 'x', frameH,
              'pixel p1:', p1_pixel, 'pixel p2:', p2_pixel);
          }
          
          return {
            name: l.name,
            p1: p1_pixel,
            p2: p2_pixel,
            is_active: true,
            camera_id: created.id,
          };
        }) : undefined;

        console.log('Converted lines:', scaledLines);

        const hasZones = scaledZones && scaledZones.length > 0;
        const hasLines = scaledLines && scaledLines.length > 0;
        const finalTaskType: 'zone' | 'line' | 'both' = hasZones && hasLines ? 'both' : hasZones ? 'zone' : 'line';

        if (hasZones || hasLines) {
          await tasksApi.setCameraTasks(created.id, {
            task_type: finalTaskType,
            zones: scaledZones,
            lines: scaledLines
          });
          console.log('✅ Tasks saved successfully:', { zones: scaledZones?.length || 0, lines: scaledLines?.length || 0 });
        }
      } catch (e) {
        console.warn('Failed to save tasks (zones/lines):', e);
      }
      
      // Refresh camera list to ensure taskInfo is loaded
      await loadCameras();

      // Refresh list from backend to reflect final state (but preserve running status if we detected it)
      const finalCameras = await cameraApi.getCameras();
      setCameras(finalCameras.map(c => {
        // If we just created this camera and know it's running, preserve that status
        if (c.id === created.id && cameraRunning) {
          return { ...c, is_active: true };
        }
        return c;
      }));
      toast.success('Camera added' + (cameraRunning ? ' and started' : ' (check RTSP stream)'));
    } catch (error: any) {
      console.error('Error in handleAddCamera:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create camera';
      toast.error(`Error adding camera: ${errorMessage}`);
      throw error;
    }
  };

  const handleToggleCamera = async (id: string, isActive: boolean) => {
    try {
      // Find the camera to get its current state
      const camera = cameras.find(c => c.id === id);
      if (!camera) {
        toast.error('Camera not found');
        return;
      }
      
      // Use the camera's current state, not the passed parameter
      // The button passes !camera.is_active, but we need the actual current state
      if (camera.is_active) {
        // Stop camera
        try {
          await cameraApi.stopCamera(id);
          toast.success(t('camera_stopped'));
        } catch (error: any) {
          // Even if stop fails, try to refresh state
          console.warn('Stop camera warning:', error);
          const errorMessage = error.response?.data?.detail || error.message || 'Failed to stop camera';
          toast.error(errorMessage);
        }
      } else {
        // Start camera
        try {
          await cameraApi.startCamera(id);
          toast.success(t('camera_started'));
        } catch (error: any) {
          console.error('Failed to start camera:', error);
          const errorMessage = error.response?.data?.detail || error.message || 'Failed to start camera';
          toast.error(errorMessage);
        }
      }
      
      // Always refresh list to reflect real backend state
      await loadCameras();
    } catch (error: any) {
      console.error('Failed to toggle camera', error);
      const errorMessage = error.response?.data?.detail || error.message || t('failed_toggle_camera');
      toast.error(errorMessage);
      // Still try to refresh to get current state
      try {
        await loadCameras();
      } catch (e) {
        console.error('Failed to refresh cameras after toggle error:', e);
      }
    }
  };

  const handleDeleteCamera = async (id: string) => {
    if (confirm('Are you sure you want to delete this camera?')) {
      try {
        await cameraApi.deleteCamera(id);
        await loadCameras();
        toast.success(t('camera_deleted'));
      } catch (error: any) {
        console.error('Failed to delete camera:', error);
        // Don't show generic error - show the actual error message
        const errorMessage = error.response?.data?.detail || error.message || t('camera_failed_delete');
        toast.error(`Failed to delete camera: ${errorMessage}`);
        // Don't reload cameras on error - keep the list as is
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
