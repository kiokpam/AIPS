'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/src/contexts/I18nContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { authApi } from '@/lib/api';
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
  Store
} from 'lucide-react';

interface StoreStats {
  storeId: string;
  storeName: string;
  countIn: number;
  countOut: number;
  netInside: number;
  peakHour: string;
  peakCount: number;
  hourlyData: { hour: string; in: number; out: number }[];
  lastUpdate: Date;
}

interface DailyTrend {
  date: string;
  dayName: string;
  totalIn: number;
  totalOut: number;
}

export default function InOutDashboardPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [stores, setStores] = useState<StoreStats[]>([]);
  const [dailyTrends, setDailyTrends] = useState<DailyTrend[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');

  // Calculate totals based on time range
  const getMultiplier = () => {
    switch (timeRange) {
      case 'week': return 7;
      case 'month': return 30;
      default: return 1;
    }
  };
  
  const multiplier = getMultiplier();
  const totalIn = stores.reduce((sum, s) => sum + s.countIn, 0) * multiplier;
  const totalOut = stores.reduce((sum, s) => sum + s.countOut, 0) * multiplier;
  const totalNet = stores.reduce((sum, s) => sum + s.netInside, 0);
  
  // Get time range label
  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case 'week': return lang === 'vi' ? 'tuần này' : 'this week';
      case 'month': return lang === 'vi' ? 'tháng này' : 'this month';
      default: return lang === 'vi' ? 'hôm nay' : 'today';
    }
  };

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
    // Generate hourly data for today (mock)
    const generateHourlyData = () => {
      const hours = [];
      const now = new Date();
      for (let i = 8; i <= Math.min(now.getHours(), 21); i++) {
        const baseIn = Math.floor(Math.random() * 30) + 10;
        const baseOut = Math.floor(Math.random() * 25) + 8;
        hours.push({
          hour: `${i}:00`,
          in: baseIn,
          out: baseOut
        });
      }
      return hours;
    };

    // Mock store data - will be replaced with real API calls
    const mockStores: StoreStats[] = [
      {
        storeId: '1',
        storeName: 'Main Store',
        countIn: 234,
        countOut: 198,
        netInside: 36,
        peakHour: '14:00',
        peakCount: 45,
        hourlyData: generateHourlyData(),
        lastUpdate: new Date()
      },
      {
        storeId: '2',
        storeName: 'Branch Store',
        countIn: 156,
        countOut: 142,
        netInside: 14,
        peakHour: '11:00',
        peakCount: 32,
        hourlyData: generateHourlyData(),
        lastUpdate: new Date()
      }
    ];

    // Mock daily trends (last 7 days)
    const dayNames = lang === 'vi' 
      ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    const mockTrends: DailyTrend[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      mockTrends.push({
        date: date.toLocaleDateString(),
        dayName: dayNames[date.getDay()],
        totalIn: Math.floor(Math.random() * 200) + 150,
        totalOut: Math.floor(Math.random() * 180) + 140
      });
    }

    setStores(mockStores);
    setDailyTrends(mockTrends);

    // Simulate real-time updates every 10 seconds
    const interval = setInterval(() => {
      setStores(prev => prev.map(store => ({
        ...store,
        countIn: store.countIn + Math.floor(Math.random() * 3),
        countOut: store.countOut + Math.floor(Math.random() * 2),
        netInside: Math.max(0, store.netInside + Math.floor(Math.random() * 3) - 1),
        lastUpdate: new Date()
      })));
    }, 10000);

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

  // Generate chart data based on time range
  const getChartData = (): { label: string; in: number; out: number }[] => {
    const dayNames = lang === 'vi' 
      ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    const weekNames = lang === 'vi'
      ? ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4']
      : ['Week 1', 'Week 2', 'Week 3', 'Week 4'];

    if (timeRange === 'today') {
      // Hourly data for today
      const selectedStoreData = selectedStore === 'all' 
        ? stores 
        : stores.filter(s => s.storeId === selectedStore);
      
      const aggregated: { [hour: string]: { in: number; out: number } } = {};
      selectedStoreData.forEach(store => {
        store.hourlyData.forEach(h => {
          if (!aggregated[h.hour]) {
            aggregated[h.hour] = { in: 0, out: 0 };
          }
          aggregated[h.hour].in += h.in;
          aggregated[h.hour].out += h.out;
        });
      });
      return Object.entries(aggregated).map(([hour, data]) => ({ 
        label: hour.split(':')[0], 
        in: data.in, 
        out: data.out 
      }));
    } else if (timeRange === 'week') {
      // Daily data for the week
      return dailyTrends.map(day => ({
        label: day.dayName,
        in: day.totalIn,
        out: day.totalOut
      }));
    } else {
      // Weekly data for the month
      return weekNames.map((name, i) => ({
        label: name,
        in: Math.floor(Math.random() * 800) + 600,
        out: Math.floor(Math.random() * 750) + 550
      }));
    }
  };

  // Get max value for chart scaling
  const getChartMax = () => {
    const data = getChartData();
    let max = 0;
    data.forEach(d => {
      if (d.in > max) max = d.in;
      if (d.out > max) max = d.out;
    });
    return max || 50;
  };

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
            {stores.map(store => (
              <option key={store.storeId} value={store.storeId}>{store.storeName}</option>
            ))}
          </select>
          
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
              <p className="text-3xl font-bold mt-1">{totalNet}</p>
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
              <p className="text-3xl font-bold mt-1">{stores.length}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Store className="w-6 h-6" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Traffic Chart - changes based on time range */}
        <motion.div
          key={`chart-${timeRange}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              {timeRange === 'today' 
                ? (lang === 'vi' ? 'Lưu lượng theo giờ' : 'Hourly Traffic')
                : timeRange === 'week'
                ? (lang === 'vi' ? 'Lưu lượng theo ngày' : 'Daily Traffic')
                : (lang === 'vi' ? 'Lưu lượng theo tuần' : 'Weekly Traffic')
              }
            </h2>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span className="text-slate-400">{lang === 'vi' ? 'Vào' : 'In'}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span className="text-slate-400">{lang === 'vi' ? 'Ra' : 'Out'}</span>
              </div>
            </div>
          </div>
          
          {/* Bar Chart */}
          <div className="h-64 flex items-end gap-1 sm:gap-2">
            {getChartData().map((data, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex gap-0.5 items-end h-48">
                  {/* In Bar */}
                  <div 
                    className="flex-1 bg-green-500/80 rounded-t transition-all duration-500 hover:bg-green-500"
                    style={{ height: `${(data.in / getChartMax()) * 100}%` }}
                    title={`${lang === 'vi' ? 'Vào' : 'In'}: ${data.in}`}
                  />
                  {/* Out Bar */}
                  <div 
                    className="flex-1 bg-blue-500/80 rounded-t transition-all duration-500 hover:bg-blue-500"
                    style={{ height: `${(data.out / getChartMax()) * 100}%` }}
                    title={`${lang === 'vi' ? 'Ra' : 'Out'}: ${data.out}`}
                  />
                </div>
                <span className="text-[10px] sm:text-xs text-slate-500">{data.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Summary Stats */}
        <motion.div
          key={`summary-${timeRange}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-xl border border-slate-700 p-6"
        >
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            {lang === 'vi' ? 'Thống kê tổng hợp' : 'Summary Statistics'}
          </h2>
          
          <div className="space-y-4">
            {/* Average per day/hour */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">
                {timeRange === 'today' 
                  ? (lang === 'vi' ? 'Trung bình/giờ' : 'Avg per Hour')
                  : timeRange === 'week'
                  ? (lang === 'vi' ? 'Trung bình/ngày' : 'Avg per Day')
                  : (lang === 'vi' ? 'Trung bình/tuần' : 'Avg per Week')
                }
              </p>
              <p className="text-2xl font-bold text-slate-100">
                {timeRange === 'today' 
                  ? Math.round(totalIn / 12)
                  : timeRange === 'week'
                  ? Math.round(totalIn / 7)
                  : Math.round(totalIn / 4)
                }
                <span className="text-sm text-slate-400 font-normal ml-1">
                  {lang === 'vi' ? 'người' : 'people'}
                </span>
              </p>
            </div>

            {/* Peak time */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">
                {lang === 'vi' ? 'Thời điểm cao điểm' : 'Peak Time'}
              </p>
              <p className="text-2xl font-bold text-orange-400">
                {timeRange === 'today' ? '14:00' : timeRange === 'week' ? (lang === 'vi' ? 'Thứ 7' : 'Saturday') : (lang === 'vi' ? 'Tuần 2' : 'Week 2')}
              </p>
            </div>

            {/* Conversion Rate */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">
                {lang === 'vi' ? 'Tỷ lệ ra/vào' : 'Out/In Ratio'}
              </p>
              <p className="text-2xl font-bold text-blue-400">
                {totalIn > 0 ? ((totalOut / totalIn) * 100).toFixed(1) : 0}%
              </p>
            </div>

            {/* Busiest Store */}
            {stores.length > 1 && (
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <p className="text-xs text-slate-400 mb-1">
                  {lang === 'vi' ? 'Cửa hàng đông nhất' : 'Busiest Store'}
                </p>
                <p className="text-lg font-bold text-purple-400">
                  {stores.reduce((a, b) => a.countIn > b.countIn ? a : b).storeName}
                </p>
              </div>
            )}

            {/* Trend Indicator */}
            <div className="bg-gradient-to-r from-green-900/30 to-blue-900/30 rounded-lg p-4 border border-green-700/30">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {lang === 'vi' ? 'Xu hướng tăng' : 'Trending Up'}
                  </p>
                  <p className="text-xs text-slate-400">
                    +12% {lang === 'vi' ? 'so với kỳ trước' : 'vs previous period'}
                  </p>
                </div>
              </div>
            </div>
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
                    <Store className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">{store.storeName}</h3>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {lang === 'vi' ? 'Cập nhật' : 'Updated'} {formatTime(store.lastUpdate)}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 gap-4 sm:gap-8">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-400">{(store.countIn * multiplier).toLocaleString()}</p>
                    <p className="text-xs text-slate-500">{lang === 'vi' ? 'Vào' : 'In'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-400">{(store.countOut * multiplier).toLocaleString()}</p>
                    <p className="text-xs text-slate-500">{lang === 'vi' ? 'Ra' : 'Out'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-400">{store.netInside}</p>
                    <p className="text-xs text-slate-500">{lang === 'vi' ? 'Trong' : 'Inside'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-orange-400">{store.peakHour}</p>
                    <p className="text-xs text-slate-500">{lang === 'vi' ? 'Cao điểm' : 'Peak'}</p>
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
            {lang === 'vi' ? 'Chưa có dữ liệu thống kê' : 'No Statistics Data'}
          </h3>
          <p className="text-slate-400 mb-4">
            {lang === 'vi' ? 'Chưa có camera nào được bật tính năng đếm ra/vào.' : 'No cameras with in/out counting enabled yet.'}
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
