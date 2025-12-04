import axios, { AxiosError } from 'axios';

// -----------------------------------------------------------------------------
// Base API client
// -----------------------------------------------------------------------------

function resolveBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/+$/, '');
}

const baseUrl = resolveBaseUrl();

const api = axios.create({
  baseURL: `${baseUrl}/api`,
});

// Attach auth token to every request when available
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers = config.headers || {};
      (config.headers as any)['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 globally (used by AuthContext for UX)
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response && error.response.status === 401) {
      if (typeof window !== 'undefined') {
        // Clear auth on explicit unauthorized
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('auth_membership');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// -----------------------------------------------------------------------------
// Shared types
// -----------------------------------------------------------------------------

export interface OrganizationInfo {
  id: string;
  name: string;
}

export interface MembershipInfo {
  id: string;
  organization: OrganizationInfo;
  role: string;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserInfo;
  active_membership: MembershipInfo;
  memberships: MembershipInfo[];
}

export interface ProfileResponse {
  user: UserInfo;
  active_membership: MembershipInfo;
  memberships: MembershipInfo[];
}

export interface InviteResponse {
  id: string;
  token: string;
  invite_url: string;
  email?: string | null;
  role: string;
  expires_at?: string | null;
  used_at?: string | null;
  created_at: string;
}

export interface OrganizationResponse {
  id: string;
  name: string;
  join_code?: string | null;
  created_at: string;
}

export interface Store {
  id: string;
  name: string;
  organization_id?: string;
  [key: string]: any;
}

export interface Camera {
  id: string;
  name: string;
  store_id: string;
  source: string;
  is_active: boolean;
  ai_services: string[];
  [key: string]: any;
}

export interface MemberPermissionRequest {
  camera_ids: string[];
  can_access_dashboard: boolean;
  password?: string;
}

export interface StoreMemberAccountSummary {
  membership_id: string;
  user_id: string;
  username: string;
  email: string;
  store_id: string;
  store_name: string;
  can_access_dashboard: boolean;
  // Detailed access list from backend
  camera_access: { camera_id: string; camera_name?: string | null }[];
  // Convenience field used when sending updates (list of IDs only)
  camera_ids: string[];
  created_at: string;
}

export interface StoreMemberAccountResponse {
  message: string;
  user: UserInfo;
  username: string;
  store_id: string;
  store_name: string;
}

export interface Alert {
  id: string;
  type: string;
  severity: string;
  message: string;
  store_id?: string | null;
  camera_id?: string | null;
  anomaly_type?: string | null;
  confidence?: number | null;
  timestamp: string;
  acknowledged: boolean;
  store_name?: string | null;
  camera_name?: string | null;
  clip_ref?: string | null;
}

// -----------------------------------------------------------------------------
// Auth API
// -----------------------------------------------------------------------------

export const authApi = {
  login: async (payload: {
    email: string;
    password: string;
    organization_id?: string;
    remember_me?: boolean;
  }): Promise<AuthResponse | any> => {
    const response = await api.post('/auth/login', payload);
    return response.data;
  },

  memberLogin: async (payload: {
    password: string;
    organization_id?: string;
    organization_name?: string;
    join_code?: string;
  }): Promise<AuthResponse> => {
    const response = await api.post('/auth/login/member', payload);
    return response.data;
  },

  signupManager: async (payload: {
    email: string;
    password: string;
    name: string;
    organization_name: string;
  }): Promise<AuthResponse> => {
    const response = await api.post('/auth/signup/manager', payload);
    return response.data;
  },

  signupMember: async (payload: {
    email: string;
    password: string;
    name: string;
    invite_token?: string;
    join_code?: string;
  }): Promise<AuthResponse> => {
    const response = await api.post('/auth/signup/member', payload);
    return response.data;
  },

  getCurrentUser: async (): Promise<ProfileResponse> => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  logout: (): void => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_membership');
    }
  },

  switchOrg: async (organization_id: string): Promise<AuthResponse> => {
    const response = await api.post('/auth/switch-org', { organization_id });
    return response.data;
  },

  createOrganization: async (name: string): Promise<AuthResponse> => {
    const response = await api.post('/auth/organizations', { name });
    return response.data;
  },

  listOrganizations: async (): Promise<OrganizationResponse[]> => {
    const response = await api.get('/auth/organizations');
    return response.data;
  },

  getInviteInfo: async (token: string): Promise<InviteResponse> => {
    const response = await api.get(`/auth/invites/${encodeURIComponent(token)}/info`);
    return response.data;
  },

  getMemberPermissions: async (
    orgId: string,
    membershipId: string
  ): Promise<{ can_access_dashboard: boolean; accessible_cameras: string[] }> => {
    const response = await api.get(`/auth/orgs/${orgId}/members/${membershipId}/permissions`);
    return response.data;
  },

  forgotPassword: async (email: string): Promise<{ message: string; reset_url?: string }> => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  validateResetToken: async (token: string): Promise<{ valid: boolean; email?: string }> => {
    const response = await api.get(`/auth/reset-password/${encodeURIComponent(token)}/validate`);
    return response.data;
  },

  resetPassword: async (token: string, password: string): Promise<{ message: string }> => {
    const response = await api.post('/auth/reset-password', { token, password });
    return response.data;
  },
};

// -----------------------------------------------------------------------------
// Store API
// -----------------------------------------------------------------------------

export const storeApi = {
  getStores: async (): Promise<Store[]> => {
    const response = await api.get('/stores');
    return response.data;
  },

  createStore: async (name: string): Promise<Store> => {
    const response = await api.post('/stores', { name });
    return response.data;
  },

  getStoreMembers: async (storeId: string): Promise<StoreMemberAccountSummary[]> => {
    const response = await api.get(`/stores/${storeId}/members`);
    return response.data;
  },

  createStoreMemberAccount: async (
    storeId: string,
    payload: MemberPermissionRequest & { username: string; password: string }
  ): Promise<StoreMemberAccountResponse> => {
    const response = await api.post(`/stores/${storeId}/members`, payload);
    return response.data;
  },

  updateStoreMemberAccount: async (
    storeId: string,
    membershipId: string,
    payload: MemberPermissionRequest & { password?: string }
  ): Promise<void> => {
    await api.put(`/stores/${storeId}/members/${membershipId}`, payload);
  },
};

// -----------------------------------------------------------------------------
// Camera API
// -----------------------------------------------------------------------------

export const cameraApi = {
  getCameras: async (): Promise<Camera[]> => {
    const response = await api.get('/cameras');
    return response.data;
  },

  createCamera: async (payload: {
    store_id: string;
    name: string;
    source: string;
    ai_services: string[];
  }): Promise<Camera> => {
    const response = await api.post('/cameras', payload);
    return response.data;
  },

  deleteCamera: async (id: string): Promise<void> => {
    await api.delete(`/cameras/${id}`);
  },

  startCamera: async (id: string): Promise<void> => {
    await api.post(`/cameras/${id}/start`);
  },

  stopCamera: async (id: string): Promise<void> => {
    await api.post(`/cameras/${id}/stop`);
  },

  getCameraStats: async (id: string): Promise<any> => {
    const response = await api.get(`/cameras/${id}/stats`);
    return response.data;
  },

  getCameraConfig: async (id: string): Promise<any> => {
    const response = await api.get(`/cameras/${id}/config`);
    return response.data;
  },

  updateCameraConfig: async (id: string, config: any): Promise<any> => {
    const response = await api.put(`/cameras/${id}/config`, config);
    return response.data;
  },

  getCameraStreamUrl: (id: string, overlay: boolean = true): string => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/api/cameras/${id}/stream?overlay=${overlay}${tokenParam}`;
  },
};

// -----------------------------------------------------------------------------
// Events / Analytics API
// -----------------------------------------------------------------------------

export const eventsApi = {
  getAlerts: async (params?: {
    limit?: number;
    unread_only?: boolean;
  }): Promise<{ alerts: Alert[]; unread_count: number; total_count: number }> => {
    const response = await api.get('/events/alerts', { params });
    return response.data;
  },

  acknowledgeAlert: async (alertId: string): Promise<void> => {
    await api.post(`/events/alerts/${alertId}/acknowledge`);
  },

  acknowledgeAllAlerts: async (): Promise<void> => {
    await api.post('/events/alerts/acknowledge-all');
  },

  getInOutSummary: async (
    storeId?: string
  ): Promise<any> => {
    const params: any = {};
    if (storeId) params.store_id = storeId;
    const response = await api.get('/events/inout-summary', { params });
    return response.data;
  },

  getCameraRecentBehaviors: async (
    cameraId: string,
    limit: number = 3
  ): Promise<Array<{ type: string; severity: string; timestamp: string }>> => {
    const response = await api.get(`/events/behaviors/${cameraId}`, {
      params: { limit },
    });
    return response.data.behaviors || response.data;
  },
};

// -----------------------------------------------------------------------------
// Video Clips API (used by /videos page)
// -----------------------------------------------------------------------------

export interface VideoClip {
  id: string;
  filename: string;
  camera_id?: string;
  camera_name?: string;
  store_id?: string;
  store_name?: string;
  behavior?: string;
  confidence?: number;
  timestamp: string;
  size_mb: number;
  alert_id?: string;
  duration_seconds?: number | null;
}

export interface VideoClipsResponse {
  clips: VideoClip[];
  total_count: number;
}

export const clipsApi = {
  getClips: async (params?: {
    behavior?: string;
    store_id?: string;
    limit?: number;
  }): Promise<VideoClipsResponse> => {
    const response = await api.get('/clips', { params });
    return response.data;
  },

  getClipUrl: (filename: string): string => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/api/clips/${encodeURIComponent(filename)}${tokenParam}`;
  },

  deleteClip: async (filename: string): Promise<void> => {
    await api.delete(`/clips/${encodeURIComponent(filename)}`);
  },
};

export default api;

