'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '@/src/contexts/I18nContext';
import {
  Users,
  Camera,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  Shield,
  Eye,
  Clock,
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
    orange: 'text-orange-600 bg-orange-100'
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

export default function DashboardPage() {
  const { t } = useI18n();
  const [timeRange, setTimeRange] = useState('today');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate API loading
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{t('dashboard_title')}</h1>
          <p className="text-slate-300 mt-1">{t('dashboard_sub')}</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="select input w-full sm:w-auto"
          >
            <option value="today">{t('tr_today')}</option>
            <option value="week">{t('tr_week')}</option>
            <option value="month">{t('tr_month')}</option>
          </select>
        </div>
      </div>

      {/* Main Analytics - In/Out, Total Customers, Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Customers In"
          value={mockData.stats.totalCustomers}
          change={mockData.stats.customersChange}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="Customers Out"
          value={Math.floor(mockData.stats.totalCustomers * 0.85)}
          change={-5.2}
          icon={TrendingDown}
          color="blue"
        />
        <StatCard
          title="Total Customers"
          value={mockData.stats.totalCustomers + Math.floor(mockData.stats.totalCustomers * 0.85)}
          change={mockData.stats.customersChange}
          icon={Users}
          color="purple"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Active Alerts"
          value={mockData.stats.totalAlerts}
          change={mockData.stats.alertsChange}
          icon={AlertTriangle}
          color="red"
        />
        <StatCard
          title="Active Cameras"
          value={mockData.stats.activeCameras}
          change={mockData.stats.camerasChange}
          icon={Camera}
          color="green"
        />
        <StatCard
          title="System Uptime"
          value={mockData.stats.systemUptime}
          change={mockData.stats.uptimeChange}
          icon={Shield}
          color="orange"
          format="percentage"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Flow Chart */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">{t('customer_flow')}</h3>
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-slate-600">{t('legend_in')}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-slate-600">{t('legend_out')}</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mockData.customerFlow}>
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
          </ResponsiveContainer>
        </div>

        {/* Weekly Analytics */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">{t('weekly_analytics')}</h3>
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-slate-600">{t('legend_customers')}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-slate-600">{t('legend_alerts')}</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mockData.weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }} 
              />
              <Bar dataKey="customers" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="alerts" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera Status */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">{t('camera_status')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={mockData.cameraStatus}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {mockData.cameraStatus.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {mockData.cameraStatus.map((status, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: status.color }}
                  ></div>
                  <span className="text-slate-600">{status.name}</span>
                </div>
                <span className="font-medium text-slate-900">{status.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">{t('recent_alerts')}</h3>
            <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              {t('view_all')}
            </button>
          </div>
          <div className="space-y-3">
            {mockData.recentAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-6">{t('system_status')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center space-x-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div>
              <p className="font-medium text-green-900">{t('ai_core_service')}</p>
              <p className="text-sm text-green-700">{t('all_systems_operational')}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <Activity className="w-8 h-8 text-green-600" />
            <div>
              <p className="font-medium text-green-900">{t('people_counting')}</p>
              <p className="text-sm text-green-700">{t('processing_normally')}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <Eye className="w-8 h-8 text-green-600" />
            <div>
              <p className="font-medium text-green-900">{t('behavior_detection')}</p>
              <p className="text-sm text-green-700">{t('monitoring_active')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
