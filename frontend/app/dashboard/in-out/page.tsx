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
  const [isLoadingData, setIsLoadingData] = useState(false); // Track active data fetches
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [stores, setStores] = useState<StoreStats[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [selectedCameras, setSelectedCameras] = useState<string[]>([]);
  // Explicitly use browser timezone when grouping by hour to avoid UTC skew in peak hour calculations
  const getLocalTimeZone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (_) {
      return 'UTC';
    }
  };
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [granularity, setGranularity] = useState<'auto' | 'minute' | 'hour'>('auto');
  // Reset clamping when the day or time range changes
  const [dayKey, setDayKey] = useState<string>(() => new Date().toISOString().slice(0, 10));
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

  // Normalize timestamps from backend (which may be UTC without offset) to avoid timezone drift
  const parseTimestamp = useCallback((value: string | Date) => {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    const hasTimezone = /([zZ]|[+-]\d\d:?\d\d)$/.test(value);
    return new Date(hasTimezone ? value : `${value}Z`);
  }, []);

  useEffect(() => {
    storeListRef.current = storeList;
  }, [storeList]);

  useEffect(() => {
    cameraListRef.current = cameraList;
  }, [cameraList]);

  // Note: when granularity is 'auto', we compute the effective value during bucketing/formatting

  // Filter stores based on selection (store + optional camera filter)
  const filteredStores = useMemo(() => {
    let result = stores;
    
    if (selectedStore !== 'all') {
      result = result.filter(s => s.storeId === selectedStore);
    }
    
    // Apply camera filter across all stores when cameras are selected
    if (selectedCameras.length > 0) {
      result = result
        .map(store => {
          const filteredCams = store.cameras.filter(cam => selectedCameras.includes(cam.cameraId));
          const countIn = filteredCams.reduce((sum, cam) => sum + cam.countIn, 0);
          const countOut = filteredCams.reduce((sum, cam) => sum + cam.countOut, 0);
          return {
            ...store,
            cameras: filteredCams,
            countIn,
            countOut,
            // netInside recalculated server-side; keep existing until we re-derive it below
            netInside: store.netInside,
          };
        })
        // Hide stores that have no matching cameras when filtering by camera
        .filter(store => store.cameras.length > 0);
    }
    
    return result;
  }, [stores, selectedStore, selectedCameras]);

  // Stores to display (exclude Unassigned from UI but keep in totals)
  const displayStores = useMemo(() => {
    return filteredStores.filter(s => s.storeName.toLowerCase() !== 'unassigned');
  }, [filteredStores]);

  // Calculate totals from ALL filtered data (including Unassigned for accurate counts)
  const totalIn = filteredStores.reduce((sum, s) => sum + s.countIn, 0);
  const totalOut = filteredStores.reduce((sum, s) => sum + s.countOut, 0);
  const totalNet = filteredStores.reduce((sum, s) => sum + s.netInside, 0);
  const totalCameras = selectedCameras.length > 0
    ? filteredStores.reduce((sum, s) => sum + s.cameras.length, 0)
    : selectedStore === 'all'
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
  const localTimeZone = useMemo(() => getLocalTimeZone(), []);

  const peakHour = useMemo(() => {
    if (timeSeriesData.length === 0) return null;
    // Since counts are cumulative, take the MAX count_in per hour (not sum)
    const hourlyMap = new Map<number, number>();
    timeSeriesData.forEach(item => {
      // Normalize to browser timezone to avoid UTC skew
      const hourString = new Date(item.time).toLocaleString('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: localTimeZone,
      });
      const hour = parseInt(hourString, 10);
      const current = hourlyMap.get(hour) || 0;
      // Take MAX cumulative count, not sum
      hourlyMap.set(hour, Math.max(current, item.count_in));
    });
    
    // Find hour with maximum count
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
  }, [timeSeriesData, localTimeZone]);

  // Calculate average hourly traffic
  const avgHourlyTraffic = useMemo(() => {
    if (timeSeriesData.length === 0 || totalIn === 0) return null;
    const hours = new Set<number>();
    timeSeriesData.forEach(item => {
      const hourString = new Date(item.time).toLocaleString('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: localTimeZone,
      });
      const hour = parseInt(hourString, 10);
      hours.add(hour);
    });
    return hours.size > 0 ? Math.round(totalIn / hours.size) : null;
  }, [timeSeriesData, totalIn, localTimeZone]);


  // Calculate traffic distribution (morning/afternoon/evening)
  const trafficDistribution = useMemo(() => {
    if (timeSeriesData.length === 0) return null;
    let morning = 0; // 6-12
    let afternoon = 0; // 12-18
    let evening = 0; // 18-24 or 0-6
    
    timeSeriesData.forEach(item => {
      const hourString = new Date(item.time).toLocaleString('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: localTimeZone,
      });
      const hour = parseInt(hourString, 10);
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
  }, [timeSeriesData, localTimeZone]);

  // Animate numbers with non-decreasing clamp at the display level
  useEffect(() => {
    // Clamp the target values to never decrease compared to last displayed values
    const targetIn = Math.max(totalIn, lastValuesRef.current.totalIn);
    const targetOut = Math.max(totalOut, lastValuesRef.current.totalOut);
    const targetNet = Math.max(totalNet, lastValuesRef.current.totalNet);

    // If all targets are zero and we had previous values, keep previous values (avoid flicker)
    if (targetIn === 0 && targetOut === 0 && targetNet === 0 &&
        (lastValuesRef.current.totalIn > 0 || lastValuesRef.current.totalOut > 0 || lastValuesRef.current.totalNet > 0)) {
      setAnimatedValues({
        totalIn: lastValuesRef.current.totalIn,
        totalOut: lastValuesRef.current.totalOut,
        totalNet: lastValuesRef.current.totalNet,
      });
      return;
    }

    // Only animate if values actually changed
    if (targetIn === lastValuesRef.current.totalIn &&
        targetOut === lastValuesRef.current.totalOut &&
        targetNet === lastValuesRef.current.totalNet) {
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
      const easeOut = 1 - Math.pow(1 - progress, 3);

      setAnimatedValues({
        totalIn: Math.floor(startIn + (targetIn - startIn) * easeOut),
        totalOut: Math.floor(startOut + (targetOut - startOut) * easeOut),
        totalNet: Math.floor(startNet + (targetNet - startNet) * easeOut),
      });

      if (currentStep < steps) {
        setTimeout(animate, stepTime);
      } else {
        setAnimatedValues({ totalIn: targetIn, totalOut: targetOut, totalNet: targetNet });
        lastValuesRef.current = { totalIn: targetIn, totalOut: targetOut, totalNet: targetNet };
      }
    };

    animate();
  }, [totalIn, totalOut, totalNet]);

  // Reset displayed totals when the day, time range, or store changes (new baseline)
  useEffect(() => {
    lastValuesRef.current = { totalIn: 0, totalOut: 0, totalNet: 0 };
    setAnimatedValues({ totalIn: 0, totalOut: 0, totalNet: 0 });
  }, [dayKey, timeRange, selectedStore]);

  // Fetch time-series data for charts - returns data instead of setting state
  const fetchTimeSeriesData = useCallback(async () => {
    try {
      // Calculate time range
      const now = new Date();
      let startDate: Date;
      let limit = 120; // lower default to reduce payload
      
      switch (timeRange) {
        case 'week':
          startDate = startOfWeek(now, { weekStartsOn: 1 });
          limit = 300;
          break;
        case 'month':
          startDate = startOfMonth(now);
          limit = 500;
          break;
        default: // today
          startDate = startOfDay(now);
          limit = 120;
      }
      
      const params: any = {
        limit,
      };
      
      // Always scope by store when a store is selected to reduce payload server-side
      if (selectedStore !== 'all') {
        params.store_id = selectedStore;
      }
      
      // Determine effective granularity ('auto' => today: minute, week/month: hour)
      const effectiveGranularity: 'minute' | 'hour' =
        granularity === 'auto' ? (timeRange === 'today' ? 'minute' : 'hour') : granularity;

      // Helper: bucket a timestamp by granularity
      const bucketTime = (d: Date): string => {
        const x = new Date(d);
        x.setSeconds(0, 0);
        if (effectiveGranularity === 'hour') {
          x.setMinutes(0, 0, 0);
        }
        return x.toISOString();
      };

      // Fetch in/out counts
      const inOutData = selectedCameras.length > 0
        ? await Promise.all(selectedCameras.map(cameraId => 
            eventsApi.getInOutCounts({ limit, camera_id: cameraId, store_id: selectedStore !== 'all' ? selectedStore : undefined })
          )).then(results => results.flat())
        : await eventsApi.getInOutCounts(params);
      
      // Group by time bucket and camera, then aggregate
      // For each time bucket and camera, use the most recent count (data sorted DESC from backend)
      const timeData = new Map<string, Map<string, { count_in: number; count_out: number }>>();
      
      inOutData.forEach(item => {
        const parsedTime = parseTimestamp(item.time);
        if (!isWithinInterval(parsedTime, { start: startDate, end: now })) return;
        
        const timeKey = bucketTime(parsedTime);
        if (!timeData.has(timeKey)) {
          timeData.set(timeKey, new Map());
        }
        const bucket = timeData.get(timeKey)!;
        
        // For each camera at this time bucket, keep the latest record (counts are cumulative)
        if (!bucket.has(item.camera_id)) {
          bucket.set(item.camera_id, { count_in: item.count_in, count_out: item.count_out });
        }
      });
      
      // Generate all time buckets in the range to show complete timeline
      const allBuckets = new Map<string, Map<string, { count_in: number; count_out: number }>>();
      let currentTime = new Date(startDate);
      while (currentTime <= now) {
        const bucketKey = bucketTime(currentTime);
        if (!allBuckets.has(bucketKey)) {
          allBuckets.set(bucketKey, timeData.get(bucketKey) || new Map());
        }
        // Increment by granularity
        if (effectiveGranularity === 'hour') {
          currentTime = new Date(currentTime.getTime() + 60 * 60 * 1000);
        } else {
          currentTime = new Date(currentTime.getTime() + 60 * 1000);
        }
      }
      
      // Now aggregate across all time buckets
      const processed = Array.from(allBuckets.entries())
        .map(([timeKey, cameraMap]) => {
          let totalIn = 0;
          let totalOut = 0;
          
          // Sum across all cameras for this time bucket
          cameraMap.forEach(counts => {
            totalIn += counts.count_in;
            totalOut += counts.count_out;
          });
          
          // Calculate net as cumulative (in - out)
          const net = totalIn - totalOut;
          
          return {
            time: timeKey,
            count_in: totalIn,
            count_out: totalOut,
            net: Math.max(0, net), // Net can't be negative (people inside)
          };
        })
        .sort((a, b) => parseTimestamp(a.time).getTime() - parseTimestamp(b.time).getTime());
      
      return processed;
    } catch (err) {
      console.error('Failed to fetch time-series data:', err);
      return [];
    }
  }, [timeRange, selectedStore, selectedCameras, parseTimestamp, granularity]);

  // Fetch In/Out data from API
  const fetchInOutData = useCallback(async () => {
    // Prevent overlapping requests
    if (fetchInOutDataLoadingRef.current) {
      return;
    }
    fetchInOutDataLoadingRef.current = true;
    // Only show loading state if we have no data yet (first load)
    // Background refreshes should be silent to prevent UI flicker
    if (stores.length === 0) {
      setIsLoadingData(true);
    }
    
    try {
      setError(null);
      
      // Use refs to always read the latest stores/cameras without retriggering this callback
      const storesData = storeListRef.current || [];
      const camerasData = cameraListRef.current || [];

      // If the currently selected store no longer exists (e.g., after data loads), fall back to 'all'
      if (selectedStore !== 'all' && !storesData.some(s => s.id === selectedStore)) {
        setSelectedStore('all');
      }
      
      // Fetch summary and realtime counts first so UI updates fast; time-series loads afterward
      const [inoutSummary, realtimePeopleCounts] = await Promise.all([
        eventsApi.getInOutSummary(
          selectedStore !== 'all' ? selectedStore : undefined,
          timeRange // Pass current time range filter
        ),
        eventsApi.getRealtimePeopleCounts(selectedStore !== 'all' ? { store_id: selectedStore } : undefined),
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
      
      // Calculate total people in zones per store and per camera from real-time data
      const storePeopleCounts: { [key: string]: number } = {};
      const cameraPeopleCounts: { [key: string]: number } = {};
      
      realtimePeopleCounts.forEach((item: { camera_id: string; store_id: string; people_in_zone: number }) => {
        if (item.store_id && item.people_in_zone !== undefined) {
          storePeopleCounts[item.store_id] = (storePeopleCounts[item.store_id] || 0) + item.people_in_zone;
          cameraPeopleCounts[item.camera_id] = item.people_in_zone;
        }
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

        // If store entry is missing (e.g., DataContext not loaded yet), create it on the fly
        if (!cam.store_id) {
          return;
        }
        if (!storeStatsMap[cam.store_id]) {
          storeStatsMap[cam.store_id] = {
            storeId: cam.store_id,
            storeName: store?.name || 'Unknown Store',
            countIn: 0,
            countOut: 0,
            netInside: 0,
            cameras: [],
            lastUpdate: new Date(),
          };
        }

        storeStatsMap[cam.store_id].countIn += cam.count_in;
        storeStatsMap[cam.store_id].countOut += cam.count_out;
        // Use real-time people counts for netInside (current people in zones)
        storeStatsMap[cam.store_id].netInside = storePeopleCounts[cam.store_id] || 0;
        storeStatsMap[cam.store_id].cameras.push({
          cameraId: cam.camera_id,
          cameraName: camera?.name || 'Unknown Camera',
          countIn: cam.count_in,
          countOut: cam.count_out,
          lastUpdated: parseTimestamp(cam.last_updated),
        });
        storeStatsMap[cam.store_id].lastUpdate = parseTimestamp(cam.last_updated);
      });

      // Ensure cameras assigned to a store appear even if no AI counts yet
      camerasData.forEach(camera => {
        if (!camera.store_id || !storeStatsMap[camera.store_id]) return;
        const storeEntry = storeStatsMap[camera.store_id];
        const exists = storeEntry.cameras.some(c => c.cameraId === camera.id);
        if (!exists) {
          storeEntry.cameras.push({
            cameraId: camera.id,
            cameraName: camera.name,
            countIn: 0,
            countOut: 0,
            lastUpdated: new Date(),
          });
        }
      });

      // Update netInside from realtime people counts even if no in/out records yet
      Object.keys(storeStatsMap).forEach(storeId => {
        if (storePeopleCounts[storeId] !== undefined) {
          storeStatsMap[storeId].netInside = storePeopleCounts[storeId];
        }
      });
      
      let newStores = Object.values(storeStatsMap);
      
      // Keep "Unassigned" store data for accurate totals, but mark it for conditional display
      // (The filteredStores logic will handle whether to show it based on user's selection)

      // If cameras are filtered, recalc store aggregates using only selected cameras
      if (selectedCameras.length > 0) {
        newStores = newStores
          .map(store => {
            const filteredCams = store.cameras.filter(cam => selectedCameras.includes(cam.cameraId));
            const countIn = filteredCams.reduce((sum, cam) => sum + cam.countIn, 0);
            const countOut = filteredCams.reduce((sum, cam) => sum + cam.countOut, 0);
            const netInside = filteredCams.reduce((sum, cam) => sum + (cameraPeopleCounts[cam.cameraId] || 0), 0);
            return {
              ...store,
              cameras: filteredCams,
              countIn,
              countOut,
              netInside,
            };
          })
          .filter(store => store.cameras.length > 0);
      }
      // Compute current day key (YYYY-MM-DD) for 'today' range
      const currentDay = new Date().toISOString().slice(0, 10);
      const shouldClamp = timeRange === 'today' && currentDay === dayKey;
      // Apply non-decreasing clamp only within the same day for 'today'
      setStores((prev) => {
        if (!prev || prev.length === 0 || !shouldClamp) return newStores;
        const prevById = new Map(prev.map(s => [s.storeId, s]));
        return newStores.map(ns => {
          const ps = prevById.get(ns.storeId);
          if (!ps) return ns;
          return {
            ...ns,
            countIn: ns.countIn < ps.countIn ? ps.countIn : ns.countIn,
            countOut: ns.countOut < ps.countOut ? ps.countOut : ns.countOut,
          };
        });
      });
      // Update dayKey when crossing to a new day or range change
      setDayKey(currentDay);
      setLastRefresh(new Date());

      // Kick off time-series fetch in the background; don't block UI updates
      // IMPORTANT: Don't call setStores again, only update timeSeriesData
      fetchTimeSeriesData()
        .then((timeSeriesResult) => {
          if (timeSeriesResult) {
            setTimeSeriesData(timeSeriesResult);
            // Do NOT call setStores here - it would wipe out the data we just fetched
          }
        })
        .catch((err) => {
          console.error('Failed to fetch time-series data (async):', err);
        });
      
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
    } catch (err: any) {
      // Ignore network errors from aborted/cancelled requests
      if (err.code === 'ERR_CANCELED' || err.name === 'AbortError' || err.code === 'ERR_NETWORK') {
        return;
      }
      console.error('Failed to fetch in/out data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      fetchInOutDataLoadingRef.current = false;
      setIsLoadingData(false);
    }
  }, [selectedStore, selectedCameras, fetchTimeSeriesData, parseTimestamp]);
  // NOTE: Removed storeList, cameraList, and animatedValues from dependencies
  // Using refs instead to prevent infinite fetch loops when data context updates

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
        // Fetch data and wait for it to complete before clearing loading state
        dataFetchPromise = fetchInOutData();
        // Wait for initial data load, then set up interval
        dataFetchPromise.then(() => {
          setIsLoading(false);
          interval = setInterval(fetchInOutData, 5000);
        }).catch(() => {
          // Even on error, stop loading after a timeout
          setIsLoading(false);
          interval = setInterval(fetchInOutData, 5000);
        });
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
          interval = setInterval(fetchInOutData, 5000);
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

  // Trigger initial fetch when access is confirmed and data context finishes loading
  const initialFetchDoneRef = useRef(false);
  useEffect(() => {
    if (!hasAccess || initialFetchDoneRef.current) return;
    // Only fetch once when context stores/cameras have loaded
    if (storeListRef.current?.length > 0 || cameraListRef.current?.length > 0) {
      initialFetchDoneRef.current = true;
      fetchInOutData();
    }
  }, [hasAccess, fetchInOutData]);

  // Refetch when store or camera selection changes (debounced to prevent double-fetch)
  useEffect(() => {
    if (!hasAccess || !selectedStore) return;
    
    // Debounce fetch to avoid double-calls when both selectedStore and selectedCameras change rapidly
    const timeoutId = setTimeout(() => {
      fetchInOutData();
    }, 50); // 50ms debounce - quick enough to feel instant but prevents double-fetch
    
    return () => clearTimeout(timeoutId);
  }, [selectedStore, selectedCameras, hasAccess, fetchInOutData]);

  // Reset clamping when timeRange changes (different aggregation window)
  useEffect(() => {
    // On range change, update dayKey so next fetch can clamp appropriately
    setDayKey(new Date().toISOString().slice(0, 10));
  }, [timeRange]);

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

            // Update the specific camera's counts
            const updatedStore: StoreStats = {
              ...store,
              lastUpdate: parseTimestamp(data.ts),
              cameras: store.cameras.map((cam) =>
                cam.cameraId === data.camera_id
                  ? {
                      ...cam,
                      countIn: data.count_in,
                      countOut: data.count_out,
                      lastUpdated: parseTimestamp(data.ts),
                    }
                  : cam
              ),
            };

            // Add camera if it doesn't exist
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

            // Aggregate counts from all cameras in the store and clamp to non-decreasing
            const aggIn = updatedStore.cameras.reduce((sum, cam) => sum + cam.countIn, 0);
            const aggOut = updatedStore.cameras.reduce((sum, cam) => sum + cam.countOut, 0);
            updatedStore.countIn = aggIn < store.countIn ? store.countIn : aggIn;
            updatedStore.countOut = aggOut < store.countOut ? store.countOut : aggOut;

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
              lastUpdate: parseTimestamp(data.ts),
              cameras: [
                {
                  cameraId: data.camera_id,
                  cameraName:
                    cameraListRef.current.find((cam) => cam.id === data.camera_id)?.name ||
                    (t('unknown_camera') as string) ||
                    'Unknown Camera',
                  countIn: data.count_in,
                  countOut: data.count_out,
                  lastUpdated: parseTimestamp(data.ts),
                },
              ],
            });
          }

          return next;
        });

        setLastRefresh(parseTimestamp(data.ts));
        
        // Fetch current people counts for the store to get accurate netInside (async, non-blocking)
        // This updates the netInside value after the initial update
        (async () => {
          try {
            const realtimeCounts = await eventsApi.getRealtimePeopleCounts(
              data.store_id ? { store_id: data.store_id } : undefined
            );
            
            // Sum up people counts for this store
            const totalPeople = realtimeCounts
              .filter(item => item.store_id === data.store_id)
              .reduce((sum, item) => sum + item.people_in_zone, 0);
            
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
            console.error('Failed to fetch realtime people counts for WebSocket update:', error);
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
  }, [hasAccess, isAuthenticated, t, parseTimestamp]);

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

  // Check if stores exist
  if (hasAccess && storeList.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <StoreIcon className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-200 mb-2">
            {lang === 'vi' ? 'Tạo Cửa Hàng Trước' : 'Create a Store First'}
          </h2>
          <p className="text-slate-400 mb-6">
            {lang === 'vi' 
              ? 'Bạn cần tạo ít nhất một cửa hàng và gán camera để xem bảng điều khiển.'
              : 'You need to create at least one store and assign cameras to it before viewing dashboards.'}
          </p>
          <button onClick={() => router.push('/managers')} className="btn-primary btn-md">
            {lang === 'vi' ? 'Quản lý Cửa Hàng' : 'Manage Stores'}
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

  // Consider real-time people counts as data as well
  const hasRealData = stores.some(s => s.countIn > 0 || s.countOut > 0 || s.netInside > 0);

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
            {displayStores.length > 0 && (
              <button
                onClick={() => {
                  // Export data as CSV
                  const csv = [
                    ['Store', 'In', 'Out', 'Inside', 'Cameras'].join(','),
                    ...displayStores.map(s => [
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
         {isLoadingData && stores.length === 0 ? (
           <>
             <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-5 animate-pulse">
               <div className="h-4 bg-slate-700 rounded w-1/3 mb-3"></div>
               <div className="h-8 bg-slate-700 rounded w-1/2 mb-2"></div>
               <div className="h-3 bg-slate-700 rounded w-1/4"></div>
             </div>
             <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-5 animate-pulse">
               <div className="h-4 bg-slate-700 rounded w-1/3 mb-3"></div>
               <div className="h-8 bg-slate-700 rounded w-1/2 mb-2"></div>
               <div className="h-3 bg-slate-700 rounded w-1/4"></div>
             </div>
           </>
         ) : (
           <>
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
           </>
         )}
       </div>
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
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-300">
                  {lang === 'vi' ? 'Vào/Ra/Net theo thời gian' : 'In/Out/Net Over Time'}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{lang === 'vi' ? 'Độ chi tiết' : 'Granularity'}:</span>
                  <div className="inline-flex bg-slate-700/50 border border-slate-600 rounded-lg overflow-hidden">
                    <button
                      className={`px-2.5 py-1.5 text-xs ${granularity === 'auto' ? 'bg-slate-600 text-white' : 'text-slate-300'}`}
                      onClick={() => setGranularity('auto')}
                    >
                      Auto
                    </button>
                    <button
                      className={`px-2.5 py-1.5 text-xs ${granularity === 'minute' ? 'bg-slate-600 text-white' : 'text-slate-300'}`}
                      onClick={() => setGranularity('minute')}
                    >
                      {lang === 'vi' ? 'Phút' : 'Minute'}
                    </button>
                    <button
                      className={`px-2.5 py-1.5 text-xs ${granularity === 'hour' ? 'bg-slate-600 text-white' : 'text-slate-300'}`}
                      onClick={() => setGranularity('hour')}
                    >
                      {lang === 'vi' ? 'Giờ' : 'Hour'}
                    </button>
                  </div>
                </div>
              </div>
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
                        const d = new Date(value);
                        const hh = d.getHours().toString().padStart(2, '0');
                        const mm = d.getMinutes().toString().padStart(2, '0');
                        const eff = granularity === 'auto' ? (timeRange === 'today' ? 'minute' : 'hour') : granularity;
                        if (timeRange !== 'today') {
                          const month = (d.getMonth() + 1).toString().padStart(2, '0');
                          const day = d.getDate().toString().padStart(2, '0');
                          return eff === 'hour' ? `${month}/${day} ${hh}:00` : `${month}/${day} ${hh}:${mm}`;
                        }
                        return eff === 'hour' ? `${hh}:00` : `${hh}:${mm}`;
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
                        const date = new Date(value);
                        return date.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: localTimeZone,
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

        {displayStores.length === 0 ? (
          <div className="text-center py-16 bg-slate-800/50 rounded-xl border border-slate-700">
            {stores.length === 0 ? (
              <>
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
              </>
            ) : (
              <>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <h3 className="text-lg font-semibold text-slate-300">
                  {lang === 'vi' ? 'Đang tải dữ liệu...' : 'Loading data...'}
                </h3>
                <p className="text-slate-500 text-sm mt-2">
                  {lang === 'vi' ? 'Lấy dữ liệu cửa hàng' : 'Fetching store data'}
                </p>
              </>
            )}
          </div>
        ) : viewMode === 'cards' ? (
          <div className={`grid gap-4 ${selectedStore === 'all' ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
            {displayStores.map((store, idx) => (
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
                  {displayStores.map(store => (
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
          {lang === 'vi' ? 'Tự động làm mới mỗi 5 giây' : 'Auto-refreshes every 5s'}
        </div>
      </div>
    </div>
  );
}
