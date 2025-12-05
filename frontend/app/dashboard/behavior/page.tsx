'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/src/contexts/I18nContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { authApi, eventsApi, storeApi, cameraApi, clipsApi, type Alert, type Store, type Camera } from '@/lib/api';
import DashboardFilters from '@/components/DashboardFilters';
import { 
  Shield, 
  Activity, 
  AlertTriangle, 
  Eye, 
  Zap, 
  TrendingUp, 
  MapPin, 
  Clock,
  RefreshCw,
  CheckCircle,
  Bell,
  Video,
  Filter,
  ShoppingBag,
  Swords,
  ChevronRight,
  ExternalLink,
  Play,
  FileVideo
} from 'lucide-react';

export default function BehaviorDashboardPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [storeList, setStoreList] = useState<Store[]>([]);
  const [cameraList, setCameraList] = useState<Camera[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [selectedCameras, setSelectedCameras] = useState<string[]>([]);
  const [alertTypeFilter, setAlertTypeFilter] = useState<string>('all');

  // Filter alerts based on selections
  const filteredAlerts = useMemo(() => {
    let result = alerts;
    
    if (selectedStore !== 'all') {
      result = result.filter(a => a.store_id === selectedStore);
    }
    
    if (selectedCameras.length > 0) {
      result = result.filter(a => a.camera_id && selectedCameras.includes(a.camera_id));
    }
    
    if (alertTypeFilter !== 'all') {
      result = result.filter(a => a.anomaly_type?.toLowerCase() === alertTypeFilter);
    }
    
    return result;
  }, [alerts, selectedStore, selectedCameras, alertTypeFilter]);

  // Calculate stats per store
  const storeStats = useMemo(() => {
    const stats: Record<string, { total: number; unread: number; shoplifting: number; violence: number }> = {};
    
    storeList.forEach(store => {
      const storeAlerts = alerts.filter(a => a.store_id === store.id);
      stats[store.id] = {
        total: storeAlerts.length,
        unread: storeAlerts.filter(a => !a.acknowledged).length,
        shoplifting: storeAlerts.filter(a => a.anomaly_type?.toLowerCase().includes('shoplifting')).length,
        violence: storeAlerts.filter(a => a.anomaly_type?.toLowerCase().includes('violence')).length,
      };
    });
    
    return stats;
  }, [alerts, storeList]);

  // Alert type counts
  const alertTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAlerts.forEach(alert => {
      const type = alert.anomaly_type?.toLowerCase() || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [filteredAlerts]);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      
      const [storesData, camerasData, alertsData] = await Promise.all([
        storeApi.getStores(),
        cameraApi.getCameras(),
        eventsApi.getAlerts({ limit: 100 }),
      ]);
      
      setStoreList(storesData);
      setCameraList(camerasData);
      setAlerts(alertsData.alerts);
      setUnreadCount(alertsData.unread_count);
    } catch (err: any) {
      console.error('Failed to fetch behavior data:', err);
      setError(err.message || 'Failed to load data');
    }
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await eventsApi.acknowledgeAlert(alertId);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const handleAcknowledgeAll = async () => {
    try {
      await eventsApi.acknowledgeAllAlerts();
      await fetchData();
    } catch (err: any) {
      console.error('Failed to acknowledge all alerts:', err);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

    const checkAccess = async () => {
      if (!isAuthenticated || !user) {
        setIsLoading(false);
        return;
      }

      if (user.active_membership.role === 'manager') {
        setHasAccess(true);
        await fetchData();
        interval = setInterval(fetchData, 2000);  // Reduced from 10000ms to 2000ms for faster updates
        setIsLoading(false);
        return;
      }

      try {
        const permissions = await authApi.getMemberPermissions(
          user.active_membership.organization.id,
          user.active_membership.id
        );
        setHasAccess(permissions.can_access_dashboard);
        if (permissions.can_access_dashboard) {
          await fetchData();
          interval = setInterval(fetchData, 2000);  // Reduced from 10000ms to 2000ms for faster updates
        }
      } catch (error: any) {
        setHasAccess(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAccess();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated, user, fetchData]);

  if (isLoading || hasAccess === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-200 mb-2">
            {lang === 'vi' ? 'Từ chối truy cập' : 'Access Denied'}
          </h2>
          <p className="text-slate-400 mb-4">
            {lang === 'vi' ? 'Bạn không có quyền truy cập.' : "You don't have permission."}
          </p>
          <button onClick={() => router.push('/cameras')} className="btn-primary btn-md">
            {lang === 'vi' ? 'Đến trang Camera' : 'Go to Cameras'}
          </button>
        </div>
      </div>
    );
  }

  const formatTime = (dateStr: string | Date) => {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return lang === 'vi' ? `${diff}s trước` : `${diff}s ago`;
    if (diff < 3600) return lang === 'vi' ? `${Math.floor(diff / 60)}m trước` : `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return lang === 'vi' ? `${Math.floor(diff / 3600)}h trước` : `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  const getBehaviorStyles = (type: string) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('shoplifting') || t.includes('theft')) {
      return {
        bg: 'bg-red-500/10 border-red-500/30',
        text: 'text-red-400',
        icon: <ShoppingBag className="w-4 h-4" />,
        badge: 'bg-red-900/50 text-red-300 border-red-700/50',
      };
    }
    if (t.includes('violence') || t.includes('fight')) {
      return {
        bg: 'bg-purple-500/10 border-purple-500/30',
        text: 'text-purple-400',
        icon: <Swords className="w-4 h-4" />,
        badge: 'bg-purple-900/50 text-purple-300 border-purple-700/50',
      };
    }
    return {
      bg: 'bg-yellow-500/10 border-yellow-500/30',
      text: 'text-yellow-400',
      icon: <AlertTriangle className="w-4 h-4" />,
      badge: 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50',
    };
  };

  const unacknowledgedAlerts = filteredAlerts.filter(a => !a.acknowledged);
  const filteredUnreadCount = unacknowledgedAlerts.length;

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                <Activity className="w-5 h-5" />
              </div>
              {lang === 'vi' ? 'Giám sát hành vi' : 'Behavior Monitoring'}
            </h1>
            <p className="text-slate-400 mt-1 text-sm">
              {lang === 'vi' ? 'Phát hiện shoplifting và violence theo thời gian thực' : 'Real-time shoplifting & violence detection'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            <div className="flex items-center gap-2 px-3 py-2 bg-green-900/20 border border-green-700/30 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-green-300 text-xs font-medium">Live</span>
            </div>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <DashboardFilters
            stores={storeList}
            cameras={cameraList}
            selectedStore={selectedStore}
            selectedCameras={selectedCameras}
            onStoreChange={setSelectedStore}
            onCamerasChange={setSelectedCameras}
            lang={lang}
          />

          {/* Alert Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <div className="flex bg-slate-800/80 border border-slate-700 rounded-lg p-1">
              <button
                onClick={() => setAlertTypeFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  alertTypeFilter === 'all'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'vi' ? 'Tất cả' : 'All'}
              </button>
              <button
                onClick={() => setAlertTypeFilter('shoplifting')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  alertTypeFilter === 'shoplifting'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShoppingBag className="w-3 h-3" />
                Shoplifting
              </button>
              <button
                onClick={() => setAlertTypeFilter('violence')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  alertTypeFilter === 'violence'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Swords className="w-3 h-3" />
                Violence
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-red-500/20 to-orange-600/10 border border-red-500/30 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-300/80 text-xs font-medium uppercase tracking-wide mb-1">
                {lang === 'vi' ? 'Chưa xử lý' : 'Unread'}
              </p>
              <p className="text-3xl font-bold text-red-400">{filteredUnreadCount}</p>
              <p className="text-xs text-slate-500 mt-1">{lang === 'vi' ? 'cảnh báo mới' : 'new alerts'}</p>
            </div>
            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center relative">
              <Bell className="w-6 h-6 text-red-400" />
              {filteredUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                  {filteredUnreadCount > 9 ? '9+' : filteredUnreadCount}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-gradient-to-br from-red-600/20 to-rose-600/10 border border-red-600/30 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-300/80 text-xs font-medium uppercase tracking-wide mb-1">
                Shoplifting
              </p>
              <p className="text-3xl font-bold text-red-400">{alertTypeCounts['shoplifting'] || 0}</p>
              <p className="text-xs text-slate-500 mt-1">{lang === 'vi' ? 'phát hiện' : 'detected'}</p>
            </div>
            <div className="w-12 h-12 bg-red-600/20 rounded-xl flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-red-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-purple-500/20 to-pink-600/10 border border-purple-500/30 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-300/80 text-xs font-medium uppercase tracking-wide mb-1">
                Violence
              </p>
              <p className="text-3xl font-bold text-purple-400">{alertTypeCounts['violence'] || 0}</p>
              <p className="text-xs text-slate-500 mt-1">{lang === 'vi' ? 'phát hiện' : 'detected'}</p>
            </div>
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <Swords className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-gradient-to-br from-blue-500/20 to-cyan-600/10 border border-blue-500/30 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-300/80 text-xs font-medium uppercase tracking-wide mb-1">
                {lang === 'vi' ? 'Tổng cảnh báo' : 'Total Alerts'}
              </p>
              <p className="text-3xl font-bold text-blue-400">{filteredAlerts.length}</p>
              <p className="text-xs text-slate-500 mt-1">{cameraList.filter(c => c.is_active).length} {lang === 'vi' ? 'camera' : 'cameras'}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 overflow-hidden"
        >
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-400" />
              {lang === 'vi' ? 'Cảnh báo gần đây' : 'Recent Alerts'}
              {filteredUnreadCount > 0 && (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs font-medium">
                  {filteredUnreadCount} {lang === 'vi' ? 'mới' : 'new'}
                </span>
              )}
            </h2>
            {unacknowledgedAlerts.length > 0 && (
              <button
                onClick={handleAcknowledgeAll}
                className="text-xs px-3 py-1.5 bg-green-900/30 border border-green-700/50 rounded-lg text-green-300 hover:bg-green-900/50 transition-colors flex items-center gap-1.5"
              >
                <CheckCircle className="w-3 h-3" />
                {lang === 'vi' ? 'Đánh dấu tất cả đã đọc' : 'Mark all read'}
              </button>
            )}
          </div>

          <div className="max-h-[600px] overflow-y-auto">
            {filteredAlerts.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Eye className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium text-slate-400">
                  {lang === 'vi' ? 'Không có cảnh báo' : 'No alerts found'}
                </p>
                <p className="text-sm mt-1">
                  {lang === 'vi' 
                    ? 'Cảnh báo sẽ xuất hiện khi AI phát hiện shoplifting hoặc violence'
                    : 'Alerts appear when AI detects shoplifting or violence'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                <AnimatePresence>
                  {filteredAlerts.map((alert, idx) => {
                    const styles = getBehaviorStyles(alert.anomaly_type || '');
                    return (
                      <motion.div
                        key={alert.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: idx * 0.02 }}
                        className={`p-4 hover:bg-slate-700/20 transition-colors ${
                          alert.acknowledged ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${styles.bg} border`}>
                            <span className={styles.text}>{styles.icon}</span>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${styles.badge}`}>
                                  {alert.anomaly_type || 'unknown'}
                                </span>
                                {alert.confidence && (
                                  <span className="text-xs text-blue-400 font-medium">
                                    {(alert.confidence * 100).toFixed(0)}%
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs text-slate-500">{formatTime(alert.timestamp)}</span>
                                {!alert.acknowledged && (
                                  <button
                                    onClick={() => handleAcknowledgeAlert(alert.id)}
                                    className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
                                    title={lang === 'vi' ? 'Đánh dấu đã đọc' : 'Mark as read'}
                                  >
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            <p className="text-sm text-slate-200 font-medium mb-2 line-clamp-2">
                              {alert.message}
                            </p>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 text-xs text-slate-500">
                                {alert.store_name && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {alert.store_name}
                                  </span>
                                )}
                                {alert.camera_name && (
                                  <span className="flex items-center gap-1">
                                    <Video className="w-3 h-3" />
                                    {alert.camera_name}
                                  </span>
                                )}
                              </div>
                              
                              {alert.clip_ref && (
                                <a
                                  href={clipsApi.getClipUrl(alert.clip_ref)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors"
                                  title={lang === 'vi' ? 'Xem video' : 'View video'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                  }}
                                >
                                  <Play className="w-3 h-3" />
                                  <span>{lang === 'vi' ? 'Xem video' : 'View Video'}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>

        {/* Side Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Store Breakdown */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-400" />
              {lang === 'vi' ? 'Theo cửa hàng' : 'By Store'}
            </h3>
            
            <div className="space-y-2">
              {storeList.length === 0 ? (
                <p className="text-center text-slate-500 py-4 text-sm">
                  {lang === 'vi' ? 'Chưa có cửa hàng' : 'No stores'}
                </p>
              ) : (
                storeList.map(store => {
                  const stats = storeStats[store.id] || { total: 0, unread: 0, shoplifting: 0, violence: 0 };
                  return (
                    <div 
                      key={store.id}
                      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedStore === store.id 
                          ? 'bg-blue-900/30 border-blue-700/50'
                          : 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600/50'
                      }`}
                      onClick={() => setSelectedStore(selectedStore === store.id ? 'all' : store.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-200">{store.name}</span>
                        {stats.unread > 0 && (
                          <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-xs font-medium">
                            {stats.unread}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-red-400 flex items-center gap-1">
                          <ShoppingBag className="w-3 h-3" />
                          {stats.shoplifting}
                        </span>
                        <span className="text-purple-400 flex items-center gap-1">
                          <Swords className="w-3 h-3" />
                          {stats.violence}
                        </span>
                        <span className="text-slate-500 ml-auto">
                          {stats.total} total
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              {lang === 'vi' ? 'Truy cập nhanh' : 'Quick Access'}
            </h3>
            
            <div className="space-y-2">
              <button
                onClick={() => router.push('/videos')}
                className="w-full p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg hover:border-slate-600/50 transition-colors text-left flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <Video className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-slate-300">{lang === 'vi' ? 'Video đã lưu' : 'Saved Videos'}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>
              
              <button
                onClick={() => router.push('/cameras')}
                className="w-full p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg hover:border-slate-600/50 transition-colors text-left flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <Video className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-slate-300">{lang === 'vi' ? 'Quản lý camera' : 'Manage Cameras'}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>
            </div>
          </div>

          {/* System Status */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-400" />
              {lang === 'vi' ? 'Trạng thái hệ thống' : 'System Status'}
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{lang === 'vi' ? 'Camera hoạt động' : 'Active Cameras'}</span>
                <span className="text-green-400 font-medium">{cameraList.filter(c => c.is_active).length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{lang === 'vi' ? 'Cửa hàng' : 'Stores'}</span>
                <span className="text-slate-300 font-medium">{storeList.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{lang === 'vi' ? 'Cập nhật' : 'Refresh'}</span>
                <span className="text-slate-400">10s</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
