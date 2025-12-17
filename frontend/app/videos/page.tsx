'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/src/contexts/AuthContext';
import { clipsApi, VideoClip } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Video,
  Download,
  Play,
  Calendar,
  Camera,
  AlertTriangle,
  Clock,
  FileVideo,
  Trash2,
  Eye,
  RefreshCw
} from 'lucide-react';

export default function VideosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const [videos, setVideos] = useState<VideoClip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<VideoClip | null>(null);

  const loadVideos = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await clipsApi.getClips({ limit: 100 });
      setVideos(response.clips);
      
      // Check if there's a clip query parameter and auto-select that video
      const clipParam = searchParams.get('clip');
      if (clipParam) {
        // Support both full path and bare filename passed in clip parameter
        const clipBase = clipParam.replace(/^.*[\\\/]/, '');
        const video = response.clips.find(v => v.filename === clipBase || v.id === clipBase || v.id === clipParam || v.filename === clipParam);
        if (video) {
          setSelectedVideo(video);
          // Remove the query parameter from URL after selecting
          router.replace('/videos', { scroll: false });
        } else {
          toast.error('Video not found');
          // Remove the query parameter if video not found
          router.replace('/videos', { scroll: false });
        }
      }
    } catch (error: any) {
      console.error('Failed to load videos:', error);
      // Don't show error toast if clips directory just doesn't exist yet
      if (error?.response?.status !== 404) {
        toast.error('Failed to load videos');
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    loadVideos();
  }, [isAuthenticated, router, loadVideos]);

  const handleDelete = async (video: VideoClip) => {
    if (!confirm(`Are you sure you want to delete "${video.filename}"?`)) {
      return;
    }

    try {
      await clipsApi.deleteClip(video.filename);
      setVideos(prev => prev.filter(v => v.id !== video.id));
      toast.success('Video deleted');
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to delete video');
    }
  };

  const handleDownload = (video: VideoClip) => {
    const url = clipsApi.getClipUrl(video.filename);
    const link = document.createElement('a');
    link.href = url;
    link.download = video.filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Bangkok',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDisplayName = (video: VideoClip) => {
    // Prefer camera name + behavior for readability
    const cam = video.camera_name || 'Unknown Camera';
    const behavior = video.behavior ? video.behavior.toUpperCase() : 'ANOMALY';
    return `${cam} – ${behavior}`;
  };

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getBehaviorColor = (behavior?: string) => {
    if (!behavior) return 'bg-slate-100 text-slate-800 border-slate-200';
    const colors: Record<string, string> = {
      shoplifting: 'bg-red-100 text-red-800 border-red-200',
      violence: 'bg-red-100 text-red-800 border-red-200',
      normal: 'bg-green-100 text-green-800 border-green-200',
      unknown: 'bg-slate-100 text-slate-800 border-slate-200',
    };
    return colors[behavior.toLowerCase()] || colors.unknown;
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-slate-500';
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Video className="w-8 h-8" />
            Saved Videos
          </h1>
          <p className="text-slate-400 mt-2">
            Video clips saved by AI when anomalies (shoplifting, violence) are detected
          </p>
        </div>
        <button
          onClick={loadVideos}
          className="btn-outline btn-md flex items-center gap-2"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Videos Grid */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-400 mt-4">Loading videos...</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="p-12 text-center">
            <FileVideo className="w-16 h-16 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">
              No videos saved yet
            </p>
            <p className="text-slate-500 text-sm">
              Videos will appear here when AI detects shoplifting or violence behavior
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {videos.map((video) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden hover:border-slate-600 transition-colors group"
              >
                {/* Video Thumbnail */}
                <div className="relative bg-slate-800 aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <Video className="w-16 h-16 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-300 px-2 truncate">
                      {formatDisplayName(video)}
                    </p>
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => setSelectedVideo(video)}
                      className="p-3 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
                      title="Play video"
                    >
                      <Play className="w-5 h-5 text-white fill-white" />
                    </button>
                    <button
                      onClick={() => handleDownload(video)}
                      className="p-3 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"
                      title="Download video"
                    >
                      <Download className="w-5 h-5 text-white" />
                    </button>
                  </div>
                  {video.behavior && (
                    <div className="absolute top-2 right-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getBehaviorColor(video.behavior)}`}>
                        {video.behavior}
                      </span>
                    </div>
                  )}
                  {video.duration_seconds && (
                    <div className="absolute bottom-2 left-2">
                      <span className="px-2 py-1 bg-black/70 rounded text-xs text-white">
                        {Math.floor(video.duration_seconds / 60)}:{(video.duration_seconds % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Video Info */}
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200 truncate" title={video.filename}>
                      {formatDisplayName(video)}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <Camera className="w-3 h-3" />
                      <span>{video.camera_name || 'Unknown Camera'}</span>
                      {video.store_name && (
                        <>
                          <span className="mx-1">•</span>
                          <span>{video.store_name}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1.5 text-xs text-slate-500 font-mono truncate" title={`Filename: ${video.filename}`}>
                      📁 {video.filename}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimeAgo(video.timestamp)}</span>
                    </div>
                    {video.confidence && (
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${getConfidenceColor(video.confidence)}`}>
                          {Math.round(video.confidence * 100)}%
                        </span>
                        <span className="text-slate-500">confidence</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-700">
                    <div className="text-xs text-slate-400">
                      {video.size_mb.toFixed(1)} MB
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedVideo(video)}
                        className="p-2 text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(video)}
                        className="p-2 text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Delete video"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Video Detail Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                  <Video className="w-6 h-6 text-blue-400" />
                  Video Details
                </h2>
                <p className="text-slate-400 mt-1">{selectedVideo.filename}</p>
              </div>
              <button
                onClick={() => setSelectedVideo(null)}
                className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <span className="text-2xl">×</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Video Player Area */}
              <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
                <video
                  key={selectedVideo.filename} // Force re-render when video changes
                  src={clipsApi.getClipUrl(selectedVideo.filename)}
                  controls
                  preload="auto"
                  crossOrigin="anonymous"
                  playsInline
                  className="w-full aspect-video bg-black"
                  onError={(e) => {
                    console.error('Video playback error:', e);
                    const video = e.target as HTMLVideoElement;
                    const error = video.error;
                    console.error('Video error details:', {
                      error: error ? {
                        code: error.code,
                        message: error.message
                      } : null,
                      networkState: video.networkState,
                      readyState: video.readyState,
                      src: video.src,
                      currentSrc: video.currentSrc
                    });
                    
                    // Provide helpful error messages based on error code
                    let errorMessage = 'Failed to load video';
                    if (error?.code === 4) {
                      // MEDIA_ERR_SRC_NOT_SUPPORTED - often auth/permission issue
                      errorMessage = 'Video not accessible. Your session may have expired - try refreshing the page.';
                    } else if (error?.code === 2) {
                      // MEDIA_ERR_NETWORK - network or auth issue
                      errorMessage = 'Network error loading video. Check your connection or refresh the page.';
                    } else if (error?.message) {
                      errorMessage = `Failed to load video: ${error.message}`;
                    }
                    
                    toast.error(errorMessage, { duration: 6000 });
                  }}
                  onLoadStart={() => console.log('Video loading started')}
                  onLoadedMetadata={(e) => {
                    const video = e.target as HTMLVideoElement;
                    console.log('Video metadata loaded', {
                      duration: video.duration,
                      videoWidth: video.videoWidth,
                      videoHeight: video.videoHeight
                    });
                  }}
                  onCanPlay={() => console.log('Video can play')}
                  onProgress={(e) => {
                    const video = e.target as HTMLVideoElement;
                    if (video.buffered.length > 0 && video.duration > 0) {
                      console.log('Video buffered:', (video.buffered.end(0) / video.duration * 100).toFixed(1), '%');
                    }
                  }}
                >
                  Your browser does not support the video tag.
                </video>
              </div>

              {/* Video Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Camera</p>
                  <p className="text-slate-200 font-medium">{selectedVideo.camera_name || 'Unknown'}</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Store</p>
                  <p className="text-slate-200 font-medium">{selectedVideo.store_name || 'Unknown'}</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Behavior Detected</p>
                  {selectedVideo.behavior ? (
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${getBehaviorColor(selectedVideo.behavior)}`}>
                      {selectedVideo.behavior}
                    </span>
                  ) : (
                    <span className="text-slate-500">Unknown</span>
                  )}
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Confidence</p>
                  {selectedVideo.confidence ? (
                    <p className={`text-slate-200 font-semibold ${getConfidenceColor(selectedVideo.confidence)}`}>
                      {Math.round(selectedVideo.confidence * 100)}%
                    </p>
                  ) : (
                    <span className="text-slate-500">N/A</span>
                  )}
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">File Size</p>
                  <p className="text-slate-200 font-medium">{selectedVideo.size_mb.toFixed(1)} MB</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Duration</p>
                  <p className="text-slate-200 font-medium">
                    {selectedVideo.duration_seconds 
                      ? `${Math.floor(selectedVideo.duration_seconds / 60)}:${(selectedVideo.duration_seconds % 60).toString().padStart(2, '0')}`
                      : 'Unknown'}
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 col-span-2">
                  <p className="text-xs text-slate-400 mb-1">Recorded At</p>
                  <p className="text-slate-200 font-medium">{formatDate(selectedVideo.timestamp)}</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 col-span-2">
                  <p className="text-xs text-slate-400 mb-1">Filename Structure</p>
                  <p className="text-slate-200 font-mono text-sm break-all mb-2">{selectedVideo.filename}</p>
                  <p className="text-xs text-slate-500">
                    Format: <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">camera_id_track_id_behavior_confidence.mp4</code>
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  onClick={() => setSelectedVideo(null)}
                  className="btn-outline btn-md"
                >
                  Close
                </button>
                <button
                  onClick={() => handleDownload(selectedVideo)}
                  className="btn-primary btn-md flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Video
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
