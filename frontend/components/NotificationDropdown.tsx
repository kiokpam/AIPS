'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, Check, CheckCheck, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { eventsApi, Alert, buildWsUrl } from '../lib/api';
import { useAuth } from '../src/contexts/AuthContext';
import { wsManager } from '../lib/websocket-manager';
import toast from 'react-hot-toast';

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  unreadCount?: number;
  onUnreadCountChange?: (count: number) => void;
}

export default function NotificationDropdown({ isOpen, onClose, unreadCount: externalUnreadCount, onUnreadCountChange }: NotificationDropdownProps) {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(externalUnreadCount || 0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const previousAlertIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);
  
  const updateUnreadCount = (count: number) => {
    setUnreadCount(count);
    onUnreadCountChange?.(count);
  };

  const fetchAlerts = async () => {
    if (!isAuthenticated) return;
    
    try {
      setIsLoading(true);
      const response = await eventsApi.getAlerts({ limit: 20, unread_only: false });
      const newAlerts = response.alerts;
      
      // Detect new behavior alerts and show toast notifications (only if not initial load)
      const currentAlertIds = new Set(newAlerts.map(a => a.id));
      
      if (!isInitialLoadRef.current) {
        const newBehaviorAlerts = newAlerts.filter(alert => {
          // Check if it's a behavior alert (has anomaly_type) and is new
          return alert.anomaly_type && 
                 !alert.acknowledged && 
                 !previousAlertIdsRef.current.has(alert.id);
        });
        
        // Show toast for new behavior alerts
        newBehaviorAlerts.forEach(alert => {
          toast(
            (t) => (
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{alert.message}</p>
                  {alert.camera_name && (
                    <p className="text-xs text-slate-600 mt-0.5">{alert.camera_name}</p>
                  )}
                  {alert.anomaly_type && (
                    <p className="text-xs text-slate-500 mt-0.5 capitalize">{alert.anomaly_type}</p>
                  )}
                  <button
                    onClick={() => {
                      toast.dismiss(t.id);
                      router.push('/dashboard/behavior');
                    }}
                    className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 underline"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ),
            {
              duration: 5000,
              icon: '🚨',
              style: {
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#1f2937',
              },
            }
          );
        });
      }
      
      // Update previous alert IDs and mark initial load as complete
      previousAlertIdsRef.current = currentAlertIds;
      isInitialLoadRef.current = false;
      
      setAlerts(newAlerts);
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

  // Refresh alerts when dropdown opens (WebSocket handles real-time updates, so less frequent polling needed)
  useEffect(() => {
    if (isOpen && isAuthenticated) {
      fetchAlerts();
    }
  }, [isOpen, isAuthenticated]);

  // WebSocket connection for real-time alert updates
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;
    
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    // Include JWT token in WebSocket URL for authentication with notification service
    const wsUrl = buildWsUrl(`/ws/alerts?token=${encodeURIComponent(token)}`, true);

    const ws = wsManager.getConnection({
      url: wsUrl,
      reconnect: true,
      reconnectDelay: 3000,
      onMessage: (data) => {
        if (data.type === 'alert_update' && data.alert) {
          const newAlert = data.alert as Alert;
          
          // Add new alert to the list (prepend to show newest first)
          setAlerts(prev => {
            // Check if alert already exists (avoid duplicates)
            if (prev.some(a => a.id === newAlert.id)) {
              return prev;
            }
            return [newAlert, ...prev];
          });
          
          // Update unread count
          if (!newAlert.acknowledged) {
            setUnreadCount(prev => {
              const newCount = prev + 1;
              onUnreadCountChange?.(newCount);
              return newCount;
            });
          }
          
          // Show toast notification for new behavior alerts
          if (newAlert.anomaly_type && !newAlert.acknowledged) {
            toast(
              (t) => (
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{newAlert.message}</p>
                    {newAlert.camera_name && (
                      <p className="text-xs text-slate-600 mt-0.5">{newAlert.camera_name}</p>
                    )}
                    {newAlert.anomaly_type && (
                      <p className="text-xs text-slate-500 mt-0.5 capitalize">{newAlert.anomaly_type}</p>
                    )}
                    <button
                      onClick={() => {
                        toast.dismiss(t.id);
                        router.push('/dashboard/behavior');
                      }}
                      className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 underline"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ),
              {
                duration: 5000,
                icon: '🚨',
                style: {
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#1f2937',
                },
              }
            );
          }
          
          // Update previous alert IDs
          previousAlertIdsRef.current.add(newAlert.id);
        }
      },
      onError: (err) => {
        console.error('Alerts websocket error:', err);
      },
    });

    // Connection persists across navigations
    return () => {
      // Don't close - let manager handle it
    };
  }, [isAuthenticated, user, router, onUnreadCountChange]);

  // Poll for alerts less frequently now (every 30 seconds) since we have WebSocket for real-time updates
  // This is just a fallback in case WebSocket disconnects
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const fetchAlertsPeriodically = async () => {
      try {
        const response = await eventsApi.getAlerts({ limit: 20, unread_only: false });
        setAlerts(response.alerts);
        updateUnreadCount(response.unread_count);
        
        // Update previous alert IDs
        const currentAlertIds = new Set(response.alerts.map(a => a.id));
        previousAlertIdsRef.current = currentAlertIds;
        isInitialLoadRef.current = false;
      } catch (error: any) {
        console.error('Failed to fetch alerts:', error);
      }
    };
    
    // Initial fetch
    fetchAlertsPeriodically();
    
    // Poll every 30 seconds as fallback (much less frequent since WebSocket handles real-time)
    const interval = setInterval(fetchAlertsPeriodically, 30000);
    
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
    // Show date/time in the viewer's local timezone
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
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
            {alerts.map((alert) => {
              const isBehaviorAlert = !!alert.anomaly_type;
              const handleClick = () => {
                if (isBehaviorAlert) {
                  router.push('/dashboard/behavior');
                  onClose();
                }
              };
              
              return (
                <div
                  key={alert.id}
                  onClick={handleClick}
                  className={`p-4 transition-colors ${
                    isBehaviorAlert ? 'cursor-pointer hover:bg-slate-700/50' : 'hover:bg-slate-750'
                  } ${
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
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAcknowledge(alert.id);
                            }}
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
                      <div className="mt-1 flex items-center justify-between">
                        <p className="text-xs text-slate-500">
                          {formatTime(alert.timestamp)}
                        </p>
                        {isBehaviorAlert && (
                          <span className="text-xs text-blue-400 font-medium">
                            Click to view →
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

