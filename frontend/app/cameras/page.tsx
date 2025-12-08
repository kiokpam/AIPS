'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  X,
  Undo,
  Trash2,
  Save,
  Brain,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Users,
  MapPin,
  HelpCircle,
  Info
} from 'lucide-react';
import { cameraApi, storeApi, eventsApi, systemApi, buildWsUrl, type Camera as CameraType } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/src/contexts/I18nContext';
import { useData } from '@/src/contexts/DataContext';
import { wsManager } from '@/lib/websocket-manager';
import toast from 'react-hot-toast';

// Simple drawing canvas component used for overlaying zones/lines on top of the preview image.
// This is intentionally kept local to this page so that the AI/drawing logic can evolve
// without affecting the rest of the app structure.
type DrawingCanvasProps = React.CanvasHTMLAttributes<HTMLCanvasElement> & {
  drawnAreas: any[];
  currentDrawing: any;
  drawingMode: 'zone' | 'line' | null;
  drawZone: (ctx: CanvasRenderingContext2D, points: any[], color: string, lineWidth: number, isDraft?: boolean) => void;
  drawLine: (ctx: CanvasRenderingContext2D, p1: any, p2: any, color: string, lineWidth: number, isDraft?: boolean, area?: any) => void;
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
          // Pass the full area to draw both lines (Line A and Line B)
          drawLineRef.current(ctx, area.p1, area.p2, '#3b82f6', 3, false, area);
        }
      });

      // Draw current draft
      if (currentDrawing) {
        if (currentDrawing.type === 'zone') {
          drawZoneRef.current(ctx, currentDrawing.points || [], '#3b82f6', 2, true);
        } else if (currentDrawing.type === 'line') {
          // Pass the full currentDrawing to draw both lines as they're being drawn
          drawLineRef.current(ctx, currentDrawing.p1, currentDrawing.p2, '#3b82f6', 3, true, currentDrawing);
        }
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [drawnAreas, currentDrawing, drawingMode]); // Removed drawZone and drawLine from dependencies

  return <canvas ref={canvasRef} {...rest} />;
};

// Real In/Out counting API - calls backend endpoints
const inOutApi = {
  // Get latest counts for a camera from backend
  getCounts: async (cameraId: string) => {
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
      const baseUrl = base.endsWith('/api') ? base : `${base.replace(/\/+$/, '')}/api`;
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      
      const response = await fetch(`${baseUrl}/events/inout-counts?camera_id=${encodeURIComponent(cameraId)}&limit=1`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const latest = data[0];
          return {
            count_in: latest.count_in || 0,
            count_out: latest.count_out || 0,
            cumulative: (latest.count_in || 0) - (latest.count_out || 0),
          };
        }
      }
      // No data yet
      return { count_in: 0, count_out: 0, cumulative: 0 };
    } catch (error) {
      console.warn('Failed to fetch inout counts:', error);
      return { count_in: 0, count_out: 0, cumulative: 0 };
    }
  },
  
  // Get today's stats for a camera
  getTodayStats: async (cameraId: string) => {
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
      const baseUrl = base.endsWith('/api') ? base : `${base.replace(/\/+$/, '')}/api`;
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      
      // Get summary which has latest counts
      const response = await fetch(`${baseUrl}/events/inout-summary`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        // Find the camera in the summary
        const cameraData = data.cameras?.find((c: any) => c.camera_id === cameraId);
        if (cameraData) {
          return {
            count_in_today: cameraData.count_in || 0,
            count_out_today: cameraData.count_out || 0,
          };
        }
      }
      return { count_in_today: 0, count_out_today: 0 };
    } catch (error) {
      console.warn('Failed to fetch today stats:', error);
      return { count_in_today: 0, count_out_today: 0 };
    }
  },
  
  // These are no longer needed as AI service handles registration automatically
  registerCamera: async (_cameraId: string) => {
    return; // AI service auto-registers when camera is active
  },
  resetCounts: async (_cameraId: string) => {
    return; // Counts are managed by AI service
  },
  unregisterCamera: async (_cameraId: string) => {
    return; // AI service auto-unregisters when camera stops
  },
};

// Real tasks API that saves zones/lines to backend database
const tasksApi = {
  // Get zones and lines from database
  getCameraTaskConfig: async (cameraId: string) => {
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
      const baseUrl = base.endsWith('/api') ? base : `${base.replace(/\/+$/, '')}/api`;
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      
      const response = await fetch(`${baseUrl}/cameras/${cameraId}/tasks/db`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        return {
          zones: data.zones || [],
          lines: data.lines || [],
        };
      }
      console.warn('Failed to get task config:', response.status);
      return { zones: [], lines: [] };
    } catch (error) {
      console.warn('Error fetching task config:', error);
      return { zones: [], lines: [] };
    }
  },
  
  // Save zones and lines to database
  setCameraTasks: async (cameraId: string, payload: { task_type: string; zones?: any[]; lines?: any[] }) => {
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
      const baseUrl = base.endsWith('/api') ? base : `${base.replace(/\/+$/, '')}/api`;
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      
      const response = await fetch(`${baseUrl}/cameras/${cameraId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to save tasks:', response.status, errorText);
        throw new Error(`Failed to save tasks: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Tasks saved to database:', result);
      return result;
    } catch (error) {
      console.error('Error saving tasks:', error);
      throw error;
    }
  },
  
  // Clear all zones and lines for a camera
  clearCameraTasks: async (cameraId: string) => {
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
      const baseUrl = base.endsWith('/api') ? base : `${base.replace(/\/+$/, '')}/api`;
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      
      const response = await fetch(`${baseUrl}/cameras/${cameraId}/tasks/clear`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });
      
      if (!response.ok) {
        console.error('Failed to clear tasks:', response.status);
      }
    } catch (error) {
      console.error('Error clearing tasks:', error);
    }
  },
};


const CameraCard = React.memo(({ camera, onEdit, onDelete, onToggle, realtimeCount }: {
  camera: CameraType;
  onEdit: (camera: CameraType) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  realtimeCount?: { count_in: number; count_out: number; ts: string };
}) => {
  const { t } = useI18n();
  const [isStreaming, setIsStreaming] = useState(!!camera.is_active);
  const [isStarting, setIsStarting] = useState(false);
  const [streamRetry, setStreamRetry] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const [showAIDetails, setShowAIDetails] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Model configuration removed - AI services will handle all model settings
  const [taskInfo, setTaskInfo] = useState<{ zones: any[]; lines: any[] } | null>(null);
  const [saving, setSaving] = useState(false);
  
  // In/Out counting state
  const hasInOutCounting = camera.ai_services?.includes('in_out_counting') || false;
  const hasInOutLines = taskInfo?.lines && taskInfo.lines.length > 0 && 
    taskInfo.lines.some((l: any) => l.p1 && l.p2 && l.p1_b && l.p2_b);
  const [inOutCounts, setInOutCounts] = useState<{ count_in: number; count_out: number; cumulative: number } | null>(null);
  const [isInOutRegistered, setIsInOutRegistered] = useState(false);
  const [isRegisteringInOut, setIsRegisteringInOut] = useState(false);
  
  useEffect(() => {
    if (realtimeCount) {
      setInOutCounts({
        count_in: realtimeCount.count_in,
        count_out: realtimeCount.count_out,
        cumulative: realtimeCount.count_in - realtimeCount.count_out,
      });
      setIsInOutRegistered(true);
    }
  }, [realtimeCount]);
  
  // Behavior detection state
  const hasBehaviorDetection = camera.ai_services?.includes('behavior_detection') || false;
  const hasZones = taskInfo?.zones && taskInfo.zones.length > 0;
  
  // Today's stats and behaviors
  const [todayStats, setTodayStats] = useState<{ count_in_today: number; count_out_today: number } | null>(null);
  const [recentBehaviors, setRecentBehaviors] = useState<Array<{ type: string; severity: string; timestamp: string }>>([]);
  const router = useRouter();

  // Client-side overlay fallback: draw zones over MJPEG <img>
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  const [streamNonce, setStreamNonce] = useState<number>(Date.now());
  const [detections, setDetections] = useState<Array<{
    track_id: number;
    bbox: number[];
    label: string;
    confidence: number;
    in_zone: boolean;
  }>>([]);
  const [aiMetrics, setAiMetrics] = useState<{
    processing_fps?: number;
    actual_fps?: number;
    camera_fps?: number;
    model_times_ms?: {
      yolo?: number;
      deepsort?: number;
      mobilenet?: number;
      videomae?: number;
    };
    total_frame_time_ms?: number;
  } | null>(null);

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

      // Draw lines (Line A and Line B for In/Out counting)
      (taskInfo.lines || []).forEach((line: any) => {
        if (line.p1 && line.p2 && Array.isArray(line.p1) && Array.isArray(line.p2)) {
          // Backend stores lines as pixel coordinates [x, y]
          const p1 = mapPoint(line.p1);
          const p2 = mapPoint(line.p2);
          
          // Draw Line A (red color)
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(p1[0], p1[1]);
          ctx.lineTo(p2[0], p2[1]);
          ctx.stroke();
          // Draw endpoints for Line A
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(p1[0], p1[1], 6, 0, 2 * Math.PI);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p2[0], p2[1], 6, 0, 2 * Math.PI);
          ctx.fill();
          
          // Draw Line B if present (blue color) - required for In/Out counting
          if (line.p1_b && line.p2_b && Array.isArray(line.p1_b) && Array.isArray(line.p2_b)) {
            const p1b = mapPoint(line.p1_b);
            const p2b = mapPoint(line.p2_b);
            
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(p1b[0], p1b[1]);
            ctx.lineTo(p2b[0], p2b[1]);
            ctx.stroke();
            // Draw endpoints for Line B
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.arc(p1b[0], p1b[1], 6, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p2b[0], p2b[1], 6, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      });

      // Draw detection bounding boxes
      detections.forEach((det) => {
        if (!det.bbox || det.bbox.length !== 4) return;
        const [x1, y1, x2, y2] = det.bbox;
        
        // Map bounding box coordinates to canvas
        const topLeft = mapPoint([x1, y1]);
        const bottomRight = mapPoint([x2, y2]);
        const width = bottomRight[0] - topLeft[0];
        const height = bottomRight[1] - topLeft[1];
        
        // Draw bounding box - no labels, just different colors for behavior detection
        // Behavior detection: use orange/red colors for suspicious, green for normal
        // In/Out counting: use blue/green colors
        if (hasBehaviorDetection) {
          // Behavior detection: check if suspicious based on label
          const isSuspicious = det.label && det.label !== 'person' && det.label !== 'normal' && (det.confidence || 0) > 0.5;
          if (isSuspicious) {
            ctx.strokeStyle = det.in_zone ? '#ef4444' : '#f97316'; // Red if in zone, orange otherwise
          } else {
            ctx.strokeStyle = det.in_zone ? '#10b981' : '#3b82f6'; // Green if in zone, blue otherwise
          }
        } else {
          // In/Out counting: use blue/green colors
          ctx.strokeStyle = det.in_zone ? '#10b981' : '#3b82f6'; // Green if in zone, blue otherwise
        }
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(topLeft[0], topLeft[1], width, height);
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
  }, [taskInfo, frameSize, isStreaming, detections, hasBehaviorDetection]);


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
    let isLoading = false;
    
    const fetchStats = async () => {
      // Prevent overlapping requests
      if (isLoading) return;
      isLoading = true;
      
      try {
        // Fetch today's in/out stats if camera has in_out_counting
        if (hasInOutCounting) {
          const stats = await inOutApi.getTodayStats(camera.id);
          if (isMounted) setTodayStats(stats);
        }
        
        // Fetch recent behaviors only if camera has behavior_detection AND zones configured
        if (camera.ai_services?.includes('behavior_detection') && taskInfo?.zones && taskInfo.zones.length > 0) {
          const behaviors = await eventsApi.getCameraRecentBehaviors(camera.id, 3);
          if (isMounted) setRecentBehaviors(behaviors);
        } else {
          if (isMounted) setRecentBehaviors([]);
        }
      } catch (error: any) {
        // Ignore network errors from aborted/cancelled requests
        if (error.code === 'ERR_CANCELED' || error.name === 'AbortError') {
          return;
        }
        // Silently fail - stats are optional
        console.warn('Failed to fetch camera stats:', error);
      } finally {
        isLoading = false;
      }
    };

    fetchStats();
    // Refresh every 60 seconds (reduced frequency to prevent resource exhaustion)
    const timer = setInterval(fetchStats, 60000);
    
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [camera.id, hasInOutCounting, camera.ai_services, taskInfo]);

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

  // WebSocket connection for detection updates (bounding boxes)
  useEffect(() => {
    if (typeof window === 'undefined' || !isStreaming) return;
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    // Use a unique WebSocket URL per camera to avoid handler overwrite when multiple cameras render
    const wsUrl = buildWsUrl(`/ws/detections?token=${encodeURIComponent(token)}&camera=${camera.id}`);

    const ws = wsManager.getConnection({
      url: wsUrl,
      reconnect: isStreaming,
      reconnectDelay: 3000,
      onMessage: (data) => {
        if (data.type === 'detection_update' && data.camera_id === camera.id) {
          setDetections(data.detections || []);
          if (data.metrics) {
            setAiMetrics(data.metrics);
          }
        }
      },
      onError: (err) => {
        console.error('Detection websocket error:', err);
      },
      onClose: () => {
        // Reconnection handled by manager
      },
    });

    // Update handlers if connection already exists
    if (ws && ws.readyState === WebSocket.OPEN) {
      wsManager.updateHandlers(wsUrl, {
        onMessage: (data) => {
          if (data.type === 'detection_update' && data.camera_id === camera.id) {
            setDetections(data.detections || []);
            if (data.metrics) {
              setAiMetrics(data.metrics);
            }
          }
        },
      });
    }

    // Don't close connection on unmount - let manager handle it
    return () => {
      // Connection persists across navigations
    };
  }, [camera.id, isStreaming]);

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
            
            {/* Stream loading hint - shows when retrying */}
            {isStarting && streamRetry > 3 && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2 animate-pulse">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{t('stream_loading_hint') || 'Loading stream... Refresh page if video doesn\'t appear'}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="video-placeholder">
            <Camera className="w-12 h-12 text-slate-400" />
            <p className="text-sm text-slate-500 mt-2">{isStarting ? t('starting') : t('camera_offline')}</p>
            {camera.is_active && !isStarting && (
              <p className="text-xs text-blue-500 mt-2 cursor-pointer hover:underline" onClick={() => window.location.reload()}>
                {t('refresh_hint') || 'Stream not showing? Click to refresh page'}
              </p>
            )}
          </div>
        )}
        
        {/* Status Overlay */}
        <div className="absolute top-3 left-3 flex items-center space-x-2">
          <div className={`status-indicator ${camera.is_active ? 'status-online' : 'status-offline'}`} />
          <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
            {camera.is_active ? (isStarting ? t('starting') : t('online')) : t('offline')}
          </span>
        </div>

        {/* People / In-Out badges */}
        <div className="absolute bottom-3 left-3 space-y-1">
          {/* Show people count only for cameras with zones (people-in-zone) */}
          {hasZones && currentCount !== null && (
          <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
              {t('people_count')}: {currentCount}
          </span>
          )}
          {hasInOutLines && inOutCounts && (
            <div className="flex gap-2">
              <span className="text-xs text-white bg-green-600/70 px-2 py-1 rounded">
                IN: {inOutCounts.count_in}
              </span>
              <span className="text-xs text-white bg-blue-600/70 px-2 py-1 rounded">
                OUT: {inOutCounts.count_out}
              </span>
            </div>
          )}
        </div>

        {/* Menu Button */}
        <div className="absolute top-3 right-3 relative">
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
                 className="absolute right-0 mt-2 w-56 bg-white text-slate-900 rounded-lg shadow-lg border border-slate-200 py-1 z-10"
              >
                <button
                  onClick={() => {
                    setShowHelp(true);
                    setShowMenu(false);
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <HelpCircle className="w-4 h-4 mr-3" />
                  Camera Usage Instructions
                </button>
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Help Instructions Panel */}
        <AnimatePresence>
          {showHelp && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-14 right-3 w-80 bg-white rounded-lg shadow-xl border border-slate-200 p-4 z-20 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  Camera Usage Instructions
                </h3>
                <button
                  onClick={() => setShowHelp(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-4 text-xs text-slate-700">
                {/* In/Out Counting Lines */}
                {hasInOutCounting && (
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      In/Out Counting Lines
                    </h4>
                    <div className="space-y-2 text-blue-800">
                      <p className="font-medium">How it works:</p>
                      <div className="bg-white/60 rounded-lg p-2 border border-blue-200 text-xs">
                        <p className="mb-1.5"><strong>Detection Method:</strong></p>
                        <ol className="ml-3 space-y-1 list-decimal text-blue-700">
                          <li>AI detects the <strong>center point</strong> of each person's bounding box</li>
                          <li>After each frame, it <strong>connects</strong> the previous center to the current center (creating a trajectory line)</li>
                          <li>If this trajectory line <strong>intersects Line A or Line B</strong>, it registers a touch</li>
                          <li>When <strong>both lines are crossed</strong> (2 touches), it counts the person</li>
                          <li>The <strong>direction</strong> of crossing determines IN or OUT</li>
                        </ol>
                      </div>
                      <ul className="space-y-1.5 ml-2">
                        <li className="flex items-start gap-2">
                          <span className="font-semibold text-red-600 mt-0.5">Line A (Red):</span>
                          <span>First line you draw (points 1-2)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="font-semibold text-blue-600 mt-0.5">Line B (Blue):</span>
                          <span>Second line you draw (points 3-4)</span>
                        </li>
                      </ul>
                      <div className="mt-2 pt-2 border-t border-blue-300">
                        <p className="font-medium mb-1">Direction Rules:</p>
                        <div className="bg-white/60 rounded-lg p-2 border border-blue-200 text-xs">
                          <p className="mb-1.5"><strong>When trajectory crosses both lines:</strong></p>
                          <ul className="space-y-1 ml-2">
                            <li className="flex items-center gap-2">
                              <span className="text-green-700 font-semibold">→ IN:</span>
                              <span>Trajectory crosses <strong className="text-blue-600">Line B</strong> first, then <strong className="text-red-600">Line A</strong> (B→A)</span>
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="text-red-700 font-semibold">→ OUT:</span>
                              <span>Trajectory crosses <strong className="text-red-600">Line A</strong> first, then <strong className="text-blue-600">Line B</strong> (A→B)</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-blue-300">
                        <p className="font-medium">How to draw:</p>
                        <ol className="ml-2 mt-1 space-y-1 list-decimal list-inside">
                          <li>Click "Draw Line" button in camera settings</li>
                          <li>Click 4 points on the preview: Point 1-2 for Line A (red), Point 3-4 for Line B (blue)</li>
                          <li>Lines should be parallel and perpendicular to the direction of movement</li>
                          <li>Save the configuration</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                )}

                {/* Behavior Detection Zones */}
                {hasBehaviorDetection && (
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" />
                      Behavior Detection Zones
                    </h4>
                    <div className="space-y-2 text-green-800">
                      <p className="font-medium">How it works:</p>
                      <ul className="space-y-1 ml-2">
                        <li>• Draw zones (polygons) around areas where you want to monitor behavior</li>
                        <li>• AI detects suspicious activities like shoplifting and violence inside these zones</li>
                        <li>• Alerts appear in real-time when behaviors are detected</li>
                      </ul>
                      <div className="mt-2 pt-2 border-t border-green-300">
                        <p className="font-medium">How to draw:</p>
                        <ol className="ml-2 mt-1 space-y-1 list-decimal list-inside">
                          <li>Click "Draw Zone" button in camera settings</li>
                          <li>Click multiple points (minimum 3) to create a polygon</li>
                          <li>Click "Finish Zone" when done</li>
                          <li>Save the configuration</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                )}

                {/* General Usage */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <h4 className="font-semibold text-slate-900 mb-2">General Usage</h4>
                  <ul className="space-y-1.5 text-slate-700">
                    <li>• <strong>Start/Stop:</strong> Use the menu button (⋮) to start or stop camera processing</li>
                    <li>• <strong>Configure:</strong> Click "Configure" in the menu to set up zones and lines</li>
                    <li>• <strong>View Analytics:</strong> Check the dashboard buttons for detailed statistics</li>
                    <li>• <strong>Real-time Updates:</strong> Counts and alerts update automatically via WebSocket</li>
                  </ul>
                </div>

                {/* Tips */}
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <h4 className="font-semibold text-amber-900 mb-2">💡 Tips</h4>
                  <ul className="space-y-1 text-amber-800">
                    <li>• Place counting lines perpendicular to the main direction of movement</li>
                    <li>• Ensure lines are clearly visible in the camera view</li>
                    <li>• Zones should cover the entire area you want to monitor</li>
                    <li>• Save your configuration after drawing to activate AI features</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI Performance Metrics - Below Camera Stream */}
      {aiMetrics && (
        <div className="mt-2 bg-slate-800/90 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg border border-slate-700 space-y-1">
          <div className="font-semibold text-slate-200">AI Performance:</div>
          <div className="text-slate-300">FPS: {aiMetrics.processing_fps?.toFixed(1) || 'N/A'} (cam: {aiMetrics.camera_fps?.toFixed(1) || 'N/A'})</div>
          {aiMetrics.model_times_ms && (
            <div className="text-[10px] space-y-0.5 pt-1 border-t border-slate-700">
              <div className="text-slate-400">YOLO: {aiMetrics.model_times_ms.yolo?.toFixed(1) || '0'}ms</div>
              <div className="text-slate-400">DeepSORT: {aiMetrics.model_times_ms.deepsort?.toFixed(1) || '0'}ms</div>
              <div className="text-slate-400">MobileNet: {aiMetrics.model_times_ms.mobilenet?.toFixed(1) || '0'}ms</div>
              {aiMetrics.model_times_ms.videomae && aiMetrics.model_times_ms.videomae > 0 && (
                <div className="text-slate-400">VideoMAE: {aiMetrics.model_times_ms.videomae.toFixed(1)}ms</div>
              )}
              <div className="text-slate-300 font-medium">Total: {aiMetrics.total_frame_time_ms?.toFixed(1) || '0'}ms</div>
            </div>
          )}
        </div>
      )}

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

        {/* Contextual Stats - Only show what's configured */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="space-y-3">
            {/* Today's In/Out Counts - Only show if lines are configured */}
            {hasInOutLines ? (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    In/Out Counting
                  </span>
                  <Clock className="w-3 h-3 text-green-500" />
                </div>
                {todayStats ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center bg-white/60 rounded-lg p-2">
                      <div className="text-xl font-bold text-green-600">{todayStats.count_in_today}</div>
                      <div className="text-xs text-green-700 font-medium">IN</div>
                    </div>
                    <div className="text-center bg-white/60 rounded-lg p-2">
                      <div className="text-xl font-bold text-blue-600">{todayStats.count_out_today}</div>
                      <div className="text-xs text-blue-700 font-medium">OUT</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-green-600/70 text-center py-2 bg-white/40 rounded">
                    Waiting for counting data...
              </div>
            )}
              </div>
            ) : hasInOutCounting ? (
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-amber-800">In/Out Counting Not Configured</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Draw counting lines (Line A + Line B) to enable in/out counting
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Recent Behaviors - Only show if zones are configured */}
            {hasZones ? (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-3 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    Recent Behaviors
                  </span>
                  <Eye className="w-3 h-3 text-purple-500" />
                </div>
                {recentBehaviors.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentBehaviors.slice(0, 3).map((behavior, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs bg-white/60 rounded px-2 py-1.5">
                        <span className="text-slate-700 capitalize truncate flex-1 font-medium">
                          {behavior.type}
                        </span>
                        <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                          behavior.type === 'shoplifting' ? 'bg-red-100 text-red-700 border border-red-200' :
                          behavior.type === 'violence' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                          behavior.type === 'normal' ? 'bg-green-100 text-green-700 border border-green-200' :
                          'bg-blue-100 text-blue-700 border border-blue-200'
                        }`}>
                          {behavior.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-purple-600/70 text-center py-2 bg-white/40 rounded">
                    No behaviors detected yet
              </div>
            )}
              </div>
            ) : hasBehaviorDetection ? (
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-amber-800">Behavior Detection Not Configured</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Draw zones to enable behavior detection (shoplifting, violence)
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Quick Actions - Contextual buttons */}
            <div className="flex flex-col gap-2">
              {hasInOutLines && (
              <button
                onClick={() => router.push('/dashboard/in-out')}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
              >
                  <BarChart3 className="w-3.5 h-3.5" />
                  View In/Out Dashboard
              </button>
            )}
              {hasZones && (
                <button
                  onClick={() => router.push('/dashboard/behavior')}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                >
                  <Activity className="w-3.5 h-3.5" />
                  View Behavior Dashboard
                </button>
              )}
              {!hasInOutLines && !hasZones && (
                <div className="text-center py-2">
                  <p className="text-xs text-slate-500">
                    Configure zones or lines to see analytics
                  </p>
                </div>
              )}
            </div>
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
              {/* Configuration Summary */}
              <div className="mt-6 space-y-4">
                {/* People Count - Always show if available */}
                {currentCount !== null && (
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center justify-between">
                <div>
                        <div className="text-sm text-blue-600 mb-1 font-medium">Current People Count</div>
                        <div className="text-3xl font-bold text-blue-900">{currentCount}</div>
                        <div className="text-xs text-blue-600/70 mt-1">Real-time from AI</div>
                </div>
                      <Users className="w-10 h-10 text-blue-400/50" />
                </div>
              </div>
                )}

                {/* In/Out Counting Stats - Only if lines configured */}
                {hasInOutLines && inOutCounts ? (
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-green-700 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        In/Out Counting
                      </h4>
                      <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                        {taskInfo?.lines?.length || 0} line(s)
                      </span>
                </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-green-700">{inOutCounts.count_in}</div>
                        <div className="text-xs text-green-600 mt-1">IN</div>
                </div>
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-blue-700">{inOutCounts.count_out}</div>
                        <div className="text-xs text-blue-600 mt-1">OUT</div>
              </div>
                  </div>
                    </div>
                ) : hasInOutCounting ? (
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">In/Out Counting Not Configured</p>
                        <p className="text-xs text-amber-600 mt-1">
                          Draw counting lines (Line A + Line B) on the camera to enable in/out counting.
                        </p>
                  </div>
                  </div>
                  </div>
                ) : null}

                {/* Behavior Detection - Only if zones configured */}
                {hasZones ? (
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-purple-700 flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Behavior Detection
                      </h4>
                      <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">
                        {taskInfo?.zones?.length || 0} zone(s)
                      </span>
                    </div>
                    {recentBehaviors.length > 0 ? (
                      <div className="space-y-2">
                        {recentBehaviors.slice(0, 5).map((behavior, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white/60 rounded px-3 py-2">
                            <span className="text-sm text-slate-700 capitalize font-medium">
                              {behavior.type}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              behavior.type === 'shoplifting' ? 'bg-red-100 text-red-700 border border-red-200' :
                              behavior.type === 'violence' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                              'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}>
                              {behavior.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-purple-600/70 text-center py-2 bg-white/40 rounded">
                        No behaviors detected yet
                </div>
              )}
                  </div>
                ) : hasBehaviorDetection ? (
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                        <p className="text-sm font-medium text-amber-800">Behavior Detection Not Configured</p>
                        <p className="text-xs text-amber-600 mt-1">
                          Draw zones on the camera to enable behavior detection (shoplifting, violence).
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Configuration Details */}
                <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                  {/* Zones List */}
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Zones ({taskInfo?.zones?.length || 0})
                    </div>
                    {taskInfo?.zones && taskInfo.zones.length > 0 ? (
                      <ul className="text-sm text-slate-600 space-y-1 max-h-32 overflow-y-auto">
                        {taskInfo.zones.map((z: any) => (
                          <li key={z.id} className="flex items-center gap-2 py-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="truncate">{z.name || z.id}</span>
                          </li>
                    ))}
                  </ul>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No zones configured</p>
                    )}
                  </div>

                  {/* Lines List */}
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Lines ({taskInfo?.lines?.length || 0})
                    </div>
                    {taskInfo?.lines && taskInfo.lines.length > 0 ? (
                      <ul className="text-sm text-slate-600 space-y-1 max-h-32 overflow-y-auto">
                        {taskInfo.lines.map((l: any) => {
                          const isComplete = l.p1 && l.p2 && l.p1_b && l.p2_b;
                          return (
                            <li key={l.id} className="flex items-center gap-2 py-1">
                              <div className={`w-2 h-2 rounded-full ${isComplete ? 'bg-blue-500' : 'bg-amber-400'}`}></div>
                              <span className="truncate">{l.name || l.id}</span>
                              {!isComplete && (
                                <span className="text-xs text-amber-600">(incomplete)</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No lines configured</p>
                    )}
                  </div>
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
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.camera.id === nextProps.camera.id &&
    prevProps.camera.is_active === nextProps.camera.is_active &&
    prevProps.camera.name === nextProps.camera.name &&
    prevProps.realtimeCount?.count_in === nextProps.realtimeCount?.count_in &&
    prevProps.realtimeCount?.count_out === nextProps.realtimeCount?.count_out &&
    prevProps.realtimeCount?.ts === nextProps.realtimeCount?.ts
  );
});

const AddCameraModal = ({ isOpen, onClose, onAdd }: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (cameraData: any) => void;
}) => {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    name: '',
    source: '', // RTSP URL
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewConnected, setIsPreviewConnected] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [drawnAreas, setDrawnAreas] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string>('');
  const [previewNonce, setPreviewNonce] = useState<number>(Date.now());
  const [currentDrawing, setCurrentDrawing] = useState<any>(null);
  const [drawingMode, setDrawingMode] = useState<'zone' | 'line' | null>(null);
  const [drawSize, setDrawSize] = useState<{ w: number; h: number } | null>(null);
  const [showPreviewHelp, setShowPreviewHelp] = useState(false);
  const [contentBox, setContentBox] = useState<{
    displayW: number; displayH: number; offsetX: number; offsetY: number; naturalW: number; naturalH: number
  } | null>(null);

  // Helper function to convert normalized coordinates back to canvas coordinates for display
  // Uses current contentBox state OR recomputes it based on the canvas and media element
  const normalizedToCanvas = useCallback((fx: number, fy: number, canvas: HTMLCanvasElement) => {
    // Try to compute the current content box from the canvas and media element
    // This ensures we always use the current dimensions, not stale state
    const mediaEl = canvas.parentElement?.querySelector('video, img') as HTMLVideoElement | HTMLImageElement | null;
    
    let currentBox = contentBox;
    if (mediaEl) {
      const containerW = canvas.width;
      const containerH = canvas.height;
      const naturalW = (mediaEl as HTMLVideoElement).videoWidth || (mediaEl as HTMLImageElement).naturalWidth || containerW;
      const naturalH = (mediaEl as HTMLVideoElement).videoHeight || (mediaEl as HTMLImageElement).naturalHeight || containerH;
      
      if (naturalW > 0 && naturalH > 0) {
        const scale = Math.min(containerW / naturalW, containerH / naturalH);
        const displayW = naturalW * scale;
        const displayH = naturalH * scale;
        const offsetX = (containerW - displayW) / 2;
        const offsetY = (containerH - displayH) / 2;
        currentBox = { displayW, displayH, offsetX, offsetY, naturalW, naturalH };
      }
    }
    
    if (!currentBox || currentBox.displayW <= 0 || currentBox.displayH <= 0) {
      // Fallback to canvas-relative coordinates (no letterboxing)
      return {
        x: fx * canvas.width,
        y: fy * canvas.height
      };
    }
    
    // Convert normalized coordinates back to content box coordinates
    const xInContent = fx * currentBox.displayW;
    const yInContent = fy * currentBox.displayH;
    
    // Convert to canvas coordinates (add offset for letterboxing)
    return {
      x: xInContent + currentBox.offsetX,
      y: yInContent + currentBox.offsetY
    };
  }, [contentBox]);

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
  }, [normalizedToCanvas]);

  // Helper to draw a single line segment with endpoints
  const drawSingleLine = useCallback((ctx: CanvasRenderingContext2D, p1: any, p2: any, color: string, lineWidth: number, isDraft = false, label?: string) => {
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

    // Draw label if provided
    if (label) {
      const midX = (point1.x + point2.x) / 2;
      const midY = (point1.y + point2.y) / 2;
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(label, midX + 5, midY - 5);
    }
  }, [normalizedToCanvas]);

  // Draw line pair for In/Out counting (Line A and Line B)
  const drawLine = useCallback((ctx: CanvasRenderingContext2D, p1: any, p2: any, color: string, lineWidth: number, isDraft = false, area?: any) => {
    // Draw Line A (first line) - always in red/green
    if (p1 && p2) {
      drawSingleLine(ctx, p1, p2, '#ef4444', lineWidth, isDraft);
    }
    
    // Draw Line B (second line for In/Out detection) - in blue
    if (area && area.p1_b && area.p2_b) {
      drawSingleLine(ctx, area.p1_b, area.p2_b, '#3b82f6', lineWidth, isDraft);
    } else if (area && area.p1_b && !area.p2_b) {
      // Draw just the first point of Line B while drawing
      const point = (area.p1_b.x !== undefined && area.p1_b.y !== undefined)
        ? { x: area.p1_b.x, y: area.p1_b.y }
        : normalizedToCanvas(area.p1_b.fx || 0, area.p1_b.fy || 0, ctx.canvas);
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [drawSingleLine, normalizedToCanvas]);


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

      // Convert drawn lines to backend format - now with Line A and Line B for In/Out detection
      // AI expects: line_a = [p1, p2], line_b = [p1_b, p2_b]
      // Crossing A→B = OUT, B→A = IN
      const lines = drawnAreas
        .filter(area => area.type === 'line' && area.isComplete)
        .map((area, index) => {
          return {
            id: `line_${index + 1}`,
            name: area.name || `InOut Line ${index + 1}`,
            // Line A (first line) - normalized coordinates
            p1: { fx: area.p1.fx, fy: area.p1.fy },
            p2: { fx: area.p2.fx, fy: area.p2.fy },
            // Line B (second line for In/Out detection) - normalized coordinates
            p1_b: area.p1_b ? { fx: area.p1_b.fx, fy: area.p1_b.fy } : null,
            p2_b: area.p2_b ? { fx: area.p2_b.fx, fy: area.p2_b.fy } : null,
          };
        });

      const cameraData = {
        name: formData.name.trim(),
        source: formData.source.trim(), // RTSP URL only
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
    });
    setSelectedFile(null);
    setDrawnAreas([]);
    setIsPreviewConnected(false);
    setPreviewUrl('');
    setPreviewError('');
    setPreviewNonce(Date.now()); // Reset nonce for fresh connection
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

  // Initialize contentBox when preview image/video loads
  const initializeContentBox = useCallback(() => {
    const container = document.querySelector('[data-preview-container]');
    const mediaEl = container?.querySelector('video, img') as HTMLVideoElement | HTMLImageElement | null;
    const canvas = container?.querySelector('canvas') as HTMLCanvasElement | null;
    
    if (mediaEl && canvas) {
      const containerW = canvas.width || canvas.clientWidth;
      const containerH = canvas.height || canvas.clientHeight;
      const naturalW = (mediaEl as HTMLVideoElement).videoWidth || (mediaEl as HTMLImageElement).naturalWidth || containerW;
      const naturalH = (mediaEl as HTMLVideoElement).videoHeight || (mediaEl as HTMLImageElement).naturalHeight || containerH;
      
      if (naturalW > 0 && naturalH > 0 && containerW > 0 && containerH > 0) {
        const scale = Math.min(containerW / naturalW, containerH / naturalH);
        const displayW = naturalW * scale;
        const displayH = naturalH * scale;
        const offsetX = (containerW - displayW) / 2;
        const offsetY = (containerH - displayH) / 2;
        setContentBox({ displayW, displayH, offsetX, offsetY, naturalW, naturalH });
        console.log('ContentBox initialized:', { displayW, displayH, offsetX, offsetY, naturalW, naturalH });
      }
    }
  }, []);

  const handleConnectPreview = async () => {
    if (isPreviewConnected) {
      // Disconnect preview - clear URL first to stop the stream
      setPreviewUrl('');
      setIsPreviewConnected(false);
      setPreviewError('');
      setContentBox(null); // Clear contentBox when disconnecting
      // Generate new nonce for next connection
      setPreviewNonce(Date.now());
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

      // Use backend preview endpoint with cache-busting nonce
      const sourceParam = encodeURIComponent(formData.source);  // RTSP URL
      const nonce = Date.now();
      setPreviewNonce(nonce);
      const sourceUrl = `${baseUrl}/preview/stream?source=${sourceParam}&token=${encodeURIComponent(token)}&t=${nonce}`;
      
      // Test the source first with timeout and retry
      try {
        const testUrl = `${baseUrl}/preview/test?source=${sourceParam}&token=${encodeURIComponent(token)}`;
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
    // Use local variable to avoid async state update issues
    let currentContentBox = contentBox;
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
      // Use the computed value immediately (not waiting for state update)
      currentContentBox = { displayW, displayH, offsetX, offsetY, naturalW, naturalH };
      setContentBox(currentContentBox);
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

    // Calculate normalized coordinates relative to the content (letterboxed) box
    // This maps clicks to [0,1] range relative to the actual video content area
    let fx = 0;
    let fy = 0;
    if (currentContentBox && currentContentBox.displayW > 0 && currentContentBox.displayH > 0) {
      // Use the computed contentBox directly (not the stale state)
      fx = (x - currentContentBox.offsetX) / currentContentBox.displayW;
      fy = (y - currentContentBox.offsetY) / currentContentBox.displayH;
    } else {
      // Fallback to canvas-relative normalization
      fx = canvas.width > 0 ? x / canvas.width : 0;
      fy = canvas.height > 0 ? y / canvas.height : 0;
    }
    // Clamp to [0,1] to avoid any numeric drift or clicks slightly outside
    fx = Math.max(0, Math.min(1, fx));
    fy = Math.max(0, Math.min(1, fy));
    
    if (drawingMode === 'zone') {
      handleZoneClick(x, y, fx, fy);
    } else if (drawingMode === 'line') {
      handleLineClick(x, y, fx, fy);
    }
  };

  const handleLineClick = (x: number, y: number, fx: number, fy: number) => {
    if (!currentDrawing) {
      // Start new line pair - first point of Line A
      setCurrentDrawing({
        id: Date.now(),
        type: 'line',
        // Line A (first line)
        p1: { x, y, fx, fy },
        p2: null,
        // Line B (second line for In/Out detection)
        p1_b: null,
        p2_b: null,
        lineStep: 1, // Track which point we're on (1-4)
        isComplete: false
      });
    } else if (currentDrawing.type === 'line') {
      const step = currentDrawing.lineStep || 1;
      
      if (step === 1 && !currentDrawing.p2) {
        // Second point of Line A
        setCurrentDrawing({
        ...currentDrawing,
        p2: { x, y, fx, fy },
          lineStep: 2
        });
      } else if (step === 2 && !currentDrawing.p1_b) {
        // First point of Line B
        setCurrentDrawing({
          ...currentDrawing,
          p1_b: { x, y, fx, fy },
          lineStep: 3
        });
      } else if (step === 3 && !currentDrawing.p2_b) {
        // Fourth point - complete Line B and finish
        const completedLinePair = {
          ...currentDrawing,
          p2_b: { x, y, fx, fy },
          lineStep: 4,
        isComplete: true,
          name: `InOut Line ${drawnAreas.filter(a => a.type === 'line').length + 1}`
      };
        setDrawnAreas(prev => [...prev, completedLinePair]);
      setCurrentDrawing(null);
      }
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

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({ name: '', source: '' });
      setDrawnAreas([]);
      setCurrentDrawing(null);
      setPreviewUrl('');
      setIsPreviewConnected(false);
      setPreviewError('');
    }
  }, [isOpen]);

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

              {/* Source Input */}
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
                                  ? (() => {
                                      const step = currentDrawing.lineStep || 1;
                                      if (step === 1) return ' Click Line A - Point 2';
                                      if (step === 2) return ' Click Line B - Point 1';
                                      if (step === 3) return ' Click Line B - Point 2 (last point)';
                                      return ' Complete';
                                    })()
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


              {/* Drawing Summary */}
              {drawnAreas.length > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-sm font-medium text-slate-700 mb-2">Configured Areas:</p>
                  <div className="space-y-1 text-sm text-slate-600">
                    {drawnAreas.filter(a => a.type === 'zone').length > 0 && (
                      <p className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                        {drawnAreas.filter(a => a.type === 'zone').length} Zone(s) - Behavior Detection
                      </p>
                    )}
                    {drawnAreas.filter(a => a.type === 'line').length > 0 && (
                      <p className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                        {drawnAreas.filter(a => a.type === 'line').length} Line Pair(s) - In/Out Counting
                      </p>
                    )}
            </div>
                </div>
              )}
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
                <div className="relative w-full h-full" data-preview-container>
                  <img
                    src={previewUrl}
                    alt="RTSP Stream"
                    className="w-full h-full object-contain bg-black rounded border"
                    style={{ pointerEvents: 'none' }}
                    onLoad={() => {
                      // Initialize contentBox when preview image loads
                      // This ensures accurate coordinate calculation for drawing
                      setTimeout(initializeContentBox, 100); // Small delay to ensure layout is complete
                    }}
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
                  {drawingMode && (
                    <div className={`absolute top-2 left-2 text-white px-2 py-1 rounded text-xs ${
                      drawingMode === 'zone' ? 'bg-green-600' : 'bg-blue-600'
                    }`}>
                      {drawingMode === 'zone' ? '🟢 Drawing Zone' : '📏 Drawing In/Out Line'}
                      {currentDrawing && (
                        <span className="ml-2 opacity-75">
                          {drawingMode === 'zone' 
                            ? `(${currentDrawing.points?.length || 0} points)` 
                            : `(Step ${currentDrawing.lineStep || 1}/4)`
                          }
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Help and Retry Preview Buttons - Overlay on preview */}
                  <div className="absolute top-2 right-2 flex gap-2 z-30">
                    <button
                      type="button"
                      onClick={() => setShowPreviewHelp(!showPreviewHelp)}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 shadow-lg"
                      title="Show drawing instructions"
                    >
                      <HelpCircle className="w-3 h-3" />
                      Help
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Refresh the preview stream with new nonce
                        const newNonce = Date.now();
                        setPreviewNonce(newNonce);
                        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                        const baseUrl = apiBaseUrl.endsWith('/api') ? apiBaseUrl : `${apiBaseUrl.replace(/\/+$/, '')}/api`;
                        const token = localStorage.getItem('auth_token');
                        const encodedSource = encodeURIComponent(formData.source);
                        const newUrl = `${baseUrl}/preview/stream?source=${encodedSource}&token=${encodeURIComponent(token || '')}&t=${newNonce}`;
                        setPreviewUrl(''); // Clear first
                        setTimeout(() => setPreviewUrl(newUrl), 100); // Then set new URL
                        toast.success('Refreshing preview...');
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 shadow-lg"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Retry Preview
                    </button>
                  </div>
                  
                  {/* Preview Help Instructions Panel */}
                  <AnimatePresence>
                    {showPreviewHelp && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-12 right-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 p-4 z-30 max-h-[70vh] overflow-y-auto"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                            <Info className="w-4 h-4 text-blue-600" />
                            Drawing Instructions
                          </h3>
                          <button
                            onClick={() => setShowPreviewHelp(false)}
                            className="text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-3 text-xs text-slate-700">
                          {/* In/Out Counting Instructions */}
                          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
                            <div className="flex items-center gap-2 mb-3">
                              <TrendingUp className="w-4 h-4 text-blue-600" />
                              <p className="text-sm font-semibold text-blue-900">
                                In/Out Counting Lines - Step by Step
                              </p>
                            </div>
                            <div className="space-y-3 text-sm text-blue-800">
                              <div>
                                <p className="font-medium mb-2">What are the lines for?</p>
                                <p className="text-xs text-blue-700 mb-2">
                                  Two parallel lines are used to detect when people enter (IN) or exit (OUT) an area. 
                                  The system tracks the trajectory of each person's movement to determine direction.
                                </p>
                              </div>
                              <div className="bg-white/60 rounded-lg p-3 border border-blue-200">
                                <p className="font-semibold text-blue-900 mb-2">How Detection Works:</p>
                                <ol className="text-xs text-blue-700 ml-4 space-y-1.5 list-decimal">
                                  <li>AI detects the <strong>center point</strong> of each person's bounding box in every frame</li>
                                  <li>After each frame, it <strong>connects</strong> the previous center to the current center (creating a trajectory line)</li>
                                  <li>If this trajectory line <strong>intersects/cuts Line A or Line B</strong>, it registers a touch</li>
                                  <li>When <strong>both lines are cut</strong> (2 touches detected), it counts the person</li>
                                  <li>The <strong>order of line crossings</strong> determines IN or OUT direction</li>
                                </ol>
                              </div>
                              <div className="bg-white/60 rounded-lg p-3 border border-blue-200">
                                <p className="font-semibold text-blue-900 mb-2">Line Identification:</p>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-1 bg-red-500 rounded"></div>
                                    <span className="text-xs"><strong className="text-red-600">Line A (Red):</strong> First line you draw (Points 1-2)</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-1 bg-blue-500 rounded"></div>
                                    <span className="text-xs"><strong className="text-blue-600">Line B (Blue):</strong> Second line you draw (Points 3-4)</span>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-white/60 rounded-lg p-3 border border-blue-200">
                                <p className="font-semibold text-blue-900 mb-2">Direction Rules:</p>
                                <p className="text-xs text-blue-700 mb-2">When trajectory cuts both lines:</p>
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="w-16 text-green-700 font-semibold">→ IN:</span>
                                    <span>Trajectory cuts <strong className="text-blue-600">Line B</strong> first, then <strong className="text-red-600">Line A</strong> (B→A)</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="w-16 text-red-700 font-semibold">→ OUT:</span>
                                    <span>Trajectory cuts <strong className="text-red-600">Line A</strong> first, then <strong className="text-blue-600">Line B</strong> (A→B)</span>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <p className="font-medium mb-1">How to Draw:</p>
                                <ol className="text-xs text-blue-700 ml-4 space-y-1 list-decimal">
                                  <li>Click the <strong>"Draw Line (IN/OUT)"</strong> button</li>
                                  <li>Click <strong>Point 1</strong> on the preview (start of Line A - red)</li>
                                  <li>Click <strong>Point 2</strong> on the preview (end of Line A - red)</li>
                                  <li>Click <strong>Point 3</strong> on the preview (start of Line B - blue)</li>
                                  <li>Click <strong>Point 4</strong> on the preview (end of Line B - blue)</li>
                                  <li>Lines should be <strong>parallel</strong> and <strong>perpendicular</strong> to movement direction</li>
                                  <li>Click <strong>"Save"</strong> to activate counting</li>
                                </ol>
                              </div>
                            </div>
                          </div>

                          {/* Zone Instructions */}
                          <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
                            <div className="flex items-center gap-2 mb-3">
                              <Activity className="w-4 h-4 text-green-600" />
                              <p className="text-sm font-semibold text-green-900">
                                Behavior Detection Zones
                              </p>
                            </div>
                            <div className="space-y-2 text-sm text-green-800">
                              <p className="text-xs text-green-700 mb-2">
                                Draw zones (polygons) around areas where you want to monitor for suspicious behaviors like shoplifting or violence.
                              </p>
                              <div>
                                <p className="font-medium mb-1">How to Draw:</p>
                                <ol className="text-xs text-green-700 ml-4 space-y-1 list-decimal">
                                  <li>Click the <strong>"Draw Zone"</strong> button</li>
                                  <li>Click multiple points (minimum 3) to create a polygon</li>
                                  <li>Click <strong>"Finish Zone"</strong> when done</li>
                                  <li>Click <strong>"Save"</strong> to activate behavior detection</li>
                                </ol>
                              </div>
                            </div>
                          </div>

                          {/* General Tips */}
                          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <p className="text-xs font-semibold text-amber-900 mb-1.5 flex items-center gap-1">
                              <Info className="w-3.5 h-3.5" />
                              Quick Tips
                            </p>
                            <ul className="text-xs text-amber-800 space-y-1">
                              <li>• Use <strong>Undo</strong> to remove the last drawn area</li>
                              <li>• Use <strong>Clear</strong> to remove all drawn areas</li>
                              <li>• Make sure lines/zones are clearly visible in the preview</li>
                              <li>• Save your configuration to activate AI features</li>
                            </ul>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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

            {/* Enhanced Drawing Instructions */}
            {isPreviewConnected && (
              <div className="mt-4 space-y-3 flex-shrink-0">
                {/* In/Out Counting Instructions */}
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <p className="text-sm font-semibold text-blue-900">
                      In/Out Counting Lines - Step by Step
                    </p>
                  </div>
                  <div className="space-y-3 text-sm text-blue-800">
                    <div>
                      <p className="font-medium mb-2">What are the lines for?</p>
                      <p className="text-xs text-blue-700 mb-2">
                        Two parallel lines are used to detect when people enter (IN) or exit (OUT) an area. 
                        The system tracks the trajectory of each person's movement to determine direction.
                      </p>
                    </div>
                    <div className="bg-white/60 rounded-lg p-3 border border-blue-200">
                      <p className="font-semibold text-blue-900 mb-2">How Detection Works:</p>
                      <ol className="text-xs text-blue-700 ml-4 space-y-1.5 list-decimal">
                        <li>AI detects the <strong>center point</strong> of each person's bounding box in every frame</li>
                        <li>After each frame, it <strong>connects</strong> the previous center to the current center (creating a trajectory line)</li>
                        <li>If this trajectory line <strong>intersects/cuts Line A or Line B</strong>, it registers a touch</li>
                        <li>When <strong>both lines are cut</strong> (2 touches detected), it counts the person</li>
                        <li>The <strong>order of line crossings</strong> determines IN or OUT direction</li>
                      </ol>
                    </div>
                    <div className="bg-white/60 rounded-lg p-3 border border-blue-200">
                      <p className="font-semibold text-blue-900 mb-2">Line Identification:</p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-1 bg-red-500 rounded"></div>
                          <span className="text-xs"><strong className="text-red-600">Line A (Red):</strong> First line you draw (Points 1-2)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-1 bg-blue-500 rounded"></div>
                          <span className="text-xs"><strong className="text-blue-600">Line B (Blue):</strong> Second line you draw (Points 3-4)</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white/60 rounded-lg p-3 border border-blue-200">
                      <p className="font-semibold text-blue-900 mb-2">Direction Rules:</p>
                      <p className="text-xs text-blue-700 mb-2">When trajectory cuts both lines:</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-16 text-green-700 font-semibold">→ IN:</span>
                          <span>Trajectory cuts <strong className="text-blue-600">Line B</strong> first, then <strong className="text-red-600">Line A</strong> (B→A)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-16 text-red-700 font-semibold">→ OUT:</span>
                          <span>Trajectory cuts <strong className="text-red-600">Line A</strong> first, then <strong className="text-blue-600">Line B</strong> (A→B)</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="font-medium mb-1">How to Draw:</p>
                      <ol className="text-xs text-blue-700 ml-4 space-y-1 list-decimal">
                        <li>Click the <strong>"Draw Line (IN/OUT)"</strong> button</li>
                        <li>Click <strong>Point 1</strong> on the preview (start of Line A - red)</li>
                        <li>Click <strong>Point 2</strong> on the preview (end of Line A - red)</li>
                        <li>Click <strong>Point 3</strong> on the preview (start of Line B - blue)</li>
                        <li>Click <strong>Point 4</strong> on the preview (end of Line B - blue)</li>
                        <li>Lines should be <strong>parallel</strong> and <strong>perpendicular</strong> to movement direction</li>
                        <li>Click <strong>"Save"</strong> to activate counting</li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Zone Instructions */}
                <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 text-green-600" />
                    <p className="text-sm font-semibold text-green-900">
                      Behavior Detection Zones
                    </p>
                  </div>
                  <div className="space-y-2 text-sm text-green-800">
                    <p className="text-xs text-green-700 mb-2">
                      Draw zones (polygons) around areas where you want to monitor for suspicious behaviors like shoplifting or violence.
                    </p>
                    <div>
                      <p className="font-medium mb-1">How to Draw:</p>
                      <ol className="text-xs text-green-700 ml-4 space-y-1 list-decimal">
                        <li>Click the <strong>"Draw Zone"</strong> button</li>
                        <li>Click multiple points (minimum 3) to create a polygon</li>
                        <li>Click <strong>"Finish Zone"</strong> when done</li>
                        <li>Click <strong>"Save"</strong> to activate behavior detection</li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* General Tips */}
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-xs font-semibold text-amber-900 mb-1.5 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    Quick Tips
                  </p>
                  <ul className="text-xs text-amber-800 space-y-1">
                    <li>• Use <strong>Undo</strong> to remove the last drawn area</li>
                    <li>• Use <strong>Clear</strong> to remove all drawn areas</li>
                    <li>• Make sure lines/zones are clearly visible in the preview</li>
                    <li>• Save your configuration to activate AI features</li>
                  </ul>
                </div>
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
  const { t, lang } = useI18n();
  const { cameras: camerasFromContext, refreshCameras, isLoading: dataLoading } = useData();
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState<CameraType | null>(null);
  const isInitialLoadRef = useRef(true);
  const [realtimeCounts, setRealtimeCounts] = useState<Record<string, { count_in: number; count_out: number; ts: string }>>({});
  const [totalPeople, setTotalPeople] = useState<number>(0);

  // Sync cameras from context
  useEffect(() => {
    if (camerasFromContext.length > 0 || (!dataLoading && camerasFromContext.length === 0)) {
      setCameras(camerasFromContext);
      if (isInitialLoadRef.current && !dataLoading) {
        setIsLoading(false);
        isInitialLoadRef.current = false;
      }
    }
  }, [camerasFromContext, dataLoading]);

  const loadTotalPeople = useCallback(async () => {
    try {
      const stats = await systemApi.getStatsSummary();
      setTotalPeople(stats.total_people);
    } catch (error) {
      console.error('Failed to load total people count:', error);
    }
  }, []);

  useEffect(() => {
    loadTotalPeople();
    // Refresh total people every 5 seconds
    const interval = setInterval(loadTotalPeople, 5000);
    return () => clearInterval(interval);
  }, [loadTotalPeople]);

  const loadCameras = useCallback(async (showSpinner = false) => {
    try {
      // Only show loading spinner on initial load, not on refresh
      if (isInitialLoadRef.current || showSpinner) {
        setIsLoading(true);
      }
      await refreshCameras();
      isInitialLoadRef.current = false;
    } catch (error) {
      console.error('Failed to load cameras:', error);
      toast.error(t('failed_load_cameras'));
    } finally {
      setIsLoading(false);
    }
  }, [refreshCameras, t]);

  const handleAddCamera = useCallback(async (cameraData: any) => {
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

      // Auto-add in_out_counting if at least one complete line pair is drawn (Line A + Line B)
      // A complete line pair has p1, p2 (Line A) and p1_b, p2_b (Line B)
      const hasCompleteLinePair = lines && lines.length >= 1 && 
        lines.some((l: any) => l.p1 && l.p2 && l.p1_b && l.p2_b);
      const aiServices = ['people_counting', 'behavior_detection'];
      if (hasCompleteLinePair) {
        aiServices.push('in_out_counting');
      }

      const payload = {
        store_id: storeId,
        name: cameraConfig.name,
        source: cameraConfig.source, // RTSP URL only
        ai_services: aiServices,
      };

      // Creating camera via API
      const created = await cameraApi.createCamera(payload);

      // Optimistically add as active while backend starts the worker
      const newCamera = { ...created, is_active: true };
      setCameras(prev => [...prev, newCamera]);
      // Also update context
      refreshCameras();
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
        refreshCameras(); // Sync with context
        toast.success('Camera started successfully');
      } else {
        setCameras(prev => prev.map(c => 
          c.id === created.id ? { ...c, is_active: false } : c
        ));
        refreshCameras(); // Sync with context
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
        // Lines have Line A (p1, p2) and Line B (p1_b, p2_b) for In/Out counting
        const scaledLines = lines && lines.length > 0 ? lines.map((l: any) => {
          // Line A: p1, p2 - normalized coordinates {fx, fy}
          const p1_fx = (l.p1 && typeof l.p1 === 'object' && 'fx' in l.p1) ? l.p1.fx : 0;
          const p1_fy = (l.p1 && typeof l.p1 === 'object' && 'fy' in l.p1) ? l.p1.fy : 0;
          const p2_fx = (l.p2 && typeof l.p2 === 'object' && 'fx' in l.p2) ? l.p2.fx : 0;
          const p2_fy = (l.p2 && typeof l.p2 === 'object' && 'fy' in l.p2) ? l.p2.fy : 0;
          
          // Clamp normalized coordinates to [0, 1] range
          const clamped_p1_fx = Math.max(0, Math.min(1, p1_fx));
          const clamped_p1_fy = Math.max(0, Math.min(1, p1_fy));
          const clamped_p2_fx = Math.max(0, Math.min(1, p2_fx));
          const clamped_p2_fy = Math.max(0, Math.min(1, p2_fy));
          
          // Convert Line A normalized to pixel coordinates
          const p1_pixel = [
            Math.round(clamped_p1_fx * frameW),
            Math.round(clamped_p1_fy * frameH)
          ];
          const p2_pixel = [
            Math.round(clamped_p2_fx * frameW),
            Math.round(clamped_p2_fy * frameH)
          ];
          
          // Line B: p1_b, p2_b - for In/Out detection
          let p1_b_pixel = null;
          let p2_b_pixel = null;
          
          if (l.p1_b && l.p2_b) {
            const p1_b_fx = (typeof l.p1_b === 'object' && 'fx' in l.p1_b) ? l.p1_b.fx : 0;
            const p1_b_fy = (typeof l.p1_b === 'object' && 'fy' in l.p1_b) ? l.p1_b.fy : 0;
            const p2_b_fx = (typeof l.p2_b === 'object' && 'fx' in l.p2_b) ? l.p2_b.fx : 0;
            const p2_b_fy = (typeof l.p2_b === 'object' && 'fy' in l.p2_b) ? l.p2_b.fy : 0;
            
            const clamped_p1_b_fx = Math.max(0, Math.min(1, p1_b_fx));
            const clamped_p1_b_fy = Math.max(0, Math.min(1, p1_b_fy));
            const clamped_p2_b_fx = Math.max(0, Math.min(1, p2_b_fx));
            const clamped_p2_b_fy = Math.max(0, Math.min(1, p2_b_fy));
            
            p1_b_pixel = [
              Math.round(clamped_p1_b_fx * frameW),
              Math.round(clamped_p1_b_fy * frameH)
            ];
            p2_b_pixel = [
              Math.round(clamped_p2_b_fx * frameW),
              Math.round(clamped_p2_b_fy * frameH)
            ];
          }
          
          // Log for debugging if needed
          if (process.env.NODE_ENV === 'development') {
            console.log('Converting line:', l.name, 
              'Line A:', p1_pixel, '→', p2_pixel,
              'Line B:', p1_b_pixel, '→', p2_b_pixel,
              'frame:', frameW, 'x', frameH);
          }
          
          return {
            name: l.name,
            p1: p1_pixel,
            p2: p2_pixel,
            p1_b: p1_b_pixel,
            p2_b: p2_b_pixel,
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
      
      // Show helpful hint about refreshing if streams don't load
      setTimeout(() => {
        toast(t('new_camera_hint') || 'New camera added! Refresh the page if streams don\'t load properly.', {
          icon: '💡',
          duration: 6000,
        });
      }, 2000);
    } catch (error: any) {
      console.error('Error in handleAddCamera:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create camera';
      toast.error(`Error adding camera: ${errorMessage}`);
      throw error;
    }
  }, [refreshCameras, t]);

  // WebSocket connection for in/out updates (shared across all cameras)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const wsUrl = buildWsUrl(`/ws/inout?token=${encodeURIComponent(token)}`);

    const ws = wsManager.getConnection({
      url: wsUrl,
      reconnect: true,
      reconnectDelay: 3000,
      onMessage: (data) => {
        if (data.type !== 'inout_update') return;
        setRealtimeCounts((prev) => ({
          ...prev,
          [data.camera_id]: {
            count_in: data.count_in,
            count_out: data.count_out,
            ts: data.ts,
          },
        }));
      },
      onError: (err) => {
        console.error('In/Out websocket error:', err);
      },
    });

    // Connection persists across navigations
    return () => {
      // Don't close - let manager handle it
    };
  }, []);

  const handleToggleCamera = useCallback(async (id: string, isActive: boolean) => {
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
      // Also refresh context
      refreshCameras();
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
  }, [cameras, loadCameras, refreshCameras, t]);

  const handleDeleteCamera = useCallback(async (id: string) => {
    if (confirm('Are you sure you want to delete this camera?')) {
      try {
        await cameraApi.deleteCamera(id);
        await loadCameras();
        refreshCameras(); // Sync with context
        toast.success(t('camera_deleted'));
      } catch (error: any) {
        console.error('Failed to delete camera:', error);
        // Don't show generic error - show the actual error message
        const errorMessage = error.response?.data?.detail || error.message || t('camera_failed_delete');
        toast.error(`Failed to delete camera: ${errorMessage}`);
        // Don't reload cameras on error - keep the list as is
      }
    }
  }, [loadCameras, refreshCameras, t]);

  const handleEditCamera = useCallback((camera: CameraType) => {
    setEditingCamera(camera);
    // Open edit modal or navigate to edit page
    toast('Edit functionality coming soon');
  }, []);

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
              <p className="stat-label">{lang === 'vi' ? 'Tổng Camera' : 'Total Cameras'}</p>
              <p className="stat-value">{cameras.length}</p>
            </div>
            <Camera className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">{lang === 'vi' ? 'Đang hoạt động' : 'Active'}</p>
              <p className="stat-value">{cameras.filter(c => c.is_active).length}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">{lang === 'vi' ? 'Tổng người trong khu vực' : 'People in Zones'}</p>
              <p className="stat-value">{totalPeople}</p>
            </div>
            <Users className="w-8 h-8 text-purple-600" />
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">{lang === 'vi' ? 'Offline' : 'Offline'}</p>
              <p className="stat-value">{cameras.filter(c => !c.is_active).length}</p>
            </div>
            <Clock className="w-8 h-8 text-slate-400" />
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
            realtimeCount={realtimeCounts[camera.id]}
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
