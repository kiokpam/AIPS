'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/src/contexts/I18nContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { authApi } from '@/lib/api';
import { Shield, Users, TrendingUp, TrendingDown, BarChart3, Clock, MapPin, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface CameraInOutStats {
  cameraId: string;
  cameraName: string;
  storeName: string;
  countIn: number;
  countOut: number;
  cumulative: number;
  countInToday: number;
  countOutToday: number;
  lastUpdate: Date;
}

export default function InOutDashboardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [cameras, setCameras] = useState<CameraInOutStats[]>([]);
  const [totalIn, setTotalIn] = useState(0);
  const [totalOut, setTotalOut] = useState(0);
  const [totalCumulative, setTotalCumulative] = useState(0);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const checkAccess = async () => {
      if (!isAuthenticated || !user) {
        setIsLoading(false);
        return;
      }

      // Managers always have access
      if (user.active_membership.role === 'manager') {
        setHasAccess(true);
        cleanup = startRealTimeUpdates();
        setIsLoading(false);
        return;
      }

      // Check member permissions
      try {
        const permissions = await authApi.getMemberPermissions(
          user.active_membership.organization.id,
          user.active_membership.id
        );
        setHasAccess(permissions.can_access_dashboard);
        if (permissions.can_access_dashboard) {
          cleanup = startRealTimeUpdates();
        }
      } catch (error: any) {
        setHasAccess(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAccess();

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [isAuthenticated, user]);

  const startRealTimeUpdates = () => {
    // Placeholder data - will be replaced with real API calls when AI services are integrated
    const mockCameras: CameraInOutStats[] = [
      {
        cameraId: '1',
        cameraName: 'Entrance Camera',
        storeName: 'Main Store',
        countIn: 145,
        countOut: 132,
        cumulative: 13,
        countInToday: 145,
        countOutToday: 132,
        lastUpdate: new Date()
      },
      {
        cameraId: '2',
        cameraName: 'Exit Camera',
        storeName: 'Main Store',
        countIn: 0,
        countOut: 0,
        cumulative: 0,
        countInToday: 0,
        countOutToday: 0,
        lastUpdate: new Date()
      },
      {
        cameraId: '3',
        cameraName: 'Side Entrance',
        storeName: 'Branch Store',
        countIn: 89,
        countOut: 87,
        cumulative: 2,
        countInToday: 89,
        countOutToday: 87,
        lastUpdate: new Date()
      }
    ];

    setCameras(mockCameras);
    setTotalIn(mockCameras.reduce((sum, c) => sum + c.countInToday, 0));
    setTotalOut(mockCameras.reduce((sum, c) => sum + c.countOutToday, 0));
    setTotalCumulative(mockCameras.reduce((sum, c) => sum + c.cumulative, 0));

    // Simulate real-time updates every 5 seconds
    const interval = setInterval(() => {
      setCameras(prev => {
        const updated = prev.map(camera => ({
          ...camera,
          lastUpdate: new Date()
        }));
        setTotalIn(updated.reduce((sum, c) => sum + c.countInToday, 0));
        setTotalOut(updated.reduce((sum, c) => sum + c.countOutToday, 0));
        setTotalCumulative(updated.reduce((sum, c) => sum + c.cumulative, 0));
        return updated;
      });
    }, 5000);

    return () => clearInterval(interval);
  };

  if (isLoading || hasAccess === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-200 mb-2">Access Denied</h2>
          <p className="text-slate-400 mb-4">You don't have permission to access the dashboard.</p>
          <button
            onClick={() => router.push('/cameras')}
            className="btn-primary btn-md"
          >
            Go to Cameras
          </button>
        </div>
      </div>
    );
  }

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-8 h-8" />
            In/Out Analytics
          </h1>
          <p className="text-slate-300 mt-1">Real-time people counting and entry/exit analytics</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-900/20 border border-green-700/50 rounded-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-green-300 text-sm font-medium">Live</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl p-6 text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm mb-1">Total In Today</p>
              <p className="text-4xl font-bold">{totalIn}</p>
              <p className="text-green-100 text-sm mt-2">People entered</p>
            </div>
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
              <ArrowUpRight className="w-10 h-10" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl p-6 text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">Total Out Today</p>
              <p className="text-4xl font-bold">{totalOut}</p>
              <p className="text-blue-100 text-sm mt-2">People exited</p>
            </div>
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
              <ArrowDownRight className="w-10 h-10" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm mb-1">Net Inside</p>
              <p className="text-4xl font-bold">{totalCumulative}</p>
              <p className="text-purple-100 text-sm mt-2">Currently inside</p>
            </div>
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
              <Users className="w-10 h-10" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Camera Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cameras.map((camera) => (
          <motion.div
            key={camera.cameraId}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl border border-slate-700 p-6 hover:border-slate-600 transition-colors"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">{camera.cameraName}</h3>
                  <p className="text-xs text-slate-400">{camera.storeName}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Today's Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-green-300">In Today</span>
                  </div>
                  <p className="text-2xl font-bold text-green-400">{camera.countInToday}</p>
                </div>
                <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-4 h-4 text-blue-400" />
                    <span className="text-xs text-blue-300">Out Today</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-400">{camera.countOutToday}</p>
                </div>
              </div>

              {/* Cumulative */}
              <div className="bg-purple-900/20 border border-purple-700/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-purple-300 mb-1">Net Inside</p>
                    <p className="text-xl font-bold text-purple-400">{camera.cumulative}</p>
                  </div>
                  <Users className="w-8 h-8 text-purple-400 opacity-50" />
                </div>
              </div>

              {/* All Time Stats */}
              <div className="pt-3 border-t border-slate-700">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>All Time</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(camera.lastUpdate)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Total In:</span>
                    <span className="text-slate-200 font-medium ml-1">{camera.countIn}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Total Out:</span>
                    <span className="text-slate-200 font-medium ml-1">{camera.countOut}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {cameras.length === 0 && (
        <div className="text-center py-12 bg-slate-800 rounded-xl border border-slate-700">
          <BarChart3 className="w-16 h-16 text-slate-400 mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold text-slate-200 mb-2">No In/Out Counting Data</h3>
          <p className="text-slate-400 mb-4">No cameras with in/out counting enabled yet.</p>
          <button
            onClick={() => router.push('/cameras')}
            className="btn-primary btn-md"
          >
            Go to Cameras
          </button>
        </div>
      )}
    </div>
  );
}

