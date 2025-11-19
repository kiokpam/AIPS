'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/src/contexts/I18nContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { authApi } from '@/lib/api';
import { Shield } from 'lucide-react';
import {
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Camera,
  Activity,
  Eye,
  CheckCircle
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

// Mock data - replace with real API calls
const mockData = {
  stats: {
    totalCustomers: 1247,
    customersChange: 12.5,
    activeCameras: 23,
    camerasChange: 0,
    totalAlerts: 3,
    alertsChange: -25,
    systemUptime: 99.8,
    uptimeChange: 0.2
  },
  customerFlow: [
    { time: '00:00', in: 0, out: 0 },
    { time: '04:00', in: 2, out: 1 },
    { time: '08:00', in: 45, out: 12 },
    { time: '12:00', in: 156, out: 89 },
    { time: '16:00', in: 234, out: 167 },
    { time: '20:00', in: 89, out: 145 },
    { time: '24:00', in: 12, out: 23 }
  ],
  weeklyData: [
    { day: 'Mon', customers: 1200, alerts: 2 },
    { day: 'Tue', customers: 1350, alerts: 1 },
    { day: 'Wed', customers: 1100, alerts: 4 },
    { day: 'Thu', customers: 1450, alerts: 2 },
    { day: 'Fri', customers: 1600, alerts: 3 },
    { day: 'Sat', customers: 1800, alerts: 5 },
    { day: 'Sun', customers: 1400, alerts: 2 }
  ],
  cameraStatus: [
    { name: 'Online', value: 20, color: '#22c55e' },
    { name: 'Offline', value: 2, color: '#ef4444' },
    { name: 'Maintenance', value: 1, color: '#f59e0b' }
  ],
  recentAlerts: [
    {
      id: 1,
      type: 'suspicious_activity',
      message: 'Unusual movement detected in Zone A',
      time: '2 minutes ago',
      severity: 'medium',
      camera: 'Entrance Camera'
    },
    {
      id: 2,
      type: 'crowd_gathering',
      message: 'Large crowd detected near checkout',
      time: '15 minutes ago',
      severity: 'low',
      camera: 'Checkout Camera'
    },
    {
      id: 3,
      type: 'object_left',
      message: 'Unattended bag detected',
      time: '1 hour ago',
      severity: 'high',
      camera: 'Security Camera 3'
    }
  ]
};

const StatCard = ({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color = 'blue',
  format = 'number'
}: {
  title: string;
  value: number;
  change: number;
  icon: any;
  color?: string;
  format?: 'number' | 'percentage';
}) => {
  const isPositive = change >= 0;
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-100',
    green: 'text-green-600 bg-green-100',
    red: 'text-red-600 bg-red-100',
    orange: 'text-orange-600 bg-orange-100',
    purple: 'text-purple-600 bg-purple-100'
  };

  const formatValue = (val: number) => {
    if (format === 'percentage') {
      return `${val}%`;
    }
    return val.toLocaleString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="stat-card"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="stat-label">{title}</p>
          <p className="stat-value">{formatValue(value)}</p>
        </div>
        <div className={`w-12 h-12 ${colorClasses[color as keyof typeof colorClasses]} rounded-xl flex items-center justify-center`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div className="flex items-center mt-4">
        {isPositive ? (
          <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
        ) : (
          <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
        )}
        <span className={`stat-change ${isPositive ? 'stat-change-positive' : 'stat-change-negative'}`}>
          {Math.abs(change)}%
        </span>
        <span className="text-slate-500 text-sm ml-1">vs last period</span>
      </div>
    </motion.div>
  );
};

const AlertCard = ({ alert }: { alert: any }) => {
  const severityColors = {
    low: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    medium: 'bg-orange-100 text-orange-800 border-orange-200',
    high: 'bg-red-100 text-red-800 border-red-200'
  };

  return (
    <div className="flex items-start space-x-3 p-4 bg-white rounded-lg border border-slate-200 hover:shadow-md transition-shadow">
      <div className={`w-2 h-2 rounded-full mt-2 ${
        alert.severity === 'high' ? 'bg-red-500' : 
        alert.severity === 'medium' ? 'bg-orange-500' : 'bg-yellow-500'
      }`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-900 truncate">
            {alert.message}
          </p>
          <span className={`badge ${severityColors[alert.severity as keyof typeof severityColors]}`}>
            {alert.severity}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {alert.camera} • {alert.time}
        </p>
      </div>
    </div>
  );
};

export default function InOutDashboardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('day');
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const checkAccess = async () => {
      if (!isAuthenticated || !user) {
        setIsLoading(false);
        return;
      }

      // Managers always have access
      if (user.active_membership.role === 'manager') {
        setHasAccess(true);
        loadData();
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
          loadData();
        }
      } catch (error: any) {
        // If no permissions set, default to no access for members
        setHasAccess(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAccess();
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (hasAccess) {
      loadData();
    }
  }, [timeRange, hasAccess]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      // TODO: Replace with real API call
      // const data = await eventsApi.getAggregatedPeopleCounts(timeRange);
      
      // Mock data based on time range
      let data: any[] = [];
      if (timeRange === 'day') {
        data = mockData.customerFlow;
      } else if (timeRange === 'week') {
        data = mockData.weeklyData.map(d => ({
          time: d.day,
          in: Math.floor(d.customers * 0.6),
          out: Math.floor(d.customers * 0.4),
          total: d.customers
        }));
      } else {
        // Month - aggregate weekly data
        data = Array.from({ length: 4 }, (_, i) => ({
          time: `Week ${i + 1}`,
          in: Math.floor((1200 + i * 200) * 0.6),
          out: Math.floor((1200 + i * 200) * 0.4),
          total: 1200 + i * 200
        }));
      }
      
      setChartData(data);
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
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

  const totalIn = chartData.reduce((sum, d) => sum + (d.in || 0), 0);
  const totalOut = chartData.reduce((sum, d) => sum + (d.out || 0), 0);
  const totalCustomers = totalIn + totalOut;

  return (
    <div className="space-y-8 text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">In/Out Analytics</h1>
          <p className="text-slate-300 mt-1">Customer flow analysis by time period</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as 'day' | 'week' | 'month')}
            className="select input w-full sm:w-auto bg-slate-800 border-slate-700 text-slate-100"
          >
            <option value="day">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>
        </div>
      </div>

      {/* Main Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Customers In"
          value={totalIn}
          change={12.5}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="Customers Out"
          value={totalOut}
          change={-5.2}
          icon={TrendingDown}
          color="blue"
        />
        <StatCard
          title="Total Customers"
          value={totalCustomers}
          change={12.5}
          icon={Users}
          color="purple"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Flow Chart */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">Customer Flow</h3>
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-slate-600">In</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-slate-600">Out</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            {chartData.length > 0 ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="in" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="out" 
                  stroke="#22c55e" 
                  strokeWidth={2}
                  dot={{ fill: '#22c55e', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                No data available for selected period
              </div>
            )}
          </ResponsiveContainer>
        </div>

        {/* Total Customers Chart */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">Total Customers</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            {chartData.length > 0 ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }} 
                />
                <Bar dataKey="total" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                No data available for selected period
              </div>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

