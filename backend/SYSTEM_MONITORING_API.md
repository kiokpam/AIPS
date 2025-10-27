# System Monitoring API Documentation

This document describes the system monitoring endpoints that provide real-time system health, performance metrics, and device information for your React Next.js frontend.

## 📊 **System Monitoring Endpoints**

### **1. GPU/Device Information** 🖥️
```http
GET /api/system/gpu_info
```

**Description**: Get information about available GPU/CPU devices for AI processing (ported from codedash_ai).

**Response**:
```json
{
  "cuda_available": true,
  "device_count": 1,
  "current_device": 0,
  "device_name": "NVIDIA GeForce RTX 3080",
  "gpu_memory_total": 10737418240,
  "gpu_memory_allocated": 2147483648,
  "gpu_memory_cached": 3221225472,
  "gpu_utilization": 0.75
}
```

**Usage in React**:
```jsx
const GPUInfo = () => {
  const [gpuInfo, setGpuInfo] = useState(null);
  
  useEffect(() => {
    const fetchGPUInfo = async () => {
      const response = await fetch('/api/system/gpu_info');
      const data = await response.json();
      setGpuInfo(data);
    };
    fetchGPUInfo();
  }, []);
  
  return (
    <div className="gpu-info">
      <h3>GPU Information</h3>
      {gpuInfo && (
        <div>
          <p>Device: {gpuInfo.device_name}</p>
          <p>CUDA Available: {gpuInfo.cuda_available ? 'Yes' : 'No'}</p>
          <p>GPU Count: {gpuInfo.device_count}</p>
          <p>Utilization: {(gpuInfo.gpu_utilization * 100).toFixed(1)}%</p>
        </div>
      )}
    </div>
  );
};
```

### **2. System Performance Metrics** ⚡
```http
GET /api/system/performance
```

**Description**: Get current system performance metrics including CPU, memory, GPU, and disk usage.

**Response**:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "cpu_usage": 0.45,
  "memory_usage": 0.62,
  "memory_available_gb": 6.2,
  "memory_total_gb": 16.0,
  "disk_usage": 0.35,
  "disk_free_gb": 120.5,
  "disk_total_gb": 500.0,
  "gpu_usage": 0.78,
  "gpu_memory_usage": 0.65,
  "system_uptime": 7200.5,
  "process": {
    "cpu_percent": 12.5,
    "memory_percent": 8.2,
    "memory_mb": 134.5,
    "num_threads": 8
  }
}
```

**Usage in React**:
```jsx
const SystemPerformance = () => {
  const [performance, setPerformance] = useState(null);
  
  useEffect(() => {
    const fetchPerformance = async () => {
      const response = await fetch('/api/system/performance');
      const data = await response.json();
      setPerformance(data);
    };
    
    fetchPerformance();
    const interval = setInterval(fetchPerformance, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="performance-dashboard">
      <h3>System Performance</h3>
      {performance && (
        <div className="metrics-grid">
          <div className="metric">
            <span>CPU Usage</span>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${performance.cpu_usage * 100}%` }}
              />
            </div>
            <span>{(performance.cpu_usage * 100).toFixed(1)}%</span>
          </div>
          
          <div className="metric">
            <span>Memory Usage</span>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${performance.memory_usage * 100}%` }}
              />
            </div>
            <span>{(performance.memory_usage * 100).toFixed(1)}%</span>
          </div>
          
          <div className="metric">
            <span>GPU Usage</span>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${performance.gpu_usage * 100}%` }}
              />
            </div>
            <span>{(performance.gpu_usage * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
};
```

### **3. System Health Status** 🏥
```http
GET /api/system/health
```

**Description**: Get health status of all AI services and overall system health.

**Response**:
```json
{
  "overall_status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "system_uptime": 7200.5,
  "ai_services": {
    "ai_core": {
      "status": "healthy",
      "response_time_ms": 25.3,
      "details": { "models_loaded": 2 }
    },
    "people_counting": {
      "status": "healthy",
      "response_time_ms": 45.2,
      "details": { "active_cameras": 4 }
    },
    "behavior_detection": {
      "status": "healthy",
      "response_time_ms": 38.7,
      "details": { "anomalies_detected": 3 }
    }
  },
  "performance": {
    "cpu_usage": 0.45,
    "memory_usage": 0.62,
    "gpu_usage": 0.78
  },
  "unhealthy_services": []
}
```

**Usage in React**:
```jsx
const SystemHealth = () => {
  const [health, setHealth] = useState(null);
  
  useEffect(() => {
    const fetchHealth = async () => {
      const response = await fetch('/api/system/health');
      const data = await response.json();
      setHealth(data);
    };
    
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="health-dashboard">
      <h3>System Health</h3>
      {health && (
        <div>
          <div className={`status-indicator ${health.overall_status}`}>
            Overall Status: {health.overall_status.toUpperCase()}
          </div>
          
          <div className="services-status">
            {Object.entries(health.ai_services).map(([service, status]) => (
              <div key={service} className="service-status">
                <span className="service-name">{service}</span>
                <span className={`status ${status.status}`}>{status.status}</span>
                <span className="response-time">{status.response_time_ms}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

### **4. System Statistics Summary** 📈
```http
GET /api/system/stats/summary
```

**Description**: Get system-wide statistics summary (ported from codedash_ai).

**Response**:
```json
{
  "total_cameras": 5,
  "active_cameras": 4,
  "total_people": 23,
  "active_streams": 3,
  "system_uptime": 7200.5
}
```

### **5. System Metrics** 📊
```http
GET /api/system/metrics
```

**Description**: Get comprehensive system metrics including cameras, AI services, and performance.

**Response**:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "system": {
    "uptime": 7200.5,
    "cpu_usage": 0.45,
    "memory_usage": 0.62,
    "gpu_usage": 0.78,
    "disk_usage": 0.35
  },
  "cameras": {
    "total": 5,
    "active": 4,
    "total_people": 23,
    "total_fps": 120.5,
    "active_streams": 3
  },
  "ai_services": {
    "ai_core": { "status": "healthy", "models_loaded": 2 },
    "people_counting": { "status": "healthy", "active_cameras": 4 },
    "behavior_detection": { "status": "healthy", "anomalies_detected": 3 }
  },
  "device_info": {
    "cuda_available": true,
    "device_name": "NVIDIA GeForce RTX 3080"
  }
}
```

### **6. Performance History** 📈
```http
GET /api/system/performance/history?minutes=60
```

**Description**: Get system performance history for the last N minutes.

**Parameters**:
- `minutes` (query, optional): History in minutes - default: 60

**Response**:
```json
{
  "history": [
    {
      "timestamp": "2024-01-15T10:29:00.000Z",
      "cpu_usage": 0.42,
      "memory_usage": 0.61,
      "gpu_usage": 0.75
    }
  ],
  "summary": {
    "avg_cpu_usage": 0.45,
    "max_cpu_usage": 0.78,
    "avg_memory_usage": 0.62,
    "max_memory_usage": 0.85,
    "data_points": 60,
    "time_range_minutes": 60
  }
}
```

### **7. System Alerts** 🚨
```http
GET /api/system/alerts
```

**Description**: Get current system alerts and warnings.

**Response**:
```json
{
  "alerts": [
    {
      "type": "critical",
      "message": "High CPU usage: 95.2%",
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ],
  "warnings": [
    {
      "type": "warning",
      "message": "Elevated memory usage: 82.1%",
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total_alerts": 1,
  "total_warnings": 1,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### **8. System Information** ℹ️
```http
GET /api/system/info
```

**Description**: Get comprehensive system information.

**Response**:
```json
{
  "system": {
    "platform": "posix",
    "python_version": "3.10.8",
    "uptime": 7200.5,
    "start_time": 1705312200.0
  },
  "hardware": {
    "cpu_count": 8,
    "memory_total_gb": 16.0,
    "disk_total_gb": 500.0
  },
  "gpu": {
    "cuda_available": true,
    "device_name": "NVIDIA GeForce RTX 3080"
  },
  "services": {
    "ai_core_url": "http://localhost:8003",
    "people_counting_url": "http://localhost:8001",
    "behavior_detection_url": "http://localhost:8002"
  }
}
```

## 🎯 **React Dashboard Components**

### **Complete System Monitoring Dashboard**
```jsx
import React, { useState, useEffect } from 'react';

const SystemDashboard = () => {
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [alerts, setAlerts] = useState(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [metricsRes, healthRes, alertsRes] = await Promise.all([
          fetch('/api/system/metrics'),
          fetch('/api/system/health'),
          fetch('/api/system/alerts')
        ]);
        
        setMetrics(await metricsRes.json());
        setHealth(await healthRes.json());
        setAlerts(await alertsRes.json());
      } catch (error) {
        console.error('Failed to fetch system data:', error);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="system-dashboard">
      <h2>System Monitoring Dashboard</h2>
      
      {/* Health Status */}
      {health && (
        <div className="health-section">
          <div className={`status-card ${health.overall_status}`}>
            <h3>System Health: {health.overall_status.toUpperCase()}</h3>
            <p>Uptime: {Math.floor(health.system_uptime / 3600)}h {Math.floor((health.system_uptime % 3600) / 60)}m</p>
          </div>
        </div>
      )}
      
      {/* Performance Metrics */}
      {metrics && (
        <div className="performance-section">
          <h3>Performance Metrics</h3>
          <div className="metrics-grid">
            <MetricCard 
              title="CPU Usage" 
              value={metrics.system.cpu_usage} 
              unit="%" 
            />
            <MetricCard 
              title="Memory Usage" 
              value={metrics.system.memory_usage} 
              unit="%" 
            />
            <MetricCard 
              title="GPU Usage" 
              value={metrics.system.gpu_usage} 
              unit="%" 
            />
            <MetricCard 
              title="Active Cameras" 
              value={metrics.cameras.active} 
              unit={`/ ${metrics.cameras.total}`} 
            />
          </div>
        </div>
      )}
      
      {/* Alerts */}
      {alerts && (alerts.total_alerts > 0 || alerts.total_warnings > 0) && (
        <div className="alerts-section">
          <h3>Alerts & Warnings</h3>
          {alerts.alerts.map((alert, index) => (
            <div key={index} className="alert critical">
              🚨 {alert.message}
            </div>
          ))}
          {alerts.warnings.map((warning, index) => (
            <div key={index} className="alert warning">
              ⚠️ {warning.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ title, value, unit }) => (
  <div className="metric-card">
    <h4>{title}</h4>
    <div className="metric-value">
      {(value * 100).toFixed(1)}{unit}
    </div>
    <div className="progress-bar">
      <div 
        className="progress-fill" 
        style={{ width: `${value * 100}%` }}
      />
    </div>
  </div>
);

export default SystemDashboard;
```

## 🎨 **CSS Styling Example**
```css
.system-dashboard {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.status-card {
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.status-card.healthy {
  background-color: #d4edda;
  border: 1px solid #c3e6cb;
  color: #155724;
}

.status-card.degraded {
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  color: #856404;
}

.status-card.critical {
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.metric-card {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.progress-bar {
  width: 100%;
  height: 8px;
  background-color: #e9ecef;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 10px;
}

.progress-fill {
  height: 100%;
  background-color: #007bff;
  transition: width 0.3s ease;
}

.alert {
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.alert.critical {
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
}

.alert.warning {
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  color: #856404;
}
```

## 🚀 **Key Features**

1. **Real-time Monitoring**: Live system performance metrics
2. **AI Service Health**: Monitor all AI services status
3. **GPU Information**: Complete GPU/CPU device information
4. **Performance History**: Historical performance data
5. **Alert System**: Automatic alerts for system issues
6. **Comprehensive Metrics**: System, camera, and service metrics
7. **React Integration**: Ready-to-use React components

This system monitoring API provides complete observability for your AI-powered surveillance system, enabling you to monitor system health, performance, and AI service status in real-time through your React Next.js frontend.
