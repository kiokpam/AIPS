'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  Store,
  Plus,
  Key,
  Shield,
  Camera as CameraIcon,
  Users,
  CheckCircle,
  X,
  AlertTriangle,
  Settings,
  Eye,
  EyeOff,
  Trash2,
  Copy
} from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useData } from '@/src/contexts/DataContext';
import { authApi, storeApi, cameraApi, Store as StoreType, Camera, MemberPermissionRequest, StoreMemberAccountSummary } from '@/lib/api';
import toast from 'react-hot-toast';

interface StoreWithAccess extends StoreType {
  hasMemberAccess: boolean;
  cameraCount: number;
  memberPermissions?: {
    can_access_dashboard: boolean;
    accessible_cameras: string[];
  };
}

export default function ManagersPage() {
  const { user, isAuthenticated } = useAuth();
  const { stores: storesFromContext, cameras: camerasFromContext, isLoading: dataLoading, refreshAll } = useData();
  const [stores, setStores] = useState<StoreWithAccess[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);
  const [showMemberAccessModal, setShowMemberAccessModal] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreWithAccess | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [newStoreName, setNewStoreName] = useState('');
  const [memberUsername, setMemberUsername] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<{username: string; email: string} | null>(null);
  const [storeMembers, setStoreMembers] = useState<Record<string, StoreMemberAccountSummary[]>>({});
  const [storeMembersLoading, setStoreMembersLoading] = useState<Record<string, boolean>>({});
  const [editingMember, setEditingMember] = useState<StoreMemberAccountSummary | null>(null);
  const [permissionFormData, setPermissionFormData] = useState<{
    camera_ids: string[];
    can_access_dashboard: boolean;
  }>({
    camera_ids: [],
    can_access_dashboard: true
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  // Use data from DataContext instead of making redundant API calls
  useEffect(() => {
    if (isAuthenticated && user?.active_membership.role === 'manager') {
      if (storesFromContext.length > 0 || !dataLoading) {
        // Data is already loaded from DataContext
        const storesWithAccess: StoreWithAccess[] = storesFromContext.map((store) => {
          const storeCameras = camerasFromContext.filter(c => c.store_id === store.id);
          
          return {
            ...store,
            hasMemberAccess: false, // Will be determined when checking permissions
            cameraCount: storeCameras.length,
            memberPermissions: undefined // Will be loaded when opening modal
          };
        });
        
        setStores(storesWithAccess);
        setCameras(camerasFromContext);
        setIsLoading(false);
      } else {
        // Still loading from DataContext
        setIsLoading(true);
      }
    }
  }, [isAuthenticated, user, storesFromContext, camerasFromContext, dataLoading]);

  const loadStoreMembers = async (storeId: string, silent = false) => {
    setStoreMembersLoading(prev => ({ ...prev, [storeId]: true }));
    try {
      const members = await storeApi.getStoreMembers(storeId);
      setStoreMembers(prev => ({ ...prev, [storeId]: members }));
      setStores(prev =>
        prev.map(store =>
          store.id === storeId ? { ...store, hasMemberAccess: members.length > 0 } : store
        )
      );
      if (!silent && members.length === 0) {
        toast('No member accounts created yet for this store', { icon: 'ℹ️' });
      }
    } catch (error: any) {
      if (!silent) {
        toast.error(error.response?.data?.detail || 'Failed to load store members');
      }
    } finally {
      setStoreMembersLoading(prev => ({ ...prev, [storeId]: false }));
    }
  };

  const handleAddStore = async () => {
    if (!newStoreName.trim()) {
      setErrors({ name: 'Store name is required' });
      return;
    }
    
    try {
      await storeApi.createStore(newStoreName.trim());
      toast.success('Store created successfully');
      setShowAddStoreModal(false);
      setNewStoreName('');
      setErrors({});
      // Refresh data from DataContext instead of calling loadStores
      await refreshAll();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create store');
    }
  };

  const handleOpenMemberAccess = async (store: StoreWithAccess) => {
    setSelectedStore(store);
    setEditingMember(null);
    
    // Load cameras for this store (use DataContext)
    const storeCameras = camerasFromContext.filter(c => c.store_id === store.id);
    setCameras(storeCameras);
    
    // Load existing permissions if any
    // For now, we'll start fresh - in production, load from API
    setPermissionFormData({
      camera_ids: [],
      can_access_dashboard: true
    });
    setMemberUsername('');
    setMemberPassword('');
    setConfirmPassword('');
    setCreatedAccount(null);
    setErrors({});
    setStoreMembers(prev => ({ ...prev, [store.id]: prev[store.id] ?? [] }));
    loadStoreMembers(store.id, true);
    
    setShowMemberAccessModal(true);
  };

  const handleEditMember = async (member: StoreMemberAccountSummary) => {
    // Find the store this member belongs to
    const memberStore = stores.find(s => s.id === member.store_id);
    if (!memberStore) {
      toast.error('Store not found for this member');
      return;
    }
    
    setSelectedStore(memberStore);
    setEditingMember(member);
    setMemberUsername(member.username);
    setMemberPassword('');
    setConfirmPassword('');
    setPermissionFormData({
      camera_ids: member.camera_access.map((c) => c.camera_id),
      can_access_dashboard: member.can_access_dashboard,
    });
    setErrors({});
    setCreatedAccount(null);
    
    // Load cameras for this store (use DataContext)
    const storeCameras = camerasFromContext.filter(c => c.store_id === memberStore.id);
    setCameras(storeCameras);
    setShowMemberAccessModal(true);
    toast(`Editing access for ${member.username}`, { icon: '✏️' });
  };

  const handleSaveMemberAccess = async () => {
    if (!selectedStore || !user?.active_membership.organization.id) return;
    
    const isEditing = !!editingMember;
    const newErrors: {[key: string]: string} = {};
    
    // Username validation
    const usernameTrimmed = memberUsername.trim();
    if (!usernameTrimmed) {
      newErrors.username = 'Username is required';
    } else if (!isEditing) {
      if (usernameTrimmed.length < 3) {
        newErrors.username = 'Username must be at least 3 characters';
      } else if (usernameTrimmed.length > 30) {
        newErrors.username = 'Username must be less than 30 characters';
      } else if (!/^[a-zA-Z0-9_-]+$/.test(usernameTrimmed)) {
        newErrors.username = 'Username can only contain letters, numbers, underscores, and hyphens';
      }
    }
    
    // Password validation
    if (!isEditing || memberPassword) {
      if (!memberPassword) {
        newErrors.password = 'Password is required';
      } else if (memberPassword.length < 8) {
        newErrors.password = 'Password must be at least 8 characters';
      } else if (memberPassword.length > 128) {
        newErrors.password = 'Password must be less than 128 characters';
      }
    }

    if (memberPassword) {
      const hasLowercase = /[a-z]/.test(memberPassword);
      const hasUppercase = /[A-Z]/.test(memberPassword);
      const hasNumber = /[0-9]/.test(memberPassword);
      
      if (!hasLowercase) {
        newErrors.password = 'Password must contain at least one lowercase letter';
      } else if (!hasUppercase) {
        newErrors.password = 'Password must contain at least one uppercase letter';
      } else if (!hasNumber) {
        newErrors.password = 'Password must contain at least one number';
      }
    }
    
    // Confirm password validation
    if (!isEditing || memberPassword) {
      if (!confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your password';
      } else if (memberPassword !== confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }
    
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    
    try {
      if (isEditing && editingMember) {
        await storeApi.updateStoreMemberAccount(selectedStore.id, editingMember.membership_id, {
          camera_ids: permissionFormData.camera_ids,
          can_access_dashboard: permissionFormData.can_access_dashboard,
          password: memberPassword || undefined,
        });
        toast.success('Member account updated');
        await loadStoreMembers(selectedStore.id, true);
        setEditingMember(null);
        setMemberUsername('');
        setMemberPassword('');
        setConfirmPassword('');
        setErrors({});
        // Close modal after successful update
        setShowMemberAccessModal(false);
        setSelectedStore(null);
      } else {
        const result = await storeApi.createStoreMemberAccount(selectedStore.id, {
          username: memberUsername.trim(),
          password: memberPassword,
          camera_ids: permissionFormData.camera_ids,
          can_access_dashboard: permissionFormData.can_access_dashboard
        });
        
        setCreatedAccount({
          username: result.username,
          email: result.user.email
        });
        
        toast.success(`Member account created for ${selectedStore.name}`);
        await loadStoreMembers(selectedStore.id, true);
        await refreshAll();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create member account');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Please log in to access this page</p>
        </div>
      </div>
    );
  }

  if (user?.active_membership.role !== 'manager') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Shield className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-200 mb-2">Access Denied</h2>
          <p className="text-slate-400">You need manager privileges to access this page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Building2 className="w-8 h-8" />
            Store Management
          </h1>
          <p className="text-slate-400 mt-2">
            Manage your stores and configure member access for each branch
          </p>
        </div>
        <button
          onClick={() => setShowAddStoreModal(true)}
          className="btn-primary btn-lg flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Store
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-200">
            <p className="font-medium mb-1">Store-Based Access Control</p>
            <p className="text-blue-300">
              Each store can have its own member account. Members can access the dashboard and cameras for their assigned store only.
            </p>
          </div>
        </div>
      </div>

      {/* Stores Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : stores.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <Store className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-200 mb-2">No stores yet</h3>
          <p className="text-slate-400 mb-6">Create your first store to get started</p>
          <button
            onClick={() => setShowAddStoreModal(true)}
            className="btn-primary btn-md"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Store
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stores.map((store) => (
            <motion.div
              key={store.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800 rounded-xl border border-slate-700 p-6 hover:border-blue-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Store className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">{store.name}</h3>
                    <p className="text-sm text-slate-400">Store Branch</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-2">
                    <CameraIcon className="w-4 h-4" />
                    Cameras
                  </span>
                  <span className="text-slate-200 font-medium">{store.cameraCount}</span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Member Access
                  </span>
                  {store.hasMemberAccess ? (
                    <span className="px-2 py-1 bg-green-900/30 text-green-300 border border-green-700 rounded text-xs">
                      Configured
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-slate-700 text-slate-300 border border-slate-600 rounded text-xs">
                      Not Set
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleOpenMemberAccess(store)}
                className="btn-outline btn-md w-full flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                {store.hasMemberAccess ? 'Manage Access' : 'Configure Access'}
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Store Modal */}
      {showAddStoreModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <Plus className="w-6 h-6" />
                Add New Store
              </h2>
              <button
                onClick={() => {
                  setShowAddStoreModal(false);
                  setNewStoreName('');
                  setErrors({});
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label block mb-2 text-slate-300">Store Name</label>
                <input
                  type="text"
                  value={newStoreName}
                  onChange={(e) => {
                    setNewStoreName(e.target.value);
                    if (errors.name) setErrors({ ...errors, name: '' });
                  }}
                  className={`input bg-slate-700 text-slate-100 ${errors.name ? 'border-red-500' : ''}`}
                  placeholder="e.g., Downtown Branch, Main Street Store"
                />
                {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name}</p>}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddStore}
                className="btn-primary btn-md flex-1"
              >
                Create Store
              </button>
              <button
                onClick={() => {
                  setShowAddStoreModal(false);
                  setNewStoreName('');
                  setErrors({});
                }}
                className="btn-outline btn-md"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Member Access Modal */}
      {showMemberAccessModal && selectedStore && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-green-400" />
                  Configure Member Access
                </h2>
                <p className="text-slate-400 mt-1">
                  Set up member access for {selectedStore.name}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowMemberAccessModal(false);
                  setSelectedStore(null);
                  setMemberUsername('');
                  setMemberPassword('');
                  setConfirmPassword('');
                  setCreatedAccount(null);
                  setEditingMember(null);
                  setErrors({});
                }}
                className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {createdAccount ? (
                /* Success - Show Account Credentials */
                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle className="w-6 h-6 text-green-400" />
                    <h3 className="text-lg font-semibold text-green-200">Member Account Created!</h3>
                  </div>
                  <p className="text-sm text-green-300 mb-4">
                    Share these credentials with the member. They can use this to log in and access {selectedStore.name}.
                  </p>
                  <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Email/Username</label>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-slate-200 bg-slate-800 px-3 py-2 rounded flex-1">
                          {createdAccount.email}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(createdAccount.email);
                            toast.success('Email copied to clipboard');
                          }}
                          className="btn-outline btn-sm"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Password</label>
                      <p className="text-sm text-slate-300">(The password you set above)</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowMemberAccessModal(false);
                      setSelectedStore(null);
                      setMemberUsername('');
                      setMemberPassword('');
                      setConfirmPassword('');
                      setCreatedAccount(null);
                      setErrors({});
                    }}
                    className="btn-primary btn-md w-full mt-4"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Account Creation Form */}
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                    <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
                      <Key className="w-5 h-5 text-blue-400" />
                      {editingMember ? `Update ${editingMember.username}` : 'Create Member Account'}
                    </h3>
                    <p className="text-sm text-slate-400 mb-4">
                      {editingMember
                        ? 'Modify access permissions or reset the password for this store member.'
                        : 'Create a member account for this store. The member will use this to log in and access only this store\'s cameras and dashboard.'}
                    </p>
                    {editingMember && (
                      <div className="mb-4 p-3 rounded-lg bg-purple-900/20 border border-purple-700/40 text-sm text-purple-200">
                        Editing existing account. Username cannot be changed. Update permissions below or set a new password.
                      </div>
                    )}
                    
                    <div className="space-y-4">
                      <div>
                        <label className="label block mb-2 text-slate-300">Username</label>
                        <input
                          type="text"
                          value={memberUsername}
                          disabled={!!editingMember}
                          onChange={(e) => {
                            setMemberUsername(e.target.value);
                            if (errors.username) setErrors({ ...errors, username: '' });
                          }}
                          className={`input bg-slate-700 text-slate-100 ${errors.username ? 'border-red-500' : ''} ${editingMember ? 'opacity-70 cursor-not-allowed' : ''}`}
                          placeholder="e.g., store_manager, branch_staff"
                        />
                        {errors.username && <p className="text-red-400 text-sm mt-1">{errors.username}</p>}
                        <p className="text-xs text-slate-500 mt-1">
                          Username must be 3-30 characters. Only letters, numbers, underscores (_), and hyphens (-) are allowed.
                        </p>
                      </div>

                      <div>
                        <label className="label block mb-2 text-slate-300">
                          {editingMember ? 'New Password (optional)' : 'Password'}
                        </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={memberPassword}
                        onChange={(e) => {
                          setMemberPassword(e.target.value);
                          if (errors.password) setErrors({ ...errors, password: '' });
                        }}
                        className={`input bg-slate-700 text-slate-100 pr-10 ${errors.password ? 'border-red-500' : ''}`}
                        placeholder={editingMember ? 'Leave blank to keep current password' : 'Enter member password'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5 text-slate-400" /> : <Eye className="w-5 h-5 text-slate-400" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-red-400 text-sm mt-1">{errors.password}</p>}
                    <div className="text-xs text-slate-500 mt-1 space-y-1">
                      <p className="font-medium">Password requirements:</p>
                      <ul className="list-disc list-inside space-y-0.5 ml-2">
                        <li className={memberPassword.length >= 8 ? 'text-green-400' : ''}>At least 8 characters</li>
                        <li className={/[a-z]/.test(memberPassword) ? 'text-green-400' : ''}>One lowercase letter</li>
                        <li className={/[A-Z]/.test(memberPassword) ? 'text-green-400' : ''}>One uppercase letter</li>
                        <li className={/[0-9]/.test(memberPassword) ? 'text-green-400' : ''}>One number</li>
                      </ul>
                      {editingMember && (
                        <p className="text-[11px] text-slate-500">Leave blank to keep the existing password unchanged.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="label block mb-2 text-slate-300">
                      {editingMember ? 'Confirm New Password (if changed)' : 'Confirm Password'}
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
                      }}
                      className={`input bg-slate-700 text-slate-100 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                      placeholder="Confirm password"
                    />
                    {errors.confirmPassword && <p className="text-red-400 text-sm mt-1">{errors.confirmPassword}</p>}
                  </div>
                </div>
              </div>

              {/* Dashboard Access */}
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-blue-400" />
                      Dashboard Access
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Allow members to view the analytics dashboard for this store
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permissionFormData.can_access_dashboard}
                      onChange={(e) => setPermissionFormData({
                        ...permissionFormData,
                        can_access_dashboard: e.target.checked
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* Camera Access */}
              <div>
                <h3 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
                  <CameraIcon className="w-5 h-5 text-green-400" />
                  Camera Access
                </h3>
                <p className="text-sm text-slate-400 mb-4">
                  Select which cameras members can view for this store
                </p>
                
                {cameras.length === 0 ? (
                  <div className="bg-slate-900/50 rounded-lg p-8 text-center border border-slate-700">
                    <CameraIcon className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                    <p className="text-slate-400">No cameras in this store yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {cameras.map((camera) => (
                      <label
                        key={camera.id}
                        className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700 hover:bg-slate-900/70 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={permissionFormData.camera_ids.includes(camera.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPermissionFormData({
                                ...permissionFormData,
                                camera_ids: [...permissionFormData.camera_ids, camera.id]
                              });
                            } else {
                              setPermissionFormData({
                                ...permissionFormData,
                                camera_ids: permissionFormData.camera_ids.filter(id => id !== camera.id)
                              });
                            }
                          }}
                          className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <div className="flex-1">
                          <p className="text-slate-200 font-medium">{camera.name}</p>
                          <p className="text-xs text-slate-400">{camera.source}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
                </>
              )}

              <div className="bg-slate-900/40 rounded-lg p-4 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                      <Users className="w-5 h-5 text-purple-400" />
                      Existing Store Accounts
                    </h3>
                    <p className="text-sm text-slate-400">
                      Team members who can access {selectedStore.name}
                    </p>
                  </div>
                  <button
                    onClick={() => loadStoreMembers(selectedStore.id)}
                    className="btn-outline btn-sm"
                  >
                    Refresh
                  </button>
                </div>

                {storeMembersLoading[selectedStore.id] ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : (storeMembers[selectedStore.id]?.length ?? 0) === 0 ? (
                  <div className="text-center py-8 bg-slate-900/50 rounded-lg border border-dashed border-slate-600">
                    <Users className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                    <p className="text-slate-300 font-medium mb-1">No member accounts yet</p>
                    <p className="text-slate-500 text-sm">
                      Create the first account above to grant access to this store
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(storeMembers[selectedStore.id] || []).map((member) => (
                      <div
                        key={member.membership_id}
                        className="p-4 rounded-lg border border-slate-700 bg-slate-900/60"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-slate-100 font-semibold">{member.username}</p>
                            <p className="text-xs text-slate-400">{member.email}</p>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Created {new Date(member.created_at).toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(member.email);
                                toast.success('Email copied');
                              }}
                              className="btn-outline btn-sm"
                              title="Copy email"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEditMember(member)}
                              className="btn-primary btn-sm"
                            >
                              Manage
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3 text-xs">
                          <span
                            className={`px-2 py-1 rounded-full border ${
                              member.can_access_dashboard ? 'border-green-500 text-green-400' : 'border-slate-600 text-slate-400'
                            }`}
                          >
                            {member.can_access_dashboard ? 'Dashboard access enabled' : 'Dashboard disabled'}
                          </span>
                          <span className="px-2 py-1 rounded-full border border-blue-500 text-blue-300">
                            {member.camera_access.length} camera{member.camera_access.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        {member.camera_access.length > 0 && (
                          <p className="text-xs text-slate-400 mt-2">
                            Cameras:{' '}
                            {member.camera_access
                              .map((camera) => camera.camera_name || 'Unnamed camera')
                              .join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!createdAccount && (
              <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowMemberAccessModal(false);
                    setSelectedStore(null);
                    setMemberUsername('');
                    setMemberPassword('');
                    setConfirmPassword('');
                    setCreatedAccount(null);
                    setEditingMember(null);
                    setErrors({});
                  }}
                  className="btn-outline btn-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMemberAccess}
                  className="btn-primary btn-md flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {editingMember ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
