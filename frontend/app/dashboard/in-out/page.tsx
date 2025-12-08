'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/src/contexts/I18nContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useData } from '@/src/contexts/DataContext';
import { authApi, eventsApi, buildWsUrl, type Store, type Camera } from '@/lib/api';
import { wsManager } from '@/lib/websocket-manager';
import DashboardFilters from '@/components/DashboardFilters';
import StoreAnalyticsCard from '@/components/StoreAnalyticsCard';
import { 
  Shield, 
  Users, 
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
  List,
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  Download,
  Sparkles,
  TrendingUp as TrendingUpIcon,
  Clock as ClockIcon,
  Sun,
  Moon
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachHourOfInterval, isWithinInterval } from 'date-fns';
import { formatTime as formatTimeUTC7, formatDateTime } from '@/src/utils/format';

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
  const { stores: storeList, cameras: cameraList } = useData();
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [stores, setStores] = useState<StoreStats[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [selectedCameras, setSelectedCameras] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [timeSeriesData, setTimeSeriesData] = useState<Array<{
    time: string;
    count_in: number;
    count_out: number;
    net: number;
  }>>([]);
  const storeListRef = useRef<Store[]>([]);
  const cameraListRef = useRef<Camera[]>([]);
  const fetchInOutDataLoadingRef = useRef(false);
  const [previousPeriodData, setPreviousPeriodData] = useState<{totalIn: number; totalOut: number} | null>(null);
  const [animatedValues, setAnimatedValues] = useState({totalIn: 0, totalOut: 0, totalNet: 0});
  const lastValuesRef = useRef({totalIn: 0, totalOut: 0, totalNet: 0}); // Preserve last values during refresh

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

  // Calculate trends (percentage change)
  const calculateTrend = (current: number, previous: number | null) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return change;
  };

  const inTrend = calculateTrend(totalIn, previousPeriodData?.totalIn || null);
  const outTrend = calculateTrend(totalOut, previousPeriodData?.totalOut || null);

  // Find peak hour - calculate by total in that hour in all zones
  const peakHour = useMemo(() => {
    if (timeSeriesData.length === 0) return null;
    // Group by hour and sum count_in for each hour
    const hourlyMap = new Map<number, number>();
    timeSeriesData.forEach(item => {
      const itemTime = parseISO(item.time);
      const hour = itemTime.getHours();
      const current = hourlyMap.get(hour) || 0;
      hourlyMap.set(hour, current + item.count_in);
    });
    
    // Find hour with maximum total in
    let maxHour = 0;
    let maxCount = 0;
    hourlyMap.forEach((count, hour) => {
      if (count > maxCount) {
        maxCount = count;
        maxHour = hour;
      }
    });
    
    if (maxCount === 0) return null;
    
    return {
      hour: `${maxHour.toString().padStart(2, '0')}:00`,
      count: maxCount
    };
  }, [timeSeriesData]);

  // Calculate average hourly traffic
  const avgHourlyTraffic = useMemo(() => {
    if (timeSeriesData.length === 0 || totalIn === 0) return null;
    const hours = new Set<number>();
    timeSeriesData.forEach(item => {
      const itemTime = parseISO(item.time);
      hours.add(itemTime.getHours());
    });
    return hours.size > 0 ? Math.round(totalIn / hours.size) : null;
  }, [timeSeriesData, totalIn]);


  // Calculate traffic distribution (morning/afternoon/evening)
  const trafficDistribution = useMemo(() => {
    if (timeSeriesData.length === 0) return null;
    let morning = 0; // 6-12
    let afternoon = 0; // 12-18
    let evening = 0; // 18-24 or 0-6
    
    timeSeriesData.forEach(item => {
      const itemTime = parseISO(item.time);
      const hour = itemTime.getHours();
      const traffic = item.count_in + item.count_out;
      
      if (hour >= 6 && hour < 12) {
        morning += traffic;
      } else if (hour >= 12 && hour < 18) {
        afternoon += traffic;
      } else {
        evening += traffic;
      }
    });
    
    const total = morning + afternoon + evening;
    if (total === 0) return null;
    
    return {
      morning: Math.round((morning / total) * 100),
      afternoon: Math.round((afternoon / total) * 100),
      evening: Math.round((evening / total) * 100),
      peak: morning > afternoon && morning > evening ? 'morning' 
            : afternoon > evening ? 'afternoon' : 'evening'
    };
  }, [timeSeriesData]);

  // Animate numbers - only animate if values actually changed
  useEffect(() => {
    // If values are 0 and we have previous values, keep showing previous values (no animation)
    if (totalIn === 0 && totalOut === 0 && totalNet === 0 && 
        (lastValuesRef.current.totalIn > 0 || lastValuesRef.current.totalOut > 0)) {
      // Keep previous values during loading - don't update animated values
      setAnimatedValues({
        totalIn: lastValuesRef.current.totalIn,
        totalOut: lastValuesRef.current.totalOut,
        totalNet: lastValuesRef.current.totalNet,
      });
      return;
    }

    // Only animate if values actually changed
    if (totalIn === lastValuesRef.current.totalIn && 
        totalOut === lastValuesRef.current.totalOut && 
        totalNet === lastValuesRef.current.totalNet) {
      return;
    }

    const startIn = lastValuesRef.current.totalIn;
    const startOut = lastValuesRef.current.totalOut;
    const startNet = lastValuesRef.current.totalNet;
    
    const duration = 1000;
    const steps = 30;
    const stepTime = duration / steps;
    let currentStep = 0;

    const animate = () => {
      currentStep++;
      const progress = currentStep / steps;
      const easeOut = 1 - Math.pow(1 - progress, 3); // Ease out cubic

      setAnimatedValues({
        totalIn: Math.floor(startIn + (totalIn - startIn) * easeOut),
        totalOut: Math.floor(startOut + (totalOut - startOut) * easeOut),
        totalNet: Math.floor(startNet + (totalNet - startNet) * easeOut),
      });

      if (currentStep < steps) {
        setTimeout(animate, stepTime);
      } else {
        setAnimatedValues({ totalIn, totalOut, totalNet });
        lastValuesRef.current = { totalIn, totalOut, totalNet };
      }
    };

    animate();
  }, [totalIn, totalOut, totalNet]);

  // Fetch time-series data for charts
  const fetchTimeSeriesData = useCallback(async () => {
    try {
      // Calculate time range
      const now = new Date();
      let startDate: Date;
      let limit = 100;
      
      switch (timeRange) {
        case 'week':
          startDate = startOfWeek(now, { weekStartsOn: 1 });
          limit = 500;
          break;
        case 'month':
          startDate = startOfMonth(now);
          limit = 1000;
          break;
        default: // today
          startDate = startOfDay(now);
          limit = 200;
      }
      
      const params: any = {
        limit,
      };
      
      if (selectedStore !== 'all') {
        params.store_id = selectedStore;
      }
      
      // Fetch both in/out counts and people counts
      const [inOutData, peopleCountsData] = await Promise.all([
        selectedCameras.length > 0
          ? Promise.all(selectedCameras.map(cameraId => 
              eventsApi.getInOutCounts({ ...params, camera_id: cameraId })
            )).then(results => results.flat())
          : eventsApi.getInOutCounts(params),
        selectedCameras.length > 0
          ? Promise.all(selectedCameras.map(cameraId => 
              eventsApi.getPeopleCounts({ ...params, camera_id: cameraId })
            )).then(results => results.flat())
          : eventsApi.getPeopleCounts(params),
      ]);
      
      // Group in/out data by time
      const inOutGrouped = new Map<string, { count_in: number; count_out: number }>();
      inOutData.forEach(item => {
        const timeKey = item.time;
        if (!inOutGrouped.has(timeKey)) {
          inOutGrouped.set(timeKey, { count_in: 0, count_out: 0 });
        }
        const existing = inOutGrouped.get(timeKey)!;
        existing.count_in += item.count_in;
        existing.count_out += item.count_out;
      });
      
      // Group people counts by time and sum all zones
      const peopleCountsGrouped = new Map<string, number>();
      peopleCountsData.forEach(item => {
        const timeKey = item.time;
        const current = peopleCountsGrouped.get(timeKey) || 0;
        peopleCountsGrouped.set(timeKey, current + item.value);
      });
      
      // Combine data: use people_counts for net (total people in all zones)
      const allTimes = new Set([...Array.from(inOutGrouped.keys()), ...Array.from(peopleCountsGrouped.keys())]);
      const processed = Array.from(allTimes)
        .map(time => {
          const inOut = inOutGrouped.get(time) || { count_in: 0, count_out: 0 };
          const net = peopleCountsGrouped.get(time) || 0;
          return {
            time,
            count_in: inOut.count_in,
            count_out: inOut.count_out,
            net: net, // Use total people in all zones
          };
        })
        .filter(item => {
          const itemTime = parseISO(item.time);
          return isWithinInterval(itemTime, { start: startDate, end: now });
        })
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      
      setTimeSeriesData(processed);
    } catch (err) {
      console.error('Failed to fetch time-series data:', err);
    }
  }, [timeRange, selectedStore, selectedCameras]);

  // Fetch In/Out data from API
  const fetchInOutData = useCallback(async () => {
    // Prevent overlapping requests
    if (fetchInOutDataLoadingRef.current) {
      return;
    }
    fetchInOutDataLoadingRef.current = true;
    
    try {
      setError(null);
      
      // Use stores and cameras from DataContext instead of fetching
      const storesData = storeList;
      const camerasData = cameraList;
      
      const [inoutSummary, peopleCounts] = await Promise.all([
        eventsApi.getInOutSummary(selectedStore !== 'all' ? selectedStore : undefined),
        eventsApi.getPeopleCounts(selectedStore !== 'all' ? { store_id: selectedStore, limit: 1000 } : { limit: 1000 }),
      ]);
      
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
      
      // Calculate total people in zones per store (use latest count per zone)
      const storePeopleCounts: { [key: string]: number } = {};
      const zoneLatestCount: { [key: string]: { time: Date; value: number } } = {};
      
      peopleCounts.forEach((item: { time: string; store_id: string; zone_id: string; value: number }) => {
        const zoneKey = `${item.store_id}_${item.zone_id}`;
        const itemTime = new Date(item.time);
        if (!zoneLatestCount[zoneKey] || itemTime > zoneLatestCount[zoneKey].time) {
          zoneLatestCount[zoneKey] = { time: itemTime, value: item.value };
        }
      });
      
      // Sum up people counts per store
      Object.keys(zoneLatestCount).forEach(zoneKey => {
        const [storeId] = zoneKey.split('_');
        storePeopleCounts[storeId] = (storePeopleCounts[storeId] || 0) + zoneLatestCount[zoneKey].value;
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
          // Use people_counts for netInside (total people in all zones)
          storeStatsMap[cam.store_id].netInside = storePeopleCounts[cam.store_id] || 0;
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
      
      const newStores = Object.values(storeStatsMap);
      setStores(newStores);
      setLastRefresh(new Date());
      
      // Update last values ref immediately to prevent showing 0 during refresh
      const newTotalIn = newStores.reduce((sum, s) => sum + s.countIn, 0);
      const newTotalOut = newStores.reduce((sum, s) => sum + s.countOut, 0);
      const newTotalNet = newStores.reduce((sum, s) => sum + s.netInside, 0);
      
      // If we have data, update ref immediately (before animation)
      if (newTotalIn > 0 || newTotalOut > 0 || newTotalNet > 0) {
        lastValuesRef.current = { totalIn: newTotalIn, totalOut: newTotalOut, totalNet: newTotalNet };
        // Set animated values immediately if they were 0 (no animation delay on initial load)
        if (animatedValues.totalIn === 0 && animatedValues.totalOut === 0 && animatedValues.totalNet === 0) {
          setAnimatedValues({ totalIn: newTotalIn, totalOut: newTotalOut, totalNet: newTotalNet });
        }
      }
      
      // Also fetch time-series data
      await fetchTimeSeriesData();
    } catch (err: any) {
      // Ignore network errors from aborted/cancelled requests
      if (err.code === 'ERR_CANCELED' || err.name === 'AbortError' || err.code === 'ERR_NETWORK') {
        return;
      }
      console.error('Failed to fetch in/out data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      fetchInOutDataLoadingRef.current = false;
    }
  }, [selectedStore, storeList, cameraList, fetchTimeSeriesData]);

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

      // Start fetching data immediately in parallel with permission check
      let dataFetchPromise: Promise<void> | null = null;

      if (user.active_membership.role === 'manager') {
        setHasAccess(true);
        // Fetch data immediately without waiting
        dataFetchPromise = fetchInOutData();
        interval = setInterval(fetchInOutData, 15000);
        setIsLoading(false);
        // Don't await - let it load in background
        return;
      }

      // For non-managers, check permissions and fetch data in parallel
      const permissionPromise = authApi.getMemberPermissions(
        user.active_membership.organization.id,
        user.active_membership.id
      );
      
      // Start data fetch immediately (optimistic)
      dataFetchPromise = fetchInOutData();

      try {
        const permissions = await permissionPromise;
        setHasAccess(permissions.can_access_dashboard);
        if (permissions.can_access_dashboard) {
          // If we already started fetching, it's fine. Otherwise start now.
          if (!dataFetchPromise) {
            dataFetchPromise = fetchInOutData();
          }
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

  // Refetch when store selection changes
  useEffect(() => {
    if (hasAccess && selectedStore) {
      fetchInOutData();
    }
  }, [selectedStore, hasAccess, fetchInOutData]);

  useEffect(() => {
    if (hasAccess) {
      fetchTimeSeriesData();
    }
  }, [timeRange, selectedStore, selectedCameras, hasAccess, fetchTimeSeriesData]);

  // WebSocket connection for real-time in/out updates
  useEffect(() => {
    if (!hasAccess || !isAuthenticated) return;
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const wsUrl = buildWsUrl(`/ws/inout?token=${encodeURIComponent(token)}`);

    const ws = wsManager.getConnection({
      url: wsUrl,
      reconnect: true,
      reconnectDelay: 3000,
      onMessage: (data) => {
        if (data.type !== 'inout_update') return;

        // Update immediately with in/out counts, then fetch accurate people counts
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
              // Keep current netInside temporarily, will be updated with accurate value below
              netInside: store.netInside,
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
              netInside: 0, // Will be updated with accurate value below
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
        
        // Fetch current people counts for the store to get accurate netInside (async, non-blocking)
        // This updates the netInside value after the initial update
        (async () => {
          try {
            const peopleCounts = await eventsApi.getPeopleCounts(
              data.store_id ? { store_id: data.store_id, limit: 1000 } : { limit: 1000 }
            );
            
            // Calculate total people in all zones for this store (use latest count per zone)
            const zoneLatestCount: { [key: string]: { time: Date; value: number } } = {};
            peopleCounts.forEach((item: { time: string; store_id: string; zone_id: string; value: number }) => {
              if (item.store_id === data.store_id) {
                const zoneKey = `${item.store_id}_${item.zone_id}`;
                const itemTime = new Date(item.time);
                if (!zoneLatestCount[zoneKey] || itemTime > zoneLatestCount[zoneKey].time) {
                  zoneLatestCount[zoneKey] = { time: itemTime, value: item.value };
                }
              }
            });
            
            // Sum up people counts for this store
            const totalPeople = Object.values(zoneLatestCount).reduce((sum, zone) => sum + zone.value, 0);
            
            // Update stores with accurate people count
            setStores((prev: StoreStats[]) => {
              return prev.map((store) => {
                if (store.storeId === data.store_id) {
                  return {
                    ...store,
                    netInside: totalPeople
                  };
                }
                return store;
              });
            });
          } catch (error) {
            console.error('Failed to fetch people counts for WebSocket update:', error);
          }
        })();
      },
      onError: (err) => {
        console.error('In/Out websocket error:', err);
      },
    });

    // Cleanup: don't close connection, let manager handle it
    return () => {
      // Connection persists across navigations, so we don't close it here
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
    // For longer times, show actual date/time in UTC+7 using format utility
    return formatTimeUTC7(date, lang, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
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
              {lang === 'vi' ? 'Phân tích Đếm' : 'Counting Analytics'}
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

            {/* Export Button */}
            {filteredStores.length > 0 && (
              <button
                onClick={() => {
                  // Export data as CSV
                  const csv = [
                    ['Store', 'In', 'Out', 'Inside', 'Cameras'].join(','),
                    ...filteredStores.map(s => [
                      s.storeName,
                      s.countIn,
                      s.countOut,
                      s.netInside,
                      s.cameras.length
                    ].join(','))
                  ].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `inout-analytics-${new Date().toISOString().split('T')[0]}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title={lang === 'vi' ? 'Xuất dữ liệu' : 'Export data'}
              >
                <Download className="w-4 h-4" />
              </button>
            )}

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
       <div className="grid grid-cols-2 gap-4">
         <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="bg-gradient-to-br from-green-500/20 to-emerald-600/10 border border-green-500/30 rounded-xl p-5 relative overflow-hidden"
         >
           <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full -mr-16 -mt-16" />
           <div className="flex items-center justify-between relative z-10">
             <div className="flex-1">
               <p className="text-green-300/80 text-xs font-medium uppercase tracking-wide mb-1 flex items-center gap-2">
                 {lang === 'vi' ? 'Đếm vào' : 'Count In'}
                 {inTrend !== null && (
                  <span className={`flex items-center gap-1 text-xs ${inTrend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {inTrend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(inTrend).toFixed(1)}%
                  </span>
                )}
               </p>
               <p className="text-3xl font-bold text-green-400 transition-all duration-300">
                 {animatedValues.totalIn.toLocaleString()}
               </p>
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
           className="bg-gradient-to-br from-blue-500/20 to-cyan-600/10 border border-blue-500/30 rounded-xl p-5 relative overflow-hidden"
         >
           <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16" />
           <div className="flex items-center justify-between relative z-10">
             <div className="flex-1">
               <p className="text-blue-300/80 text-xs font-medium uppercase tracking-wide mb-1 flex items-center gap-2">
                 {lang === 'vi' ? 'Đếm ra' : 'Count Out'}
                 {outTrend !== null && (
                  <span className={`flex items-center gap-1 text-xs ${outTrend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {outTrend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(outTrend).toFixed(1)}%
                  </span>
                )}
               </p>
               <p className="text-3xl font-bold text-blue-400 transition-all duration-300">
                 {animatedValues.totalOut.toLocaleString()}
               </p>
               <p className="text-xs text-slate-500 mt-1">{getTimeRangeLabel()}</p>
             </div>
             <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
               <ArrowDownRight className="w-6 h-6 text-blue-400" />
             </div>
           </div>
         </motion.div>

       </div>

       {/* Quick Insights */}
       {hasRealData && (
         <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.2 }}
           className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700 rounded-xl p-6"
         >
           <div className="flex items-center gap-2 mb-4">
             <Sparkles className="w-5 h-5 text-yellow-400" />
             <h3 className="text-lg font-semibold text-slate-100">
               {lang === 'vi' ? 'Thông tin nhanh' : 'Quick Insights'}
             </h3>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {peakHour && (
               <div className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg">
                 <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                   <Zap className="w-5 h-5 text-yellow-400" />
                 </div>
                 <div className="flex-1 min-w-0">
                   <p className="text-xs text-slate-400 mb-0.5">{lang === 'vi' ? 'Giờ cao điểm' : 'Peak Hour'}</p>
                   <p className="text-sm font-semibold text-slate-200 truncate">{peakHour.hour}</p>
                   <p className="text-xs text-slate-500">{peakHour.count} {lang === 'vi' ? 'người vào' : 'people in'}</p>
                 </div>
               </div>
             )}
             
             {avgHourlyTraffic !== null && (
               <div className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg">
                 <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                   <TrendingUpIcon className="w-5 h-5 text-blue-400" />
                 </div>
                 <div className="flex-1 min-w-0">
                   <p className="text-xs text-slate-400 mb-0.5">{lang === 'vi' ? 'Trung bình/giờ' : 'Avg/Hour'}</p>
                   <p className="text-sm font-semibold text-slate-200">{avgHourlyTraffic.toLocaleString()}</p>
                   <p className="text-xs text-slate-500">{lang === 'vi' ? 'người mỗi giờ' : 'people per hour'}</p>
                 </div>
               </div>
             )}

             {trafficDistribution && (
               <div className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg">
                 <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                   {trafficDistribution.peak === 'morning' ? (
                     <Sun className="w-5 h-5 text-orange-400" />
                   ) : trafficDistribution.peak === 'afternoon' ? (
                     <ClockIcon className="w-5 h-5 text-orange-400" />
                   ) : (
                     <Moon className="w-5 h-5 text-orange-400" />
                   )}
                 </div>
                 <div className="flex-1 min-w-0">
                   <p className="text-xs text-slate-400 mb-0.5">{lang === 'vi' ? 'Phân bổ giao thông' : 'Traffic Pattern'}</p>
                   <p className="text-sm font-semibold text-slate-200">
                     {trafficDistribution.peak === 'morning' 
                       ? (lang === 'vi' ? 'Sáng' : 'Morning')
                       : trafficDistribution.peak === 'afternoon'
                       ? (lang === 'vi' ? 'Chiều' : 'Afternoon')
                       : (lang === 'vi' ? 'Tối' : 'Evening')}
                   </p>
                   <p className="text-xs text-slate-500">
                     {trafficDistribution.morning}% / {trafficDistribution.afternoon}% / {trafficDistribution.evening}%
                   </p>
                 </div>
               </div>
             )}

           </div>
         </motion.div>
       )}

      {/* Time-Series Charts Section */}
      {timeSeriesData.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            {lang === 'vi' ? 'Biểu đồ theo thời gian' : 'Time-Series Analytics'}
          </h2>
          
          <div className="grid lg:grid-cols-1 gap-6">
            {/* In/Out/Net Over Time Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
            >
              <h3 className="text-sm font-semibold text-slate-300 mb-4">
                {lang === 'vi' ? 'Vào/Ra/Net theo thời gian' : 'In/Out/Net Over Time'}
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timeSeriesData}>
                  <defs>
                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    tickFormatter={(value) => {
                      try {
                        const date = parseISO(value);
                        // Format with UTC+7 timezone using format utility
                        return formatTimeUTC7(date, lang, {
                          hour: '2-digit',
                          minute: '2-digit',
                          ...(timeRange !== 'today' ? { month: '2-digit', day: '2-digit' } : {})
                        });
                      } catch {
                        return value;
                      }
                    }}
                  />
                  <YAxis 
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#f3f4f6'
                    }}
                    labelFormatter={(value) => {
                      try {
                        const date = parseISO(value);
                        // Format with UTC+7 timezone using format utility
                        return formatDateTime(date, lang, {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                      } catch {
                        return value;
                      }
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ color: '#9ca3af' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="count_in" 
                    stroke="#10b981" 
                    fillOpacity={1} 
                    fill="url(#colorIn)"
                    name={lang === 'vi' ? 'Vào' : 'In'}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="count_out" 
                    stroke="#3b82f6" 
                    fillOpacity={1} 
                    fill="url(#colorOut)"
                    name={lang === 'vi' ? 'Ra' : 'Out'}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="net" 
                    stroke="#a855f7" 
                    fillOpacity={1} 
                    fill="url(#colorNet)"
                    name={lang === 'vi' ? 'Net' : 'Net'}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </div>
      )}

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
