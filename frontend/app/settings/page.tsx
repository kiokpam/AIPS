'use client';

import { useState, memo } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings as SettingsIcon, 
  Camera, 
  Bell, 
  Shield, 
  Database,
  Monitor,
  AlertTriangle,
  Save,
  RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

// Hoisted to module scope to avoid remounts on every state change
const SettingSection = memo(({ 
  title, 
  icon: Icon, 
  children 
}: { 
  title: string; 
  icon: any; 
  children: React.ReactNode; 
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
  >
    <div className="flex items-center space-x-3 mb-6">
      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
        <Icon className="w-5 h-5 text-blue-600" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
    </div>
    {children}
  </motion.div>
));
SettingSection.displayName = 'SettingSection';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    // Camera Settings
    defaultModel: 'yolov8n',
    defaultDevice: 'cpu',
    confidenceThreshold: 0.5,
    iouThreshold: 0.45,
    maxDetections: 100,
    skipFrames: 1,
    
    // System Settings
    maxFileSize: 100, // MB
    retentionDays: 30,
    autoCleanup: true,
    
    // Notification Settings
    emailNotifications: true,
    alertThreshold: 5,
    realTimeAlerts: true,
    
    // Security Settings
    sessionTimeout: 30, // minutes
    requireAuth: true,
    logLevel: 'info'
  });

  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (section: string, field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Settings saved successfully!');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSettings({
      defaultModel: 'yolov8n',
      defaultDevice: 'cpu',
      confidenceThreshold: 0.5,
      iouThreshold: 0.45,
      maxDetections: 100,
      skipFrames: 1,
      maxFileSize: 100,
      retentionDays: 30,
      autoCleanup: true,
      emailNotifications: true,
      alertThreshold: 5,
      realTimeAlerts: true,
      sessionTimeout: 30,
      requireAuth: true,
      logLevel: 'info'
    });
    toast.success('Settings reset to defaults');
  };

  return (
    <div className="space-y-8 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-slate-300 mt-2">Manage your AIPS system configuration</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleReset}
            className="btn-outline btn-md"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="btn-primary btn-md"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Camera Settings */}
        <SettingSection title="Camera Settings" icon={Camera}>
          <div className="space-y-4">
            <div>
              <label className="label block mb-2">Default AI Model</label>
              <select
                value={settings.defaultModel}
                onChange={(e) => handleInputChange('camera', 'defaultModel', e.target.value)}
                className="input"
              >
                <option value="yolov8n">YOLOv8 Nano (Fastest)</option>
                <option value="yolov8s">YOLOv8 Small</option>
                <option value="yolov8m">YOLOv8 Medium</option>
                <option value="yolov8l">YOLOv8 Large</option>
                <option value="yolov8x">YOLOv8 Extra Large (Most Accurate)</option>
              </select>
            </div>

            <div>
              <label className="label block mb-2">Default Device</label>
              <select
                value={settings.defaultDevice}
                onChange={(e) => handleInputChange('camera', 'defaultDevice', e.target.value)}
                className="input"
              >
                <option value="cpu">CPU</option>
                <option value="cuda">GPU (CUDA)</option>
                <option value="mps">Apple Silicon (MPS)</option>
              </select>
            </div>

            <div>
              <label className="label block mb-2">
                Confidence Threshold: {settings.confidenceThreshold}
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={settings.confidenceThreshold}
                onChange={(e) => handleInputChange('camera', 'confidenceThreshold', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="label block mb-2">
                IOU Threshold: {settings.iouThreshold}
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={settings.iouThreshold}
                onChange={(e) => handleInputChange('camera', 'iouThreshold', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </SettingSection>

        {/* System Settings */}
        <SettingSection title="System Settings" icon={Monitor}>
          <div className="space-y-4">
            <div>
              <label className="label block mb-2">Max File Size (MB)</label>
              <input
                type="number"
                value={settings.maxFileSize}
                onChange={(e) => handleInputChange('system', 'maxFileSize', parseInt(e.target.value))}
                className="input"
                min="1"
                max="1000"
              />
            </div>

            <div>
              <label className="label block mb-2">Data Retention (Days)</label>
              <input
                type="number"
                value={settings.retentionDays}
                onChange={(e) => handleInputChange('system', 'retentionDays', parseInt(e.target.value))}
                className="input"
                min="1"
                max="365"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="label">Auto Cleanup</label>
              <input
                type="checkbox"
                checked={settings.autoCleanup}
                onChange={(e) => handleInputChange('system', 'autoCleanup', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="label block mb-2">Session Timeout (Minutes)</label>
              <input
                type="number"
                value={settings.sessionTimeout}
                onChange={(e) => handleInputChange('system', 'sessionTimeout', parseInt(e.target.value))}
                className="input"
                min="5"
                max="480"
              />
            </div>
          </div>
        </SettingSection>

        {/* Notification Settings */}
        <SettingSection title="Notification Settings" icon={Bell}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="label">Email Notifications</label>
              <input
                type="checkbox"
                checked={settings.emailNotifications}
                onChange={(e) => handleInputChange('notification', 'emailNotifications', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="label block mb-2">Alert Threshold</label>
              <input
                type="number"
                value={settings.alertThreshold}
                onChange={(e) => handleInputChange('notification', 'alertThreshold', parseInt(e.target.value))}
                className="input"
                min="1"
                max="100"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="label">Real-time Alerts</label>
              <input
                type="checkbox"
                checked={settings.realTimeAlerts}
                onChange={(e) => handleInputChange('notification', 'realTimeAlerts', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>
          </div>
        </SettingSection>

        {/* Security Settings */}
        <SettingSection title="Security Settings" icon={Shield}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="label">Require Authentication</label>
              <input
                type="checkbox"
                checked={settings.requireAuth}
                onChange={(e) => handleInputChange('security', 'requireAuth', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="label block mb-2">Log Level</label>
              <select
                value={settings.logLevel}
                onChange={(e) => handleInputChange('security', 'logLevel', e.target.value)}
                className="input"
              >
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>
        </SettingSection>
      </div>
    </div>
  );
}
