'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/src/contexts/I18nContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { authApi, eventsApi, storeApi, cameraApi, type Alert, type Store, type Camera } from '@/lib/api';
import { 
  Shield, 
  Users, 
  Activity, 
  AlertTriangle, 
  Eye, 
  Zap, 
  TrendingUp, 
  MapPin, 
  Clock,
  RefreshCw,
  CheckCircle,
  XCircle,
  Bell,
  Video
} from 'lucide-react';

interface StoreStatus {
  storeId: string;
  storeName: string;
  alerts: number;
  cameras: number;
  lastUpdate: Date;
}

export default function BehaviorDashboardPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [stores, setStores] = useState<StoreStatus[]>([]);
  const [storeList, setStoreList] = useState<Store[]>([]);
  const [cameraList, setCameraList] = useState<Camera[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch data from API
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      
      // Fetch stores, cameras, and alerts in parallel
      const [storesData, camerasData, alertsData] = await Promise.all([
        storeApi.getStores(),
        cameraApi.getCameras(),
        eventsApi.getAlerts({ limit: 50 }),
      ]);
      
      setStoreList(storesData);
      setCameraList(camerasData);
      setAlerts(alertsData.alerts);
      setUnreadCount(alertsData.unread_count);
      
      // Build store status from data
      const storeStatsMap: { [key: string]: StoreStatus } = {};
      
      storesData.forEach(store => {
        const storeCameras = camerasData.filter(c => c.store_id === store.id);
        const storeAlerts = alertsData.alerts.filter(a => a.store_id === store.id && !a.acknowledged);
        
        storeStatsMap[store.id] = {
          storeId: store.id,
          storeName: store.name,
          alerts: storeAlerts.length,
          cameras: storeCameras.length,
          lastUpdate: new Date(),
        };
      });
      
      setStores(Object.values(storeStatsMap));
    } catch (err: any) {
      console.error('Failed to fetch behavior data:', err);
      setError(err.message || 'Failed to load data');
    }
  }, []);

  // Manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  // Acknowledge alert
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await eventsApi.acknowledgeAlert(alertId);
      // Refresh data
      await fetchData();
    } catch (err: any) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  // Acknowledge all alerts
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

      // Managers always have access
      if (user.active_membership.role === 'manager') {
        setHasAccess(true);
        await fetchData();
        // Poll for updates every 10 seconds
        interval = setInterval(fetchData, 10000);
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
          await fetchData();
          interval = setInterval(fetchData, 10000);
        }
      } catch (error: any) {
        setHasAccess(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAccess();

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isAuthenticated, user, fetchData]);

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
          <h2 className="text-2xl font-bold text-slate-200 mb-2">
            {lang === 'vi' ? 'Từ chối truy cập' : 'Access Denied'}
          </h2>
          <p className="text-slate-400 mb-4">
            {lang === 'vi' ? 'Bạn không có quyền truy cập bảng điều khiển.' : "You don't have permission to access the dashboard."}
          </p>
          <button
            onClick={() => router.push('/cameras')}
            className="btn-primary btn-md"
          >
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
    if (diff < 60) return lang === 'vi' ? `${diff} giây trước` : `${diff}s ago`;
    if (diff < 3600) return lang === 'vi' ? `${Math.floor(diff / 60)} phút trước` : `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return lang === 'vi' ? `${Math.floor(diff / 3600)} giờ trước` : `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  const getBehaviorColor = (type: string) => {
    const normalizedType = type?.toLowerCase() || '';
    if (normalizedType.includes('shoplifting') || normalizedType.includes('theft')) {
      return 'bg-red-900/50 text-red-300 border-red-700';
    }
    if (normalizedType.includes('violence') || normalizedType.includes('fight')) {
      return 'bg-purple-900/50 text-purple-300 border-purple-700';
    }
    if (normalizedType.includes('normal')) {
      return 'bg-green-900/50 text-green-300 border-green-700';
    }
    return 'bg-yellow-900/50 text-yellow-300 border-yellow-700';
  };

  const getBehaviorIcon = (type: string) => {
    const normalizedType = type?.toLowerCase() || '';
    if (normalizedType.includes('shoplifting') || normalizedType.includes('theft')) {
      return <AlertTriangle className="w-4 h-4 text-red-400" />;
    }
    if (normalizedType.includes('violence') || normalizedType.includes('fight')) {
      return <Zap className="w-4 h-4 text-purple-400" />;
    }
    return <Eye className="w-4 h-4 text-yellow-400" />;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-slate-400';
    }
  };

  // Count alerts by type
  const alertsByType = alerts.reduce((acc, alert) => {
    const type = alert.anomaly_type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Unacknowledged alerts
  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <Activity className="w-8 h-8" />
            {lang === 'vi' ? 'Giám sát hành vi' : 'Behavior Monitoring'}
          </h1>
          <p className="text-slate-300 mt-1">
            {lang === 'vi' ? 'Phát hiện hành vi bất thường theo thời gian thực' : 'Real-time anomaly behavior detection'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Live Indicator */}
          <div className="flex items-center gap-2 px-4 py-2 bg-green-900/20 border border-green-700/50 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-green-300 text-sm font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-red-600 to-orange-700 rounded-xl p-5 text-white shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-xs font-medium uppercase tracking-wide">
                {lang === 'vi' ? 'Cảnh báo chưa xử lý' : 'Unread Alerts'}
              </p>
              <p className="text-3xl font-bold mt-1">{unreadCount}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Bell className="w-6 h-6" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-purple-600 to-pink-700 rounded-xl p-5 text-white shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-xs font-medium uppercase tracking-wide">
                {lang === 'vi' ? 'Tổng cảnh báo' : 'Total Alerts'}
              </p>
              <p className="text-3xl font-bold mt-1">{alerts.length}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-blue-600 to-cyan-700 rounded-xl p-5 text-white shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">
                {lang === 'vi' ? 'Camera hoạt động' : 'Active Cameras'}
              </p>
              <p className="text-3xl font-bold mt-1">{cameraList.filter(c => c.is_active).length}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Video className="w-6 h-6" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl p-5 text-white shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-xs font-medium uppercase tracking-wide">
                {lang === 'vi' ? 'Cửa hàng' : 'Stores'}
              </p>
              <p className="text-3xl font-bold mt-1">{storeList.length}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <MapPin className="w-6 h-6" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700"
        >
          <div className="p-6 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-400" />
              {lang === 'vi' ? 'Cảnh báo gần đây' : 'Recent Alerts'}
            </h2>
            {unacknowledgedAlerts.length > 0 && (
              <button
                onClick={handleAcknowledgeAll}
                className="text-xs px-3 py-1.5 bg-green-900/30 border border-green-700 rounded text-green-300 hover:bg-green-900/50 transition-colors"
              >
                <CheckCircle className="w-3 h-3 inline mr-1" />
                {lang === 'vi' ? 'Đánh dấu tất cả đã đọc' : 'Mark all read'}
              </button>
            )}
          </div>

          <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Eye className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">
                  {lang === 'vi' ? 'Chưa có cảnh báo' : 'No alerts yet'}
                </p>
                <p className="text-sm mt-1">
                  {lang === 'vi' 
                    ? 'Cảnh báo sẽ xuất hiện khi AI phát hiện hành vi bất thường'
                    : 'Alerts will appear when AI detects anomalous behavior'}
                </p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-slate-900/50 rounded-lg p-4 border transition-colors ${
                    alert.acknowledged 
                      ? 'border-slate-700 opacity-60' 
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getBehaviorIcon(alert.anomaly_type || '')}
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getBehaviorColor(alert.anomaly_type || '')}`}>
                        {alert.anomaly_type || 'unknown'}
                      </span>
                      <span className={`text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                        {alert.severity.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{formatTime(alert.timestamp)}</span>
                      {!alert.acknowledged && (
                        <button
                          onClick={() => handleAcknowledgeAlert(alert.id)}
                          className="p-1 hover:bg-slate-700 rounded transition-colors"
                          title={lang === 'vi' ? 'Đánh dấu đã đọc' : 'Mark as read'}
                        >
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-slate-200 font-medium mb-2">{alert.message}</p>
                  
                  <div className="flex items-center gap-4 text-xs text-slate-400">
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
                    {alert.confidence && (
                      <span className="text-blue-400 font-medium">
                        {(alert.confidence * 100).toFixed(0)}% {lang === 'vi' ? 'độ tin cậy' : 'confidence'}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Statistics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Alert Types */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-green-400" />
              {lang === 'vi' ? 'Thống kê theo loại' : 'Alerts by Type'}
            </h2>

            <div className="space-y-3">
              {Object.entries(alertsByType).length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <Activity className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{lang === 'vi' ? 'Chưa có dữ liệu' : 'No data yet'}</p>
                </div>
              ) : (
                Object.entries(alertsByType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        type.includes('shoplifting') ? 'bg-red-500' :
                        type.includes('violence') ? 'bg-purple-500' :
                        type.includes('normal') ? 'bg-green-500' : 'bg-yellow-500'
                      }`}></div>
                      <span className="text-slate-200 capitalize">{type}</span>
                    </div>
                    <span className="text-slate-100 font-semibold">{count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Store Status */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-orange-400" />
              {lang === 'vi' ? 'Trạng thái cửa hàng' : 'Store Status'}
            </h2>

            <div className="space-y-3">
              {stores.length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <MapPin className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{lang === 'vi' ? 'Chưa có cửa hàng' : 'No stores yet'}</p>
                </div>
              ) : (
                stores.map((store) => (
                  <div key={store.storeId} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-200 font-medium">{store.storeName}</span>
                      {store.alerts > 0 && (
                        <span className="px-2 py-0.5 bg-red-900/30 border border-red-700 rounded text-red-300 text-xs">
                          {store.alerts} {lang === 'vi' ? 'cảnh báo' : 'alerts'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Video className="w-3 h-3" />
                        {store.cameras} {lang === 'vi' ? 'camera' : 'cameras'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
