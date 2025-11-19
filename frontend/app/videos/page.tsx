'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/contexts/AuthContext';
import {
  Video,
  Download,
  Play,
  Calendar,
  Camera,
  AlertTriangle,
  Search,
  Filter,
  Clock,
  FileVideo,
  Trash2,
  Eye
} from 'lucide-react';

interface SavedVideo {
  id: string;
  filename: string;
  cameraName: string;
  storeName: string;
  timestamp: Date;
  duration: number; // in seconds
  behavior: string;
  accuracy: number;
  size: number; // in MB
  thumbnail?: string;
}

export default function VideosPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<SavedVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [behaviorFilter, setBehaviorFilter] = useState<string>('all');
  const [selectedVideo, setSelectedVideo] = useState<SavedVideo | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    loadVideos();
  }, [isAuthenticated, router]);

  useEffect(() => {
    let filtered = videos;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(v =>
        v.filename.toLowerCase().includes(query) ||
        v.cameraName.toLowerCase().includes(query) ||
        v.storeName.toLowerCase().includes(query) ||
        v.behavior.toLowerCase().includes(query)
      );
    }

    if (behaviorFilter !== 'all') {
      filtered = filtered.filter(v => v.behavior === behaviorFilter);
    }

    setFilteredVideos(filtered);
  }, [videos, searchQuery, behaviorFilter]);

  const loadVideos = async () => {
    try {
      setIsLoading(true);
      // TODO: Replace with real API call
      // const response = await videosApi.getVideoClips();
      
      // Mock data - simulating saved videos with format: 9h30_80_shoplifting.mp4
      const mockVideos: SavedVideo[] = [
        {
          id: '1',
          filename: '9h30_80_shoplifting.mp4',
          cameraName: 'Entrance Camera',
          storeName: 'Main Store',
          timestamp: new Date(Date.now() - 2 * 3600000), // 2 hours ago
          duration: 45,
          behavior: 'shoplifting',
          accuracy: 80,
          size: 12.5
        },
        {
          id: '2',
          filename: '10h15_72_loitering.mp4',
          cameraName: 'Aisle 3 Camera',
          storeName: 'Main Store',
          timestamp: new Date(Date.now() - 1 * 3600000), // 1 hour ago
          duration: 120,
          behavior: 'loitering',
          accuracy: 72,
          size: 28.3
        },
        {
          id: '3',
          filename: '11h00_90_crowd.mp4',
          cameraName: 'Checkout Camera',
          storeName: 'Branch Store',
          timestamp: new Date(Date.now() - 30 * 60000), // 30 minutes ago
          duration: 60,
          behavior: 'crowd',
          accuracy: 90,
          size: 15.8
        },
        {
          id: '4',
          filename: '8h45_85_fighting.mp4',
          cameraName: 'Security Camera 2',
          storeName: 'Main Store',
          timestamp: new Date(Date.now() - 3 * 3600000), // 3 hours ago
          duration: 30,
          behavior: 'fighting',
          accuracy: 85,
          size: 8.2
        },
        {
          id: '5',
          filename: '12h30_78_shoplifting.mp4',
          cameraName: 'Aisle 1 Camera',
          storeName: 'Branch Store',
          timestamp: new Date(Date.now() - 15 * 60000), // 15 minutes ago
          duration: 90,
          behavior: 'shoplifting',
          accuracy: 78,
          size: 22.1
        }
      ];

      setVideos(mockVideos);
    } catch (error: any) {
      console.error('Failed to load videos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getBehaviorColor = (behavior: string) => {
    const colors: Record<string, string> = {
      shoplifting: 'bg-red-100 text-red-800 border-red-200',
      loitering: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      crowd: 'bg-orange-100 text-orange-800 border-orange-200',
      fighting: 'bg-red-100 text-red-800 border-red-200',
      default: 'bg-blue-100 text-blue-800 border-blue-200'
    };
    return colors[behavior] || colors.default;
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 80) return 'text-green-600';
    if (accuracy >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const uniqueBehaviors = Array.from(new Set(videos.map(v => v.behavior)));

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
            View and manage behavior detection video recordings
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search videos by name, camera, store, or behavior..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input bg-slate-800 border-slate-700 pl-10 w-full"
          />
        </div>
        <div className="relative">
          <Filter className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            value={behaviorFilter}
            onChange={(e) => setBehaviorFilter(e.target.value)}
            className="input bg-slate-800 border-slate-700 pl-10 pr-8"
          >
            <option value="all">All Behaviors</option>
            {uniqueBehaviors.map(behavior => (
              <option key={behavior} value={behavior} className="capitalize">
                {behavior}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Videos Grid */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="p-12 text-center">
            <FileVideo className="w-16 h-16 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">
              {searchQuery || behaviorFilter !== 'all' ? 'No videos match your filters' : 'No videos saved yet'}
            </p>
            <p className="text-slate-500 text-sm">
              Videos will appear here when behavior is detected and saved
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {filteredVideos.map((video) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden hover:border-slate-600 transition-colors group"
              >
                {/* Video Thumbnail */}
                <div className="relative bg-slate-800 aspect-video flex items-center justify-center">
                  {video.thumbnail ? (
                    <img src={video.thumbnail} alt={video.filename} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <Video className="w-16 h-16 text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">{video.filename}</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => setSelectedVideo(video)}
                      className="p-3 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
                      title="Play video"
                    >
                      <Play className="w-5 h-5 text-white fill-white" />
                    </button>
                    <button
                      className="p-3 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"
                      title="Download video"
                    >
                      <Download className="w-5 h-5 text-white" />
                    </button>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getBehaviorColor(video.behavior)}`}>
                      {video.behavior}
                    </span>
                  </div>
                  <div className="absolute bottom-2 left-2">
                    <span className="px-2 py-1 bg-black/70 rounded text-xs text-white">
                      {formatDuration(video.duration)}
                    </span>
                  </div>
                </div>

                {/* Video Info */}
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200 truncate" title={video.filename}>
                      {video.filename}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <Camera className="w-3 h-3" />
                      <span>{video.cameraName}</span>
                      <span className="mx-1">•</span>
                      <span>{video.storeName}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimeAgo(video.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${getAccuracyColor(video.accuracy)}`}>
                        {video.accuracy}%
                      </span>
                      <span className="text-slate-500">accuracy</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-700">
                    <div className="text-xs text-slate-400">
                      {video.size.toFixed(1)} MB
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
              <div className="bg-slate-900 rounded-lg aspect-video flex items-center justify-center border border-slate-700">
                <div className="text-center">
                  <Video className="w-20 h-20 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">Video player will be implemented here</p>
                  <p className="text-slate-500 text-sm mt-2">{selectedVideo.filename}</p>
                </div>
              </div>

              {/* Video Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Camera</p>
                  <p className="text-slate-200 font-medium">{selectedVideo.cameraName}</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Store</p>
                  <p className="text-slate-200 font-medium">{selectedVideo.storeName}</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Behavior Detected</p>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${getBehaviorColor(selectedVideo.behavior)}`}>
                    {selectedVideo.behavior}
                  </span>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Accuracy</p>
                  <p className={`text-slate-200 font-semibold ${getAccuracyColor(selectedVideo.accuracy)}`}>
                    {selectedVideo.accuracy}%
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Duration</p>
                  <p className="text-slate-200 font-medium">{formatDuration(selectedVideo.duration)}</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">File Size</p>
                  <p className="text-slate-200 font-medium">{selectedVideo.size.toFixed(1)} MB</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 col-span-2">
                  <p className="text-xs text-slate-400 mb-1">Recorded At</p>
                  <p className="text-slate-200 font-medium">{formatDate(selectedVideo.timestamp)}</p>
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

