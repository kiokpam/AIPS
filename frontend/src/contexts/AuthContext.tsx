'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, ProfileResponse, AuthResponse } from '@/lib/api';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: ProfileResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  connectionError: boolean; // True when backend is unreachable
  login: (email: string, password: string, organizationId?: string, rememberMe?: boolean) => Promise<void>;
  memberLogin: (password: string, organizationId?: string, organizationName?: string, joinCode?: string) => Promise<void>;
  signupManager: (payload: { email: string; password: string; name: string; organizationName: string }) => Promise<void>;
  signupMember: (payload: { email: string; password: string; name: string; inviteToken?: string; joinCode?: string }) => Promise<void>;
  logout: () => void;
  switchOrganization: (organizationId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  createOrganization: (name: string) => Promise<void>;
  retryAuth: () => Promise<void>; // Retry auth check when backend comes back
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false); // Track if backend is unreachable
  const isCheckingRef = React.useRef(false); // Prevent concurrent auth checks
  const router = useRouter();

  useEffect(() => {
    checkAuth();
    
    // Add error boundary for localStorage corruption
    const handleStorageError = (e: StorageEvent) => {
      if (e.key === 'auth_token' && e.newValue === null) {
        // Token was removed, clear user state
        setUser(null);
      }
    };
    
    // Listen for storage changes (e.g., from other tabs)
    window.addEventListener('storage', handleStorageError);
    
    return () => {
      window.removeEventListener('storage', handleStorageError);
    };
  }, []);

  const checkAuth = async () => {
    // Prevent concurrent auth checks
    if (isCheckingRef.current) {
      return;
    }
    isCheckingRef.current = true;
    
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setIsLoading(false);
        setConnectionError(false);
        isCheckingRef.current = false;
        return;
      }

      const profile = await authApi.getCurrentUser();
      setUser(profile);
      setConnectionError(false);
    } catch (error: any) {
      // Only clear auth on actual authentication errors (401/403)
      // Don't clear on network errors, timeouts, or backend crashes
      if (error.response?.status === 401 || error.response?.status === 403) {
        // Actual auth failure - clear tokens
        authApi.logout();
        setUser(null);
        setConnectionError(false);
      } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        // Network timeout - keep token, user can retry
        console.warn('Auth check timeout - keeping token for retry');
        setUser(null); // Clear user state but keep token
        setConnectionError(true);
      } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        // Network error - keep token, backend might be down
        console.warn('Auth check network error - keeping token');
        setUser(null); // Clear user state but keep token
        setConnectionError(true);
      } else {
        // Other errors - keep token but clear user state
        console.warn('Auth check failed (non-auth error):', error.message || error);
        setUser(null);
        setConnectionError(true);
      }
    } finally {
      setIsLoading(false);
      isCheckingRef.current = false;
    }
  };

  const saveAuth = (response: AuthResponse) => {
    localStorage.setItem('auth_token', response.access_token);
    const profile: ProfileResponse = {
      user: response.user,
      active_membership: response.active_membership,
      memberships: response.memberships,
    };
    setUser(profile);
  };

  const login = async (email: string, password: string, organizationId?: string, rememberMe?: boolean) => {
    try {
      const response = await authApi.login({ email, password, organization_id: organizationId, remember_me: rememberMe });
      
      // Check if response indicates no organization (response has detail but no access_token)
      if (response && typeof response === 'object' && 'detail' in response && !('access_token' in response)) {
        // Store email temporarily for org creation
        localStorage.setItem('pending_user_email', email);
        toast('Please create an organization to continue', { icon: 'ℹ️' });
        router.push('/organizations/create');
        return;
      }
      
      // Normal login response
      if (response && 'access_token' in response) {
        saveAuth(response);
        // Store remember_me preference
        if (rememberMe) {
          localStorage.setItem('remember_me', 'true');
        } else {
          localStorage.removeItem('remember_me');
        }
        toast.success('Login successful!');
        router.push('/cameras');
      }
    } catch (error: any) {
      // Check if user has no organizations
      if (error.response?.data?.detail?.includes('no organizations') ||
          error.response?.data?.detail?.includes('create an organization')) {
        // Store email temporarily for org creation
        localStorage.setItem('pending_user_email', email);
        toast('Please create an organization to continue', { icon: 'ℹ️' });
        router.push('/organizations/create');
        return;
      }
      const message = error.response?.data?.detail || 'Login failed';
      toast.error(message);
      throw error;
    }
  };

  const memberLogin = async (password: string, organizationId?: string, organizationName?: string, joinCode?: string) => {
    try {
      const response = await authApi.memberLogin({
        password,
        organization_id: organizationId,
        organization_name: organizationName,
        join_code: joinCode
      });
      
      if (response && 'access_token' in response) {
        saveAuth(response);
        toast.success('Login successful!');
        router.push('/cameras');
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Member login failed';
      toast.error(message);
      throw error;
    }
  };

  const handleSignupError = (error: any) => {
    console.error('Signup error:', error);
    if (error.response?.data?.detail) {
      const detail = error.response.data.detail;
      if (Array.isArray(detail)) {
        const messages = detail.map((err: any) => err.msg || err.message || String(err)).join(', ');
        toast.error(messages);
      } else {
        toast.error(detail);
      }
    } else {
      toast.error(error.message || 'Signup failed. Please try again.');
    }
  };

  const signupManager = async ({ email, password, name, organizationName }: { email: string; password: string; name: string; organizationName: string }) => {
    try {
      await authApi.signupManager({
        email,
        password,
        name,
        organization_name: organizationName,
      });
      // Don't auto-login, redirect to login page instead
      toast.success('Account created successfully! Please log in to continue.');
      router.push('/login');
    } catch (error: any) {
      handleSignupError(error);
      throw error;
    }
  };

  const signupMember = async ({ email, password, name, inviteToken, joinCode }: { email: string; password: string; name: string; inviteToken?: string; joinCode?: string }) => {
    try {
      const payload: any = { email, password, name };
      if (inviteToken) payload.invite_token = inviteToken;
      if (joinCode) payload.join_code = joinCode;
      await authApi.signupMember(payload);
      // Don't auto-login, redirect to login page instead
      toast.success('Account created successfully! Please log in to continue.');
      router.push('/login');
    } catch (error: any) {
      handleSignupError(error);
      throw error;
    }
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    toast.success('Logged out successfully');
    router.push('/login');
  };

  const switchOrganization = async (organizationId: string) => {
    try {
      const response = await authApi.switchOrg(organizationId);
      saveAuth(response);
      toast.success('Organization switched successfully');
      router.refresh();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to switch organization';
      toast.error(message);
      throw error;
    }
  };

  const refreshProfile = async () => {
    try {
      const profile = await authApi.getCurrentUser();
      setUser(profile);
    } catch (error: any) {
      if (error.response?.status === 401) {
        logout();
      }
    }
  };

  const createOrganization = async (name: string) => {
    try {
      const response = await authApi.createOrganization(name);
      saveAuth(response);
      toast.success('Organization created successfully!');
      router.push('/cameras');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to create organization';
      toast.error(message);
      throw error;
    }
  };

  const retryAuth = async () => {
    setIsLoading(true);
    setConnectionError(false);
    await checkAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        connectionError,
        login,
        memberLogin,
        signupManager,
        signupMember,
        logout,
        switchOrganization,
        refreshProfile,
        createOrganization,
        retryAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

