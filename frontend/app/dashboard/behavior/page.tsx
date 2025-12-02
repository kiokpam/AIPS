'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/src/contexts/I18nContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { authApi } from '@/lib/api';
import { Shield, Users, Activity, AlertTriangle, Eye, Zap, TrendingUp, MapPin, Clock } from 'lucide-react';

interface StoreStatus {
  storeId: string;
  storeName: string;
  currentPeople: number;
  capacity: number;
  alerts: number;
  lastUpdate: Date;
}

interface BehaviorEvent {
  id: string;
  type: string;
  storeName: string;
  cameraName: string;
  confidence: number;
  timestamp: Date;
  description: string;
}

export default function BehaviorDashboardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [stores, setStores] = useState<StoreStatus[]>([]);
  const [behaviorEvents, setBehaviorEvents] = useState<BehaviorEvent[]>([]);
  const [totalPeople, setTotalPeople] = useState(0);

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
    // Mock real-time data - replace with WebSocket or polling
    const mockStores: StoreStatus[] = [
      {
        storeId: '1',
        storeName: 'Main Store',
        currentPeople: 45,
        capacity: 100,
        alerts: 2,
        lastUpdate: new Date()
      },
      {
        storeId: '2',
        storeName: 'Branch Store',
        currentPeople: 23,
        capacity: 80,
        alerts: 0,
        lastUpdate: new Date()
      }
    ];

    const mockEvents: BehaviorEvent[] = [
      {
        id: '1',
        type: 'shoplifting',
        storeName: 'Main Store',
        cameraName: 'Entrance Camera',
        confidence: 85,
        timestamp: new Date(Date.now() - 2 * 60000),
        description: 'Potential shoplifting behavior detected'
      },
      {
        id: '2',
        type: 'violence',
        storeName: 'Main Store',
        cameraName: 'Aisle 3 Camera',
        confidence: 78,
        timestamp: new Date(Date.now() - 5 * 60000),
        description: 'Violent behavior detected - immediate attention required'
      },
      {
        id: '3',
        type: 'normal',
        storeName: 'Branch Store',
        cameraName: 'Checkout Camera',
        confidence: 95,
        timestamp: new Date(Date.now() - 10 * 60000),
        description: 'Normal customer activity'
      }
    ];

    setStores(mockStores);
    setBehaviorEvents(mockEvents);
    setTotalPeople(mockStores.reduce((sum, s) => sum + s.currentPeople, 0));

    // Simulate real-time updates every 5 seconds
    const interval = setInterval(() => {
      setStores(prev => {
        const updated = prev.map(store => ({
          ...store,
          currentPeople: Math.max(0, store.currentPeople + Math.floor(Math.random() * 6 - 3)),
          lastUpdate: new Date()
        }));
        setTotalPeople(updated.reduce((sum, s) => sum + s.currentPeople, 0));
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

  const getBehaviorColor = (type: string) => {
    const colors: Record<string, string> = {
      shoplifting: 'bg-red-100 text-red-800 border-red-200',
      violence: 'bg-purple-100 text-purple-800 border-purple-200',
      normal: 'bg-green-100 text-green-800 border-green-200',
      default: 'bg-blue-100 text-blue-800 border-blue-200'
    };
    return colors[type] || colors.default;
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <Activity className="w-8 h-8" />
            Behavior Monitoring
          </h1>
          <p className="text-slate-300 mt-1">Real-time behavior detection and store occupancy</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-900/20 border border-green-700/50 rounded-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-green-300 text-sm font-medium">Live</span>
        </div>
      </div>

      {/* Total People Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm mb-1">Total People in Stores</p>
            <p className="text-4xl font-bold">{totalPeople}</p>
            <p className="text-blue-100 text-sm mt-2">Across {stores.length} stores</p>
          </div>
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
            <Users className="w-10 h-10" />
          </div>
        </div>
      </motion.div>

      {/* Store Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stores.map((store) => {
          const occupancyPercent = (store.currentPeople / store.capacity) * 100;
          const isHighOccupancy = occupancyPercent > 80;
          
          return (
            <motion.div
              key={store.storeId}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-800 rounded-xl border border-slate-700 p-6 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-semibold text-slate-100">{store.storeName}</h3>
                </div>
                {store.alerts > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-red-900/30 border border-red-700 rounded text-red-300 text-xs">
                    <AlertTriangle className="w-3 h-3" />
                    {store.alerts}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">Current Occupancy</span>
                    <span className={`text-sm font-semibold ${isHighOccupancy ? 'text-red-400' : 'text-green-400'}`}>
                      {store.currentPeople} / {store.capacity}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        isHighOccupancy ? 'bg-red-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(occupancyPercent, 100)}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {occupancyPercent.toFixed(1)}% capacity
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Clock className="w-3 h-3" />
                  Updated {formatTime(store.lastUpdate)}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Behavior Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Behavior Events */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-xl border border-slate-700 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-400" />
              Recent Behavior Events
            </h2>
            <span className="px-2 py-1 bg-purple-900/30 border border-purple-700 rounded text-purple-300 text-xs">
              {behaviorEvents.length} active
            </span>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {behaviorEvents.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No behavior events detected</p>
              </div>
            ) : (
              behaviorEvents.map((event) => (
                <div
                  key={event.id}
                  className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-400" />
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getBehaviorColor(event.type)}`}>
                        {event.type}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">{formatTime(event.timestamp)}</span>
                  </div>
                  <p className="text-sm text-slate-200 font-medium mb-1">{event.description}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {event.storeName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      {event.cameraName}
                    </span>
                    <span className="text-blue-400 font-medium">
                      {event.confidence}% confidence
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Behavior Statistics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-xl border border-slate-700 p-6"
        >
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-400" />
            Behavior Statistics
          </h2>

          <div className="space-y-4">
            {Object.entries(
              behaviorEvents.reduce((acc, event) => {
                acc[event.type] = (acc[event.type] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    type === 'shoplifting' ? 'bg-red-500' :
                    type === 'violence' ? 'bg-purple-500' :
                    type === 'normal' ? 'bg-green-500' : 'bg-blue-500'
                  }`}></div>
                  <span className="text-slate-200 capitalize">{type}</span>
                </div>
                <span className="text-slate-100 font-semibold">{count}</span>
              </div>
            ))}

            {behaviorEvents.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No statistics available</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

