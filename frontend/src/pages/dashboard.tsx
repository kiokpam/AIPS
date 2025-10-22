import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import StatusCard from '../components/StatusCard';
import ProtectedRoute from '../components/ProtectedRoute';
import { 
  Activity, 
  Database, 
  Wifi, 
  Shield,
  Eye,
  Users,
  AlertTriangle,
  TrendingUp
} from 'lucide-react';

export default function Dashboard() {
  const [apiStatus, setApiStatus] = useState<'online' | 'offline' | 'warning' | 'error'>('offline');
  const [wsStatus, setWsStatus] = useState<'online' | 'offline' | 'warning' | 'error'>('offline');
  const [aiServices, setAiServices] = useState({
    peopleCounting: 'online' as 'online' | 'offline' | 'warning' | 'error',
    behaviorDetection: 'online' as 'online' | 'offline' | 'warning' | 'error',
  });

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    // Check backend API
    fetch(`${base}/health`)
      .then(async (r) => {
        if (!r.ok) throw new Error('failed');
        const data = await r.json();
        setApiStatus(data.status === 'ok' ? 'online' as const : 'warning' as const);
      })
      .catch(() => setApiStatus('error' as const));

    // Check AI services
    Promise.all([
      fetch(`${base.replace('8000', '8001')}/health`).then(r => r.ok ? 'online' as const : 'warning' as const).catch(() => 'error' as const),
      fetch(`${base.replace('8000', '8002')}/health`).then(r => r.ok ? 'online' as const : 'warning' as const).catch(() => 'error' as const),
    ]).then(([peopleCounting, behaviorDetection]) => {
      setAiServices({ peopleCounting, behaviorDetection });
    });

    // WebSocket test
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    ws.onopen = () => setWsStatus('online' as const);
    ws.onclose = () => setWsStatus('offline' as const);
    ws.onerror = () => setWsStatus('error' as const);
    
    return () => ws.close();
  }, []);

  const stats = [
    {
      title: 'Total Stores',
      value: '12',
      change: '+2 this month',
      icon: Shield,
      color: 'text-primary-600',
      bgColor: 'bg-primary-50',
    },
    {
      title: 'Active Cameras',
      value: '48',
      change: '+5 this week',
      icon: Eye,
      color: 'text-success-600',
      bgColor: 'bg-success-50',
    },
    {
      title: 'People Detected',
      value: '1,247',
      change: '+12% from yesterday',
      icon: Users,
      color: 'text-warning-600',
      bgColor: 'bg-warning-50',
    },
    {
      title: 'Alerts Today',
      value: '3',
      change: '-1 from yesterday',
      icon: AlertTriangle,
      color: 'text-danger-600',
      bgColor: 'bg-danger-50',
    },
  ];

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Monitor your AI-powered surveillance system in real-time
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slide-up">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={stat.title} className="card hover:shadow-medium transition-shadow duration-200">
                <div className="card-body">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                      <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
                    </div>
                    <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                      <Icon className={`h-6 w-6 ${stat.color}`} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* System Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">System Status</h2>
            
            <StatusCard
              title="Backend API"
              status={apiStatus}
              description="Core application server"
            >
              <div className="flex items-center text-sm text-gray-600">
                <Database className="h-4 w-4 mr-2" />
                PostgreSQL + TimescaleDB
              </div>
            </StatusCard>

            <StatusCard
              title="WebSocket Connection"
              status={wsStatus}
              description="Real-time communication"
            >
              <div className="flex items-center text-sm text-gray-600">
                <Wifi className="h-4 w-4 mr-2" />
                Live data streaming
              </div>
            </StatusCard>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">AI Services</h2>
            
            <StatusCard
              title="People Counting"
              status={aiServices.peopleCounting}
              description="YOLOv8 + DeepSORT tracking"
            >
              <div className="flex items-center text-sm text-gray-600">
                <Users className="h-4 w-4 mr-2" />
                Real-time person detection
              </div>
            </StatusCard>

            <StatusCard
              title="Behavior Detection"
              status={aiServices.behaviorDetection}
              description="I3D / SlowFast analysis"
            >
              <div className="flex items-center text-sm text-gray-600">
                <Activity className="h-4 w-4 mr-2" />
                Anomaly detection
              </div>
            </StatusCard>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-xl font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button className="btn btn-primary btn-lg">
                <Shield className="h-5 w-5 mr-2" />
                Manage Stores
              </button>
              <button className="btn btn-secondary btn-lg">
                <Eye className="h-5 w-5 mr-2" />
                View Cameras
              </button>
              <button className="btn btn-secondary btn-lg">
                <TrendingUp className="h-5 w-5 mr-2" />
                View Analytics
              </button>
            </div>
          </div>
        </div>
      </div>
      </Layout>
    </ProtectedRoute>
  );
}
