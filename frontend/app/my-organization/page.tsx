'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, Shield, Users, CheckCircle, RefreshCw, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/src/contexts/AuthContext';
import type { MembershipInfo } from '@/lib/api';

export default function MyOrganizationPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, switchOrganization } = useAuth();
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  const activeMembership = user?.active_membership;
  const activeOrg = activeMembership?.organization;

  const otherMemberships = useMemo(() => {
    if (!user?.memberships || !activeOrg) return [];
    return user.memberships.filter((membership) => membership.organization.id !== activeOrg.id);
  }, [user?.memberships, activeOrg]);

  const handleSwitchOrg = async (membership: MembershipInfo) => {
    if (membership.organization.id === activeOrg?.id) {
      toast('You are already viewing this organization', { icon: 'ℹ️' });
      return;
    }

    try {
      setSwitchingOrgId(membership.organization.id);
      await switchOrganization(membership.organization.id);
    } catch (error) {
      // switchOrganization already shows a toast; nothing else to do
    } finally {
      setSwitchingOrgId(null);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !activeOrg) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Building2 className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-200 mb-2">No active organization</h2>
          <p className="text-slate-400 mb-4">We could not find any organization linked to your account.</p>
          <button
            onClick={() => router.push('/login')}
            className="btn-primary btn-md"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Building2 className="w-8 h-8" />
            My Organization
          </h1>
          <p className="text-slate-300 mt-2">
            See the organization(s) you belong to and your role within each team.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-slate-700 rounded-lg">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-sm text-slate-300">Organization info is only visible to you</span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-800 rounded-xl border border-slate-700 p-6"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-blue-500/20 border border-blue-500/40 rounded-xl flex items-center justify-center">
              <Building2 className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <p className="uppercase text-xs tracking-wide text-blue-300/80 mb-1">Active organization</p>
              <h2 className="text-2xl font-bold text-white">{activeOrg.name}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/60 border border-slate-700">
                  <Shield className="w-4 h-4 text-blue-400" />
                  Role: {activeMembership.role === 'manager' ? 'Manager' : 'Member'}
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/60 border border-slate-700">
                  <Users className="w-4 h-4 text-green-400" />
                  Membership ID: {activeMembership.id}
                </span>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-4 md:max-w-xs">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Helpful tips
            </h3>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
                Contact your manager if you need additional access.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
                Your access to dashboards and cameras is managed from the Team Management page.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
                Use the organization switcher in the top-right menu if you join multiple teams.
              </li>
            </ul>
          </div>
        </div>
      </motion.div>

      {!!otherMemberships.length && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-xl border border-slate-700 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              Other organizations
            </h3>
            <p className="text-sm text-slate-400">
              Switch between organizations to view their dashboards and cameras.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {otherMemberships.map((membership) => (
              <div
                key={membership.id}
                className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Organization</p>
                    <p className="text-lg font-semibold text-slate-100">{membership.organization.name}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 capitalize">
                    {membership.role}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Membership ID</span>
                  <span className="font-mono text-slate-300">{membership.id}</span>
                </div>
                <button
                  onClick={() => handleSwitchOrg(membership)}
                  disabled={switchingOrgId === membership.organization.id}
                  className="btn-outline btn-sm flex items-center gap-2 justify-center mt-2"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${switchingOrgId === membership.organization.id ? 'animate-spin' : ''}`}
                  />
                  {switchingOrgId === membership.organization.id ? 'Switching...' : 'Switch to this organization'}
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

