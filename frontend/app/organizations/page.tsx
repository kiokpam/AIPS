'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  Plus,
  Users,
  Crown,
  CheckCircle,
  ArrowRight,
  Settings,
  Calendar
} from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { authApi, OrganizationResponse } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function OrganizationsPage() {
  const { user, isAuthenticated, refreshProfile, switchOrganization } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && user?.active_membership.role === 'manager') {
      loadOrganizations();
    }
  }, [isAuthenticated, user]);

  const loadOrganizations = async () => {
    try {
      setIsLoading(true);
      const response = await authApi.listOrganizations();
      setOrganizations(response);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load organizations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchOrganization = async (orgId: string) => {
    if (orgId === user?.active_membership.organization.id) {
      return; // Already active
    }
    
    try {
      setSwitchingOrgId(orgId);
      await switchOrganization(orgId);
      await refreshProfile();
      toast.success('Organization switched successfully');
      // Reload to get updated data
      loadOrganizations();
    } catch (error) {
      // Error handled by auth context
    } finally {
      setSwitchingOrgId(null);
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
          <Crown className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-200 mb-2">Access Denied</h2>
          <p className="text-slate-400">You need manager privileges to manage organizations</p>
        </div>
      </div>
    );
  }

  const currentOrgId = user?.active_membership.organization.id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Building2 className="w-8 h-8" />
            My Organizations
          </h1>
          <p className="text-slate-400 mt-2">
            Manage your organizations and switch between them
          </p>
        </div>
        <Link
          href="/organizations/create"
          className="btn-primary btn-lg flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Organization
        </Link>
      </div>

      {/* Current Organization Banner */}
      {currentOrgId && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-sm text-blue-300 font-medium">Currently Active</p>
                <p className="text-lg text-blue-200 font-semibold">
                  {user.active_membership.organization.name}
                </p>
              </div>
            </div>
            <Link
              href="/managers"
              className="btn-outline btn-md flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Manage Team
            </Link>
          </div>
        </motion.div>
      )}

      {/* Organizations List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {isLoading ? (
          <div className="col-span-full p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : organizations.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-slate-800 rounded-xl border border-slate-700">
            <Building2 className="w-16 h-16 text-slate-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-200 mb-2">No organizations yet</h3>
            <p className="text-slate-400 mb-6">Create your first organization to get started</p>
            <Link href="/organizations/create" className="btn-primary btn-md">
              Create First Organization
            </Link>
          </div>
        ) : (
          organizations.map((org) => {
            const isActive = org.id === currentOrgId;
            const isSwitching = switchingOrgId === org.id;
            
            return (
              <div
                key={org.id}
                className={`bg-slate-800 rounded-xl border p-6 transition-all ${
                  isActive
                    ? 'border-blue-600 shadow-lg shadow-blue-900/20'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      isActive ? 'bg-blue-600' : 'bg-slate-700'
                    }`}>
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-slate-100 truncate">{org.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <p className="text-xs text-slate-400">
                          Created {new Date(org.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  {isActive && (
                    <span className="px-2 py-1 text-xs font-medium bg-blue-900/30 text-blue-300 border border-blue-700 rounded flex-shrink-0">
                      Active
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm text-slate-400 mb-4 pb-4 border-b border-slate-700">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4" />
                    <span>Manager</span>
                  </div>
                  {org.join_code && (
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>Join code enabled</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {isActive ? (
                    <Link
                      href="/managers"
                      className="btn-primary btn-sm flex-1 flex items-center justify-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      Manage
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleSwitchOrganization(org.id)}
                      disabled={isSwitching}
                      className="btn-outline btn-sm flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSwitching ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                          Switching...
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4" />
                          Switch to This
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </motion.div>
    </div>
  );
}
