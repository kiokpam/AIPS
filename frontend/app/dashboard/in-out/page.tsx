'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/src/contexts/I18nContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { authApi, eventsApi, storeApi, cameraApi, buildWsUrl, type Store, type Camera } from '@/lib/api';
import DashboardFilters from '@/components/DashboardFilters';
import StoreAnalyticsCard from '@/components/StoreAnalyticsCard';
import { 
  Shield, 
  Users, 
  TrendingUp, 
  BarChart3, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Store as StoreIcon,
  RefreshCw,
  AlertCircle,
  Layers,
  LayoutGrid,
  List
} from 'lucide-react';

interface CameraStats {
  cameraId: string;
  cameraName: string;
  countIn: number;
  countOut: number;
  lastUpdated: Date;
}

interface StoreStats {
  storeId: string;
  storeName: string;
  countIn: number;
  countOut: number;
  netInside: number;
  cameras: CameraStats[];
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
  const [selectedCameras, setSelectedCameras] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const storeListRef = useRef<Store[]>([]);
  const cameraListRef = useRef<Camera[]>([]);

  useEffect(() => {
    storeListRef.current = storeList;
  }, [storeList]);

  useEffect(() => {
    cameraListRef.current = cameraList;
  }, [cameraList]);

  // Filter stores based on selection
  const filteredStores = useMemo(() => {
    let result = stores;
    
    if (selectedStore !== 'all') {
      result = result.filter(s => s.storeId === selectedStore);
    }
    
    // Filter cameras within stores if specific cameras are selected
    if (selectedCameras.length > 0 && selectedStore !== 'all') {
      result = result.map(store => ({
        ...store,
        cameras: store.cameras.filter(cam => selectedCameras.includes(cam.cameraId)),
        // Recalculate totals for filtered cameras
        countIn: store.cameras.filter(cam => selectedCameras.includes(cam.cameraId))
          .reduce((sum, cam) => sum + cam.countIn, 0),
        countOut: store.cameras.filter(cam => selectedCameras.includes(cam.cameraId))
          .reduce((sum, cam) => sum + cam.countOut, 0),
        netInside: store.cameras.filter(cam => selectedCameras.includes(cam.cameraId))
          .reduce((sum, cam) => sum + cam.countIn - cam.countOut, 0),
      }));
    }
    
    return result;
  }, [stores, selectedStore, selectedCameras]);

  // Calculate totals from filtered data
  const totalIn = filteredStores.reduce((sum, s) => sum + s.countIn, 0);
  const totalOut = filteredStores.reduce((sum, s) => sum + s.countOut, 0);
  const totalNet = filteredStores.reduce((sum, s) => sum + s.netInside, 0);
  const totalCameras = selectedStore === 'all' 
    ? cameraList.filter(c => c.is_active).length
    : filteredStores.reduce((sum, s) => sum + s.cameras.length, 0);

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
      
      const [storesData, camerasData, inoutSummary] = await Promise.all([
        storeApi.getStores(),
        cameraApi.getCameras(),
        eventsApi.getInOutSummary(selectedStore !== 'all' ? selectedStore : undefined),
      ]);
      
      setStoreList(storesData);
      setCameraList(camerasData);
      
      // Build store stats from API data
      const storeStatsMap: { [key: string]: StoreStats } = {};
      
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
      inoutSummary.cameras.forEach((cam: {
        camera_id: string;
        store_id: string;
        count_in: number;
        count_out: number;
        last_updated: string;
      }) => {
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
    let interval: NodeJS.Timeout | undefined;

    const checkAccess = async () => {
      if (!isAuthenticated || !user) {
        setIsLoading(false);
        return;
      }

      if (user.active_membership.role === 'manager') {
        setHasAccess(true);
        await fetchInOutData();
        interval = setInterval(fetchInOutData, 15000);
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
          await fetchInOutData();
          interval = setInterval(fetchInOutData, 15000);
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
  }, [isAuthenticated, user, fetchInOutData]);

  useEffect(() => {
    if (hasAccess) {
      fetchInOutData();
    }
  }, [selectedStore, hasAccess, fetchInOutData]);

  useEffect(() => {
    if (!hasAccess || !isAuthenticated) return;
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const ws = new WebSocket(buildWsUrl(`/ws/inout?token=${encodeURIComponent(token)}`));

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'inout_update') return;

        setStores((prev: StoreStats[]) => {
          let storeFound = false;
          const next: StoreStats[] = prev.map((store) => {
            if (store.storeId !== data.store_id) {
              return store;
            }
            storeFound = true;

            const updatedStore: StoreStats = {
              ...store,
              countIn: data.count_in,
              countOut: data.count_out,
              netInside: Math.max(0, data.count_in - data.count_out),
              lastUpdate: new Date(data.ts),
              cameras: store.cameras.map((cam) =>
                cam.cameraId === data.camera_id
                  ? {
                      ...cam,
                      countIn: data.count_in,
                      countOut: data.count_out,
                      lastUpdated: new Date(data.ts),
                    }
                  : cam
              ),
            };

            const cameraExists = updatedStore.cameras.some((cam) => cam.cameraId === data.camera_id);
            if (!cameraExists) {
              const cameraMeta = cameraListRef.current.find((cam) => cam.id === data.camera_id);
              updatedStore.cameras = [
                ...updatedStore.cameras,
                {
                  cameraId: data.camera_id,
                  cameraName: cameraMeta?.name || (t('unknown_camera') as string) || 'Unknown Camera',
                  countIn: data.count_in,
                  countOut: data.count_out,
                  lastUpdated: new Date(data.ts),
                },
              ];
            }

            return updatedStore;
          });

          if (!storeFound) {
            const storeInfo = storeListRef.current.find((s) => s.id === data.store_id);
            next.push({
              storeId: data.store_id,
              storeName: storeInfo?.name || (t('unknown_store') as string) || 'Unknown Store',
              countIn: data.count_in,
              countOut: data.count_out,
              netInside: Math.max(0, data.count_in - data.count_out),
              lastUpdate: new Date(data.ts),
              cameras: [
                {
                  cameraId: data.camera_id,
                  cameraName:
                    cameraListRef.current.find((cam) => cam.id === data.camera_id)?.name ||
                    (t('unknown_camera') as string) ||
                    'Unknown Camera',
                  countIn: data.count_in,
                  countOut: data.count_out,
                  lastUpdated: new Date(data.ts),
                },
              ],
            });
          }

          return next;
        });

        setLastRefresh(new Date(data.ts));
      } catch (err) {
        console.error('Failed to process in/out websocket message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('In/Out websocket error:', err);
    };

    return () => {
      ws.close();
    };
  }, [hasAccess, isAuthenticated, t]);

  if (isLoading || hasAccess === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
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

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return lang === 'vi' ? `${diff}s trước` : `${diff}s ago`;
    if (diff < 3600) return lang === 'vi' ? `${Math.floor(diff / 60)}m trước` : `${Math.floor(diff / 60)}m ago`;
    return lang === 'vi' ? `${Math.floor(diff / 3600)}h trước` : `${Math.floor(diff / 3600)}h ago`;
  };

  const hasRealData = stores.some(s => s.countIn > 0 || s.countOut > 0);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-5 h-5" />
              </div>
              {lang === 'vi' ? 'Phân tích Ra/Vào' : 'In/Out Analytics'}
            </h1>
            <p className="text-slate-400 mt-1 text-sm">
              {lang === 'vi' ? 'Theo dõi lưu lượng khách theo thời gian thực' : 'Real-time customer traffic monitoring'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Time Range */}
            <div className="flex bg-slate-800/80 border border-slate-700 rounded-lg p-1">
              {(['today', 'week', 'month'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    timeRange === range
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {range === 'today' && (lang === 'vi' ? 'Hôm nay' : 'Today')}
                  {range === 'week' && (lang === 'vi' ? 'Tuần' : 'Week')}
                  {range === 'month' && (lang === 'vi' ? 'Tháng' : 'Month')}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Live */}
            <div className="flex items-center gap-2 px-3 py-2 bg-green-900/20 border border-green-700/30 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-green-300 text-xs font-medium">Live</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <DashboardFilters
          stores={storeList}
          cameras={cameraList}
          selectedStore={selectedStore}
          selectedCameras={selectedCameras}
          onStoreChange={setSelectedStore}
          onCamerasChange={setSelectedCameras}
          lang={lang}
        />
      </div>

      {/* Error/Warning Banners */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span className="text-red-300 text-sm">{error}</span>
        </div>
      )}

      {!hasRealData && stores.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-medium text-sm">
              {lang === 'vi' ? 'Chưa có dữ liệu từ AI' : 'No AI data yet'}
            </p>
            <p className="text-amber-400/70 text-xs mt-1">
              {lang === 'vi' 
                ? 'Cấu hình đường đếm cho camera để bắt đầu thu thập dữ liệu'
                : 'Configure counting lines on cameras to start collecting data'}
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-green-500/20 to-emerald-600/10 border border-green-500/30 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-300/80 text-xs font-medium uppercase tracking-wide mb-1">
                {lang === 'vi' ? 'Tổng vào' : 'Total In'}
              </p>
              <p className="text-3xl font-bold text-green-400">{totalIn.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">{getTimeRangeLabel()}</p>
            </div>
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
              <ArrowUpRight className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-gradient-to-br from-blue-500/20 to-cyan-600/10 border border-blue-500/30 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-300/80 text-xs font-medium uppercase tracking-wide mb-1">
                {lang === 'vi' ? 'Tổng ra' : 'Total Out'}
              </p>
              <p className="text-3xl font-bold text-blue-400">{totalOut.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">{getTimeRangeLabel()}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <ArrowDownRight className="w-6 h-6 text-blue-400" />
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
                {lang === 'vi' ? 'Đang trong' : 'Inside Now'}
              </p>
              <p className="text-3xl font-bold text-purple-400">{Math.max(0, totalNet)}</p>
              <p className="text-xs text-slate-500 mt-1">{lang === 'vi' ? 'thời gian thực' : 'real-time'}</p>
            </div>
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-gradient-to-br from-orange-500/20 to-amber-600/10 border border-orange-500/30 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-300/80 text-xs font-medium uppercase tracking-wide mb-1">
                {lang === 'vi' ? 'Tỷ lệ ra/vào' : 'Exit Rate'}
              </p>
              <p className="text-3xl font-bold text-orange-400">
                {totalIn > 0 ? ((totalOut / totalIn) * 100).toFixed(0) : 0}%
              </p>
              <p className="text-xs text-slate-500 mt-1">{totalCameras} {lang === 'vi' ? 'camera' : 'cameras'}</p>
            </div>
            <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-orange-400" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Store Analytics Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            {selectedStore === 'all' 
              ? (lang === 'vi' ? 'Phân tích theo cửa hàng' : 'Store Analytics')
              : (lang === 'vi' ? 'Chi tiết cửa hàng' : 'Store Details')
            }
          </h2>
          
          {/* View Toggle */}
          <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'cards' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {filteredStores.length === 0 ? (
          <div className="text-center py-16 bg-slate-800/50 rounded-xl border border-slate-700">
            <StoreIcon className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-300 mb-2">
              {lang === 'vi' ? 'Chưa có cửa hàng' : 'No Stores Found'}
            </h3>
            <p className="text-slate-500 mb-4">
              {lang === 'vi' ? 'Tạo cửa hàng và thêm camera để bắt đầu' : 'Create stores and add cameras to get started'}
            </p>
            <button onClick={() => router.push('/cameras')} className="btn-primary btn-md">
              {lang === 'vi' ? 'Quản lý Camera' : 'Manage Cameras'}
            </button>
          </div>
        ) : viewMode === 'cards' ? (
          <div className={`grid gap-4 ${selectedStore === 'all' ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
            {filteredStores.map((store, idx) => (
              <StoreAnalyticsCard
                key={store.storeId}
                storeId={store.storeId}
                storeName={store.storeName}
                countIn={store.countIn}
                countOut={store.countOut}
                netInside={store.netInside}
                cameras={store.cameras}
                lastUpdate={store.lastUpdate}
                isExpanded={selectedStore !== 'all'}
                lang={lang}
                variant={selectedStore === 'all' ? 'compact' : 'default'}
              />
            ))}
          </div>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {lang === 'vi' ? 'Cửa hàng' : 'Store'}
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {lang === 'vi' ? 'Vào' : 'In'}
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {lang === 'vi' ? 'Ra' : 'Out'}
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {lang === 'vi' ? 'Trong' : 'Inside'}
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {lang === 'vi' ? 'Camera' : 'Cameras'}
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {lang === 'vi' ? 'Cập nhật' : 'Updated'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filteredStores.map(store => (
                    <tr key={store.storeId} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <StoreIcon className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-slate-200 font-medium">{store.storeName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-green-400 font-semibold">{store.countIn.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-blue-400 font-semibold">{store.countOut.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-purple-400 font-semibold">{Math.max(0, store.netInside)}</span>
                      </td>
                      <td className="px-6 py-4 text-right text-slate-400">
                        {store.cameras.length}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-500 text-sm">
                        {formatTime(store.lastUpdate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats Footer */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-4 px-6 bg-slate-800/30 rounded-xl border border-slate-700/50">
        <div className="flex items-center gap-6 text-sm">
          <span className="text-slate-500">
            {lang === 'vi' ? 'Cập nhật lần cuối:' : 'Last updated:'}{' '}
            <span className="text-slate-300">{formatTime(lastRefresh)}</span>
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-500">
            {storeList.length} {lang === 'vi' ? 'cửa hàng' : 'stores'}
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-500">
            {cameraList.filter(c => c.is_active).length} {lang === 'vi' ? 'camera hoạt động' : 'active cameras'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Activity className="w-3 h-3" />
          {lang === 'vi' ? 'Tự động làm mới mỗi 10 giây' : 'Auto-refreshes every 10s'}
        </div>
      </div>
    </div>
  );
}
