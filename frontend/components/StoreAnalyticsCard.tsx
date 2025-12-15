'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Store as StoreIcon, 
  Camera, 
  ChevronDown, 
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Clock,
  TrendingUp,
  Activity
} from 'lucide-react';

interface CameraStats {
  cameraId: string;
  cameraName: string;
  countIn: number;
  countOut: number;
  lastUpdated: Date;
}

interface StoreAnalyticsCardProps {
  storeId: string;
  storeName: string;
  countIn: number;
  countOut: number;
  netInside: number;
  cameras: CameraStats[];
  lastUpdate: Date;
  isExpanded?: boolean;
  lang?: 'en' | 'vi';
  variant?: 'default' | 'compact';
}

export default function StoreAnalyticsCard({
  storeId,
  storeName,
  countIn,
  countOut,
  netInside,
  cameras,
  lastUpdate,
  isExpanded: initialExpanded = false,
  lang = 'en',
  variant = 'default',
}: StoreAnalyticsCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return lang === 'vi' ? `${diff} giây trước` : `${diff}s ago`;
    if (diff < 3600) return lang === 'vi' ? `${Math.floor(diff / 60)} phút trước` : `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return lang === 'vi' ? `${Math.floor(diff / 3600)} giờ trước` : `${Math.floor(diff / 3600)}h ago`;
    // Show date/time in UTC+7
    return date.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate conversion rate (out/in ratio)
  const conversionRate = countIn > 0 ? ((countOut / countIn) * 100).toFixed(1) : '0';

  if (variant === 'compact') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl overflow-hidden hover:border-slate-600 transition-colors"
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                <StoreIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100">{storeName}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Camera className="w-3 h-3" />
                  {cameras.length} {lang === 'vi' ? 'camera' : 'cameras'}
                </p>
              </div>
            </div>
          </div>
          
          {cameras.length === 0 ? (
            <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-4 text-center">
              <Camera className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="text-sm text-amber-200 font-medium mb-1">
                {lang === 'vi' ? 'Chưa có camera' : 'No cameras assigned'}
              </p>
              <p className="text-xs text-amber-300/80">
                {lang === 'vi' ? 'Thêm camera trong Quản lý nhóm' : 'Assign cameras in Team Management'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-green-900/20 border border-green-700/30 rounded-lg">
                <p className="text-lg font-bold text-green-400">{countIn}</p>
                <p className="text-xs text-green-300/70">{lang === 'vi' ? 'Vào' : 'In'}</p>
              </div>
              <div className="text-center p-2 bg-blue-900/20 border border-blue-700/30 rounded-lg">
                <p className="text-lg font-bold text-blue-400">{countOut}</p>
                <p className="text-xs text-blue-300/70">{lang === 'vi' ? 'Ra' : 'Out'}</p>
              </div>
              <div className="text-center p-2 bg-purple-900/20 border border-purple-700/30 rounded-lg">
                <p className="text-lg font-bold text-purple-400">{Math.max(0, netInside)}</p>
                <p className="text-xs text-purple-300/70">{lang === 'vi' ? 'Trong' : 'Inside'}</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div 
        className="p-5 cursor-pointer hover:bg-slate-700/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
              <StoreIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-100">{storeName}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Camera className="w-3 h-3" />
                  {cameras.length} {lang === 'vi' ? 'camera' : 'cameras'}
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(lastUpdate)}
                </span>
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-8">
              <div className="text-center">
                <div className="flex items-center gap-1 text-green-400">
                  <ArrowUpRight className="w-4 h-4" />
                  <span className="text-2xl font-bold">{countIn.toLocaleString()}</span>
                </div>
                <p className="text-xs text-slate-500">{lang === 'vi' ? 'Vào' : 'In'}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-blue-400">
                  <ArrowDownRight className="w-4 h-4" />
                  <span className="text-2xl font-bold">{countOut.toLocaleString()}</span>
                </div>
                <p className="text-xs text-slate-500">{lang === 'vi' ? 'Ra' : 'Out'}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-purple-400">
                  <Users className="w-4 h-4" />
                  <span className="text-2xl font-bold">{Math.max(0, netInside)}</span>
                </div>
                <p className="text-xs text-slate-500">{lang === 'vi' ? 'Đang trong' : 'Inside'}</p>
              </div>
            </div>
            
            <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4 md:hidden">
          <div className="text-center p-2 bg-green-900/20 border border-green-700/30 rounded-lg">
            <p className="text-lg font-bold text-green-400">{countIn}</p>
            <p className="text-xs text-green-300/70">{lang === 'vi' ? 'Vào' : 'In'}</p>
          </div>
          <div className="text-center p-2 bg-blue-900/20 border border-blue-700/30 rounded-lg">
            <p className="text-lg font-bold text-blue-400">{countOut}</p>
            <p className="text-xs text-blue-300/70">{lang === 'vi' ? 'Ra' : 'Out'}</p>
          </div>
          <div className="text-center p-2 bg-purple-900/20 border border-purple-700/30 rounded-lg">
            <p className="text-lg font-bold text-purple-400">{Math.max(0, netInside)}</p>
            <p className="text-xs text-purple-300/70">{lang === 'vi' ? 'Trong' : 'Inside'}</p>
          </div>
        </div>
      </div>

      {/* Expanded Camera Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-slate-700/50">
              <div className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    {lang === 'vi' ? 'Chi tiết theo camera' : 'Camera Breakdown'}
                  </h4>
                  <div className="flex items-center gap-2 text-xs">
                    <TrendingUp className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-400">
                      {lang === 'vi' ? 'Tỷ lệ ra/vào:' : 'Exit rate:'} 
                      <span className="text-blue-400 font-semibold ml-1">{conversionRate}%</span>
                    </span>
                  </div>
                </div>

                {cameras.length === 0 ? (
                  <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-6 text-center">
                    <Camera className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                    <p className="text-sm text-amber-200 font-medium mb-2">
                      {lang === 'vi' ? 'Chưa có camera được gán' : 'No cameras assigned to this store'}
                    </p>
                    <p className="text-xs text-amber-300/80 mb-3">
                      {lang === 'vi' 
                        ? 'Vào Quản lý nhóm → Quản lý phân công camera để thêm camera cho cửa hàng này' 
                        : 'Go to Team Management → Manage Camera Assignments to add cameras to this store'}
                    </p>
                    <a 
                      href="/managers" 
                      className="inline-block text-xs px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 rounded border border-amber-500/50 transition-colors"
                    >
                      {lang === 'vi' ? 'Quản lý nhóm' : 'Team Management'}
                    </a>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {cameras.map((camera, idx) => (
                      <motion.div
                        key={camera.cameraId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 hover:border-slate-600/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
                            <Camera className="w-4 h-4 text-slate-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-200">{camera.cameraName}</p>
                            <p className="text-xs text-slate-500">{formatTime(camera.lastUpdated)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-green-400 font-semibold">{camera.countIn}</span>
                            <span className="text-xs text-slate-500 ml-1">{lang === 'vi' ? 'vào' : 'in'}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-blue-400 font-semibold">{camera.countOut}</span>
                            <span className="text-xs text-slate-500 ml-1">{lang === 'vi' ? 'ra' : 'out'}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

