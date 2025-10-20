import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import { 
  Plus, 
  Store, 
  MapPin, 
  Users, 
  Camera, 
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Settings
} from 'lucide-react';

type Store = { 
  id: string; 
  name: string; 
  address?: string;
  camera_count?: number;
  status?: 'active' | 'inactive';
};

export default function Stores() {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const [stores, setStores] = useState<Store[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadStores = async () => {
    try {
      const res = await fetch(`${base}/api/stores`);
      const data = await res.json();
      setStores(data);
    } catch (error) {
      console.error('Failed to load stores:', error);
    }
  };

  const createStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await fetch(`${base}/api/stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address }),
      });
      setName('');
      setAddress('');
      setShowCreateForm(false);
      loadStores();
    } catch (error) {
      console.error('Failed to create store:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { 
    loadStores(); 
  }, []);

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Stores</h1>
            <p className="mt-2 text-gray-600">
              Manage your surveillance locations and monitor their status
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn btn-primary btn-lg"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Store
          </button>
        </div>

        {/* Create Store Form */}
        {showCreateForm && (
          <div className="card animate-slide-up">
            <div className="card-header">
              <h2 className="text-xl font-semibold text-gray-900">Create New Store</h2>
            </div>
            <div className="card-body">
              <form onSubmit={createStore} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="store-name" className="block text-sm font-medium text-gray-700 mb-1">
                      Store Name
                    </label>
                    <input
                      id="store-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                      placeholder="Enter store name"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="store-address" className="block text-sm font-medium text-gray-700 mb-1">
                      Address
                    </label>
                    <input
                      id="store-address"
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="input"
                      placeholder="Enter store address"
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
                    {isLoading ? 'Creating...' : 'Create Store'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Stores Grid */}
        {stores.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <Store className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No stores found</h3>
              <p className="text-gray-600 mb-4">Get started by creating your first store location.</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="btn btn-primary"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Store
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store) => (
              <div key={store.id} className="card hover:shadow-medium transition-shadow duration-200">
                <div className="card-body">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center">
                      <div className="p-2 bg-primary-100 rounded-lg">
                        <Store className="h-5 w-5 text-primary-600" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-lg font-semibold text-gray-900">{store.name}</h3>
                        <span className="status-badge status-online">Active</span>
                      </div>
                    </div>
                    <div className="relative">
                      <button className="p-1 text-gray-400 hover:text-gray-600">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {store.address && (
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-2" />
                        <span className="truncate">{store.address}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center text-gray-600">
                        <Camera className="h-4 w-4 mr-2" />
                        <span>{store.camera_count || 0} cameras</span>
                      </div>
                      <div className="flex items-center text-gray-600">
                        <Users className="h-4 w-4 mr-2" />
                        <span>0 people</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex space-x-2">
                      <button className="btn btn-secondary btn-sm flex-1">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </button>
                      <button className="btn btn-secondary btn-sm flex-1">
                        <Settings className="h-4 w-4 mr-1" />
                        Manage
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
              <div className="text-2xl font-bold text-primary-600">{stores.length}</div>
              <div className="text-sm text-gray-600">Total Stores</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body text-center">
              <div className="text-2xl font-bold text-success-600">{stores.length}</div>
              <div className="text-sm text-gray-600">Active Stores</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body text-center">
              <div className="text-2xl font-bold text-warning-600">
                {stores.reduce((sum, store) => sum + (store.camera_count || 0), 0)}
              </div>
              <div className="text-sm text-gray-600">Total Cameras</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body text-center">
              <div className="text-2xl font-bold text-danger-600">0</div>
              <div className="text-sm text-gray-600">Alerts Today</div>
            </div>
          </div>
        </div>
      </div>
      </Layout>
    </ProtectedRoute>
  );
}