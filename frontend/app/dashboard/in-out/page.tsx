'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/src/contexts/I18nContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { authApi, eventsApi, storeApi, cameraApi, type Store, type Camera } from '@/lib/api';
import { 
  Shield, 
  Users, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  Clock, 
  MapPin, 
  ArrowUpRight, 
  ArrowDownRight,
  Calendar,
  Activity,
  ChevronRight,
  Store as StoreIcon,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface StoreStats {
  storeId: string;
  storeName: string;
  countIn: number;
  countOut: number;
  netInside: number;
  cameras: {
    cameraId: string;
    cameraName: string;
    countIn: number;
    countOut: number;
    lastUpdated: Date;
  }[];
  lastUpdate: Date;
}

export default function InOutDashboardPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [stores, setStores] = useState<StoreStats[]>([]);
  const [storeList, setStoreList] = useState<Store[]>([]);
  const [cameraList, setCameraList] = useState<Camera[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Calculate totals
  const filteredStores = selectedStore === 'all' 
    ? stores 
    : stores.filter(s => s.storeId === selectedStore);
  
  const totalIn = filteredStores.reduce((sum, s) => sum + s.countIn, 0);
  const totalOut = filteredStores.reduce((sum, s) => sum + s.countOut, 0);
  const totalNet = filteredStores.reduce((sum, s) => sum + s.netInside, 0);
  
  // Get time range label
  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case 'week': return lang === 'vi' ? 'tuần này' : 'this week';
      case 'month': return lang === 'vi' ? 'tháng này' : 'this month';
      default: return lang === 'vi' ? 'hôm nay' : 'today';
    }
  };

  // Fetch In/Out data from API
  const fetchInOutData = useCallback(async () => {
    try {
      setError(null);
      
      // Fetch stores and cameras
      const [storesData, camerasData, inoutSummary] = await Promise.all([
        storeApi.getStores(),
        cameraApi.getCameras(),
        eventsApi.getInOutSummary(selectedStore !== 'all' ? selectedStore : undefined),
      ]);
      
      setStoreList(storesData);
      setCameraList(camerasData);
      
      // Build store stats from API data
      const storeStatsMap: { [key: string]: StoreStats } = {};
      
      // Initialize stores
      storesData.forEach(store => {
        storeStatsMap[store.id] = {
          storeId: store.id,
          storeName: store.name,
          countIn: 0,
          countOut: 0,
          netInside: 0,
          cameras: [],
          lastUpdate: new Date(),
        };
      });
      
      // Add camera data from inout summary
      inoutSummary.cameras.forEach(cam => {
        const camera = camerasData.find(c => c.id === cam.camera_id);
        const store = storesData.find(s => s.id === cam.store_id);
        
        if (store && storeStatsMap[cam.store_id]) {
          storeStatsMap[cam.store_id].countIn += cam.count_in;
          storeStatsMap[cam.store_id].countOut += cam.count_out;
          storeStatsMap[cam.store_id].netInside = storeStatsMap[cam.store_id].countIn - storeStatsMap[cam.store_id].countOut;
          storeStatsMap[cam.store_id].cameras.push({
            cameraId: cam.camera_id,
            cameraName: camera?.name || 'Unknown Camera',
            countIn: cam.count_in,
            countOut: cam.count_out,
            lastUpdated: new Date(cam.last_updated),
          });
          storeStatsMap[cam.store_id].lastUpdate = new Date(cam.last_updated);
        }
      });
      
      setStores(Object.values(storeStatsMap));
      setLastRefresh(new Date());
    } catch (err: any) {
      console.error('Failed to fetch in/out data:', err);
      setError(err.message || 'Failed to load data');
    }
  }, [selectedStore]);

  // Manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchInOutData();
    setIsRefreshing(false);
  };

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let interval: NodeJS.Timeout | undefined;

    const checkAccess = async () => {
      if (!isAuthenticated || !user) {
        setIsLoading(false);
        return;
      }

      // Managers always have access
      if (user.active_membership.role === 'manager') {
        setHasAccess(true);
        await fetchInOutData();
        // Poll for updates every 10 seconds
        interval = setInterval(fetchInOutData, 10000);
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
          await fetchInOutData();
          interval = setInterval(fetchInOutData, 10000);
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
  }, [isAuthenticated, user, fetchInOutData]);

  // Re-fetch when selected store changes
  useEffect(() => {
    if (hasAccess) {
      fetchInOutData();
    }
  }, [selectedStore, hasAccess, fetchInOutData]);

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

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return lang === 'vi' ? `${diff} giây trước` : `${diff}s ago`;
    if (diff < 3600) return lang === 'vi' ? `${Math.floor(diff / 60)} phút trước` : `${Math.floor(diff / 60)}m ago`;
    return lang === 'vi' ? `${Math.floor(diff / 3600)} giờ trước` : `${Math.floor(diff / 3600)}h ago`;
  };

  // Check if we have real data
  const hasRealData = stores.some(s => s.countIn > 0 || s.countOut > 0);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-8 h-8" />
            {lang === 'vi' ? 'Thống kê Ra/Vào' : 'In/Out Analytics'}
          </h1>
          <p className="text-slate-300 mt-1">
            {lang === 'vi' ? 'Phân tích lưu lượng khách hàng theo thời gian thực' : 'Real-time customer traffic analysis'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Time Range Selector */}
          <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-1">
            <button
              onClick={() => setTimeRange('today')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                timeRange === 'today'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang === 'vi' ? 'Hôm nay' : 'Today'}
            </button>
            <button
              onClick={() => setTimeRange('week')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                timeRange === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang === 'vi' ? 'Tuần' : 'Week'}
            </button>
            <button
              onClick={() => setTimeRange('month')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                timeRange === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang === 'vi' ? 'Tháng' : 'Month'}
            </button>
          </div>

          {/* Store Filter */}
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">{lang === 'vi' ? 'Tất cả cửa hàng' : 'All Stores'}</option>
            {storeList.map(store => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>

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

      {/* Error Banner */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-300">{error}</span>
        </div>
      )}

      {/* No Data Banner */}
      {!hasRealData && stores.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400" />
          <div>
            <span className="text-yellow-300 font-medium">
              {lang === 'vi' ? 'Chưa có dữ liệu từ AI' : 'No AI data yet'}
            </span>
            <p className="text-yellow-400/80 text-sm">
              {lang === 'vi' 
                ? 'Dữ liệu đếm sẽ xuất hiện khi AI service bắt đầu xử lý. Hãy đảm bảo camera đã được cấu hình đường đếm.'
                : 'Counting data will appear when AI service starts processing. Make sure cameras have counting lines configured.'}
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          key={`in-${timeRange}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl p-5 text-white shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-xs font-medium uppercase tracking-wide">
                {lang === 'vi' ? `Tổng vào ${getTimeRangeLabel()}` : `Total In ${getTimeRangeLabel()}`}
              </p>
              <p className="text-3xl font-bold mt-1">{totalIn.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <ArrowUpRight className="w-6 h-6" />
            </div>
          </div>
        </motion.div>

        <motion.div
          key={`out-${timeRange}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-blue-600 to-cyan-700 rounded-xl p-5 text-white shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">
                {lang === 'vi' ? `Tổng ra ${getTimeRangeLabel()}` : `Total Out ${getTimeRangeLabel()}`}
              </p>
              <p className="text-3xl font-bold mt-1">{totalOut.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <ArrowDownRight className="w-6 h-6" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-purple-600 to-pink-700 rounded-xl p-5 text-white shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-xs font-medium uppercase tracking-wide">
                {lang === 'vi' ? 'Đang ở trong' : 'Currently Inside'}
              </p>
              <p className="text-3xl font-bold mt-1">{Math.max(0, totalNet)}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-orange-600 to-amber-700 rounded-xl p-5 text-white shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-xs font-medium uppercase tracking-wide">
                {lang === 'vi' ? 'Số cửa hàng' : 'Active Stores'}
              </p>
              <p className="text-3xl font-bold mt-1">{storeList.length}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <StoreIcon className="w-6 h-6" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 p-6"
        >
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-blue-400" />
            {lang === 'vi' ? 'Thống kê theo Camera' : 'Camera Statistics'}
          </h2>
          
          {filteredStores.length > 0 && filteredStores.some(s => s.cameras.length > 0) ? (
            <div className="space-y-4">
              {filteredStores.map(store => (
                store.cameras.map(camera => (
                  <div key={camera.cameraId} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-200 font-medium">{camera.cameraName}</p>
                        <p className="text-xs text-slate-400">{store.storeName}</p>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-xl font-bold text-green-400">{camera.countIn}</p>
                          <p className="text-xs text-slate-500">{lang === 'vi' ? 'Vào' : 'In'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-blue-400">{camera.countOut}</p>
                          <p className="text-xs text-slate-500">{lang === 'vi' ? 'Ra' : 'Out'}</p>
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatTime(camera.lastUpdated)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{lang === 'vi' ? 'Chưa có dữ liệu camera' : 'No camera data available'}</p>
              <p className="text-sm mt-1">
                {lang === 'vi' 
                  ? 'Cấu hình đường đếm cho camera để bắt đầu thu thập dữ liệu'
                  : 'Configure counting lines on cameras to start collecting data'}
              </p>
            </div>
          )}
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-xl border border-slate-700 p-6"
        >
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            {lang === 'vi' ? 'Thống kê tổng hợp' : 'Summary Statistics'}
          </h2>
          
          <div className="space-y-4">
            {/* Out/In Ratio */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">
                {lang === 'vi' ? 'Tỷ lệ ra/vào' : 'Out/In Ratio'}
              </p>
              <p className="text-2xl font-bold text-blue-400">
                {totalIn > 0 ? ((totalOut / totalIn) * 100).toFixed(1) : 0}%
              </p>
            </div>

            {/* Active Cameras */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">
                {lang === 'vi' ? 'Camera đang hoạt động' : 'Active Cameras'}
              </p>
              <p className="text-2xl font-bold text-orange-400">
                {cameraList.filter(c => c.is_active).length}
              </p>
            </div>

            {/* Last Update */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">
                {lang === 'vi' ? 'Cập nhật lần cuối' : 'Last Updated'}
              </p>
              <p className="text-lg font-bold text-green-400">
                {formatTime(lastRefresh)}
              </p>
            </div>

            {/* Busiest Store */}
            {stores.length > 1 && stores.some(s => s.countIn > 0) && (
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <p className="text-xs text-slate-400 mb-1">
                  {lang === 'vi' ? 'Cửa hàng đông nhất' : 'Busiest Store'}
                </p>
                <p className="text-lg font-bold text-purple-400">
                  {stores.reduce((a, b) => a.countIn > b.countIn ? a : b).storeName}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Store Details */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-800 rounded-xl border border-slate-700"
      >
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-orange-400" />
            {lang === 'vi' ? 'Chi tiết theo cửa hàng' : 'Store Details'}
          </h2>
        </div>
        
        <div className="divide-y divide-slate-700">
          {stores.map((store) => (
            <div key={store.storeId} className="p-6 hover:bg-slate-700/30 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <StoreIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">{store.storeName}</h3>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {lang === 'vi' ? 'Cập nhật' : 'Updated'} {formatTime(store.lastUpdate)}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 sm:gap-8">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-400">{store.countIn.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">{lang === 'vi' ? 'Vào' : 'In'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-400">{store.countOut.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">{lang === 'vi' ? 'Ra' : 'Out'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-400">{Math.max(0, store.netInside)}</p>
                    <p className="text-xs text-slate-500">{lang === 'vi' ? 'Trong' : 'Inside'}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {stores.length === 0 && (
        <div className="text-center py-12 bg-slate-800 rounded-xl border border-slate-700">
          <BarChart3 className="w-16 h-16 text-slate-400 mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold text-slate-200 mb-2">
            {lang === 'vi' ? 'Chưa có cửa hàng' : 'No Stores Found'}
          </h3>
          <p className="text-slate-400 mb-4">
            {lang === 'vi' ? 'Tạo cửa hàng và thêm camera để bắt đầu đếm.' : 'Create stores and add cameras to start counting.'}
          </p>
          <button
            onClick={() => router.push('/cameras')}
            className="btn-primary btn-md"
          >
            {lang === 'vi' ? 'Đến trang Camera' : 'Go to Cameras'}
          </button>
        </div>
      )}
    </div>
  );
}
