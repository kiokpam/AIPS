'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { eventsApi, Alert } from '../lib/api';
import { useAuth } from '../src/contexts/AuthContext';
import toast from 'react-hot-toast';

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  unreadCount?: number;
  onUnreadCountChange?: (count: number) => void;
}

export default function NotificationDropdown({ isOpen, onClose, unreadCount: externalUnreadCount, onUnreadCountChange }: NotificationDropdownProps) {
  const { isAuthenticated } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(externalUnreadCount || 0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const updateUnreadCount = (count: number) => {
    setUnreadCount(count);
    onUnreadCountChange?.(count);
  };

  const fetchAlerts = async () => {
    if (!isAuthenticated) return;
    
    try {
      setIsLoading(true);
      const response = await eventsApi.getAlerts({ limit: 20, unread_only: false });
      setAlerts(response.alerts);
      updateUnreadCount(response.unread_count);
    } catch (error: any) {
      console.error('Failed to fetch alerts:', error);
      toast.error('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      fetchAlerts();
    }
  }, [isOpen, isAuthenticated]);

  // Poll for new alerts every 3 seconds when dropdown is open (reduced from 30s for faster updates)
  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;
    
    const interval = setInterval(() => {
      fetchAlerts();
    }, 3000);  // Reduced from 30000ms to 3000ms

    return () => clearInterval(interval);
  }, [isOpen, isAuthenticated]);

  // Poll for unread count every 2 seconds when dropdown is closed (reduced from 10s for faster updates)
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const fetchUnreadCount = async () => {
      try {
        const response = await eventsApi.getAlerts({ limit: 1, unread_only: true });
        updateUnreadCount(response.unread_count);
      } catch (error) {
        // Silently fail for background polling
      }
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 2000);  // Reduced from 10000ms to 2000ms
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const handleAcknowledge = async (alertId: string) => {
    try {
      await eventsApi.acknowledgeAlert(alertId);
      setAlerts(prev => prev.map(alert => 
        alert.id === alertId ? { ...alert, acknowledged: true } : alert
      ));
      updateUnreadCount(Math.max(0, unreadCount - 1));
      toast.success('Notification marked as read');
    } catch (error: any) {
      toast.error('Failed to acknowledge notification');
    }
  };

  const handleAcknowledgeAll = async () => {
    try {
      await eventsApi.acknowledgeAllAlerts();
      setAlerts(prev => prev.map(alert => ({ ...alert, acknowledged: true })));
      updateUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (error: any) {
      toast.error('Failed to acknowledge all notifications');
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'medium':
        return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case 'low':
        return <Info className="w-4 h-4 text-yellow-500" />;
      default:
        return <Info className="w-4 h-4 text-slate-400" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'border-red-500/50 bg-red-500/10';
      case 'medium':
        return 'border-orange-500/50 bg-orange-500/10';
      case 'low':
        return 'border-yellow-500/50 bg-yellow-500/10';
      default:
        return 'border-slate-500/50 bg-slate-500/10';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full mt-2 w-96 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-[600px] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-100">Notifications</h3>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleAcknowledgeAll}
              className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Alerts List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Bell className="w-12 h-12 text-slate-500 mb-3" />
            <p className="text-slate-400">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 hover:bg-slate-750 transition-colors ${
                  !alert.acknowledged ? getSeverityColor(alert.severity) : 'border-l-4 border-transparent'
                } ${!alert.acknowledged ? 'border-l-4' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {getSeverityIcon(alert.severity)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium ${!alert.acknowledged ? 'text-slate-100' : 'text-slate-400'}`}>
                        {alert.message}
                      </p>
                      {!alert.acknowledged && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0"
                          title="Mark as read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                      {alert.store_name && (
                        <span>{alert.store_name}</span>
                      )}
                      {alert.camera_name && (
                        <>
                          <span>•</span>
                          <span>{alert.camera_name}</span>
                        </>
                      )}
                      {alert.anomaly_type && (
                        <>
                          <span>•</span>
                          <span className="capitalize">{alert.anomaly_type}</span>
                        </>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatTime(alert.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

