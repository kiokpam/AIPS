'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Store as StoreIcon, 
  Camera, 
  Filter, 
  ChevronDown,
  X,
  Check,
  Building2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Store {
  id: string;
  name: string;
}

interface CameraItem {
  id: string;
  name: string;
  store_id: string;
  is_active: boolean;
}

interface DashboardFiltersProps {
  stores: Store[];
  cameras: CameraItem[];
  selectedStore: string;
  selectedCameras: string[];
  onStoreChange: (storeId: string) => void;
  onCamerasChange: (cameraIds: string[]) => void;
  lang?: 'en' | 'vi';
}

export default function DashboardFilters({
  stores,
  cameras,
  selectedStore,
  selectedCameras,
  onStoreChange,
  onCamerasChange,
  lang = 'en',
}: DashboardFiltersProps) {
  const [showCameraDropdown, setShowCameraDropdown] = useState(false);

  // Filter cameras by selected store
  const filteredCameras = useMemo(() => {
    if (selectedStore === 'all') return cameras;
    return cameras.filter(c => c.store_id === selectedStore);
  }, [cameras, selectedStore]);

  // Auto-select all cameras when store changes
  useEffect(() => {
    if (selectedStore === 'all') {
      onCamerasChange([]);
    } else {
      // Select all cameras for the store by default
      const storeCameras = cameras.filter(c => c.store_id === selectedStore);
      onCamerasChange(storeCameras.map(c => c.id));
    }
  }, [selectedStore, cameras]);

  const handleStoreChange = (storeId: string) => {
    onStoreChange(storeId);
    setShowCameraDropdown(false);
  };

  const toggleCamera = (cameraId: string) => {
    if (selectedCameras.includes(cameraId)) {
      onCamerasChange(selectedCameras.filter(id => id !== cameraId));
    } else {
      onCamerasChange([...selectedCameras, cameraId]);
    }
  };

  const selectAllCameras = () => {
    onCamerasChange(filteredCameras.map(c => c.id));
  };

  const clearCameras = () => {
    onCamerasChange([]);
  };

  const getSelectedCamerasLabel = () => {
    if (selectedCameras.length === 0 || selectedCameras.length === filteredCameras.length) {
      return lang === 'vi' ? 'Tất cả camera' : 'All Cameras';
    }
    if (selectedCameras.length === 1) {
      const cam = cameras.find(c => c.id === selectedCameras[0]);
      return cam?.name || (lang === 'vi' ? '1 camera' : '1 camera');
    }
    return lang === 'vi' 
      ? `${selectedCameras.length} camera đã chọn` 
      : `${selectedCameras.length} cameras selected`;
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Store Filter - Pills/Tabs Style */}
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-slate-400" />
        <div className="flex bg-slate-800/80 backdrop-blur border border-slate-700 rounded-xl p-1 overflow-x-auto">
          <button
            onClick={() => handleStoreChange('all')}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
              selectedStore === 'all'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            {lang === 'vi' ? 'Tất cả' : 'All Stores'}
          </button>
          {stores.map(store => (
            <button
              key={store.id}
              onClick={() => handleStoreChange(store.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                selectedStore === store.id
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              {store.name}
            </button>
          ))}
        </div>
      </div>

      {/* Camera Filter - Dropdown (only when store is selected) */}
      {selectedStore !== 'all' && filteredCameras.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowCameraDropdown(!showCameraDropdown)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 hover:bg-slate-700 transition-colors min-w-[180px]"
          >
            <Camera className="w-4 h-4 text-slate-400" />
            <span className="flex-1 text-left text-sm truncate">{getSelectedCamerasLabel()}</span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showCameraDropdown ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showCameraDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 mt-2 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden"
              >
                {/* Header */}
                <div className="p-3 border-b border-slate-700 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200">
                    {lang === 'vi' ? 'Chọn camera' : 'Select Cameras'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllCameras}
                      className="text-xs px-2 py-1 text-blue-400 hover:bg-blue-900/30 rounded transition-colors"
                    >
                      {lang === 'vi' ? 'Chọn tất cả' : 'Select All'}
                    </button>
                    <button
                      onClick={clearCameras}
                      className="text-xs px-2 py-1 text-slate-400 hover:bg-slate-700 rounded transition-colors"
                    >
                      {lang === 'vi' ? 'Bỏ chọn' : 'Clear'}
                    </button>
                  </div>
                </div>

                {/* Camera List */}
                <div className="max-h-60 overflow-y-auto p-2">
                  {filteredCameras.map(camera => (
                    <button
                      key={camera.id}
                      onClick={() => toggleCamera(camera.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        selectedCameras.includes(camera.id)
                          ? 'bg-blue-900/30 text-blue-300'
                          : 'text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedCameras.includes(camera.id)
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-slate-600'
                      }`}>
                        {selectedCameras.includes(camera.id) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{camera.name}</p>
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${camera.is_active ? 'bg-green-500' : 'bg-slate-500'}`} />
                          <span className="text-xs text-slate-500">
                            {camera.is_active 
                              ? (lang === 'vi' ? 'Đang hoạt động' : 'Active')
                              : (lang === 'vi' ? 'Không hoạt động' : 'Inactive')
                            }
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-slate-700">
                  <button
                    onClick={() => setShowCameraDropdown(false)}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {lang === 'vi' ? 'Áp dụng' : 'Apply'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Active Filters Tags */}
      {selectedStore !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900/30 border border-blue-700/50 rounded-full text-blue-300 text-xs">
            <StoreIcon className="w-3 h-3" />
            {stores.find(s => s.id === selectedStore)?.name}
            <button 
              onClick={() => handleStoreChange('all')}
              className="ml-1 p-0.5 hover:bg-blue-700/30 rounded-full transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
          {selectedCameras.length > 0 && selectedCameras.length < filteredCameras.length && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-900/30 border border-purple-700/50 rounded-full text-purple-300 text-xs">
              <Camera className="w-3 h-3" />
              {selectedCameras.length} {lang === 'vi' ? 'camera' : 'cameras'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

