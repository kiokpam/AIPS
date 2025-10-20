import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import { 
  Plus, 
  Camera, 
  Video, 
  Eye, 
  Settings,
  MoreVertical,
  Play,
  Pause,
  Wifi,
  WifiOff,
  MapPin,
  Store,
  Users,
  AlertTriangle
} from 'lucide-react';

type Camera = { 
  id: string; 
  store_id: string; 
  name: string; 
  rtsp_url?: string;
  status?: 'online' | 'offline' | 'recording';
  location?: string;
};

type Store = {
  id: string;
  name: string;
};

export default function Cameras() {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [name, setName] = useState('');
  const [storeId, setStoreId] = useState('');
  const [rtsp, setRtsp] = useState('');
  const [location, setLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadCameras = async () => {
    try {
      const res = await fetch(`${base}/api/cameras`);
      const data = await res.json();
      setCameras(data);
    } catch (error) {
      console.error('Failed to load cameras:', error);
    }
  };

  const loadStores = async () => {
    try {
      const res = await fetch(`${base}/api/stores`);
      const data = await res.json();
      setStores(data);
    } catch (error) {
      console.error('Failed to load stores:', error);
    }
  };

  const createCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await fetch(`${base}/api/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          store_id: storeId, 
          rtsp_url: rtsp || null,
          location: location || null
        }),
      });
      setName('');
      setStoreId('');
      setRtsp('');
      setLocation('');
      setShowCreateForm(false);
      loadCameras();
    } catch (error) {
      console.error('Failed to create camera:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { 
    loadCameras();
    loadStores();
  }, []);

  const getStoreName = (storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    return store?.name || 'Unknown Store';
  };

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cameras</h1>
            <p className="mt-2 text-gray-600">
              Monitor and manage your surveillance cameras across all locations
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn btn-primary btn-lg"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Camera
          </button>
        </div>

        {/* Create Camera Form */}
        {showCreateForm && (
          <div className="card animate-slide-up">
            <div className="card-header">
              <h2 className="text-xl font-semibold text-gray-900">Add New Camera</h2>
            </div>
            <div className="card-body">
              <form onSubmit={createCamera} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="camera-name" className="block text-sm font-medium text-gray-700 mb-1">
                      Camera Name
                    </label>
                    <input
                      id="camera-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                      placeholder="Enter camera name"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="store-select" className="block text-sm font-medium text-gray-700 mb-1">
                      Store
                    </label>
                    <select
                      id="store-select"
                      value={storeId}
                      onChange={(e) => setStoreId(e.target.value)}
                      className="input"
                      required
                    >
                      <option value="">Select a store</option>
                      {stores.map(store => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="camera-location" className="block text-sm font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <input
                      id="camera-location"
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="input"
                      placeholder="e.g., Main Entrance, Parking Lot"
                    />
                  </div>
                  <div>
                    <label htmlFor="rtsp-url" className="block text-sm font-medium text-gray-700 mb-1">
                      RTSP URL
                    </label>
                    <input
                      id="rtsp-url"
                      type="url"
                      value={rtsp}
                      onChange={(e) => setRtsp(e.target.value)}
                      className="input"
                      placeholder="rtsp://camera-ip:554/stream"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn btn-primary"
                  >
                    {isLoading ? 'Adding...' : 'Add Camera'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Cameras Grid */}
        {cameras.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <Camera className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No cameras found</h3>
              <p className="text-gray-600 mb-4">Get started by adding your first surveillance camera.</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="btn btn-primary"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Camera
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cameras.map((camera) => (
              <div key={camera.id} className="card hover:shadow-medium transition-shadow duration-200">
                <div className="card-body">
                  {/* Camera Preview Placeholder */}
                  <div className="relative bg-gray-100 rounded-lg h-48 mb-4 flex items-center justify-center">
                    <div className="text-center">
                      <Camera className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Camera Preview</p>
                    </div>
                    <div className="absolute top-2 right-2">
                      <span className={`status-badge ${
                        camera.status === 'online' ? 'status-online' :
                        camera.status === 'recording' ? 'status-warning' :
                        'status-offline'
                      }`}>
                        {camera.status || 'offline'}
                      </span>
                    </div>
                  </div>

                  {/* Camera Info */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{camera.name}</h3>
                        <div className="flex items-center text-sm text-gray-600 mt-1">
                          <Store className="h-4 w-4 mr-1" />
                          {getStoreName(camera.store_id)}
                        </div>
                      </div>
                      <button className="p-1 text-gray-400 hover:text-gray-600">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>

                    {camera.location && (
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-2" />
                        <span>{camera.location}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center text-gray-600">
                        <Users className="h-4 w-4 mr-2" />
                        <span>0 people detected</span>
                      </div>
                      <div className="flex items-center text-gray-600">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        <span>0 alerts</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex space-x-2">
                      <button className="btn btn-secondary btn-sm flex-1">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </button>
                      <button className="btn btn-secondary btn-sm flex-1">
                        <Settings className="h-4 w-4 mr-1" />
                        Settings
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card">
            <div className="card-body text-center">
              <div className="text-2xl font-bold text-primary-600">{cameras.length}</div>
              <div className="text-sm text-gray-600">Total Cameras</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body text-center">
              <div className="text-2xl font-bold text-success-600">
                {cameras.filter(c => c.status === 'online').length}
              </div>
              <div className="text-sm text-gray-600">Online</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body text-center">
              <div className="text-2xl font-bold text-warning-600">
                {cameras.filter(c => c.status === 'recording').length}
              </div>
              <div className="text-sm text-gray-600">Recording</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body text-center">
              <div className="text-2xl font-bold text-danger-600">
                {cameras.filter(c => c.status === 'offline' || !c.status).length}
              </div>
              <div className="text-sm text-gray-600">Offline</div>
            </div>
          </div>
        </div>
      </div>
      </Layout>
    </ProtectedRoute>
  );
}