import axios from 'axios';

// Create axios instance with base configuration
const resolveBaseUrl = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  // Ensure trailing /api is present
  const url = raw.endsWith('/api') ? raw : `${raw.replace(/\/+$/, '')}/api`;
  return url;
};

const api = axios.create({
  baseURL: resolveBaseUrl(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only clear auth on actual 401 Unauthorized (not on network errors or timeouts)
    if (error.response?.status === 401) {
      // Handle unauthorized access - clear all auth data
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_membership');
      // Only redirect if not already on login page
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    // For network errors, timeouts, or 500 errors, don't clear auth - backend might be down
    return Promise.reject(error);
  }
);

// Types
export interface Camera {
  id: string;
  store_id: string;
  name: string;
  source: string;
  ai_services: string[];
  // Model configuration removed - AI services will handle all model settings
  skip_frame: number;
  is_active: boolean;
}

export interface CameraCreate {
  store_id: string;
  name: string;
  source: string;
  ai_services?: string[];
  // Model configuration removed - AI services will handle all model settings
  skip_frame?: number;
}

export interface CameraStats {
  camera_id: string;
  store_id: string;
  name: string;
  running: boolean;
  fps: number;
  frame_count: number;
  ai_services: string[];
  zones_count: number;
  lines_count: number;
  current_count: number;
  model_loaded: boolean;
  has_task: boolean;
  config: {
    camera_id: string;
    source: string;
    model_name: string;
    device: string;
    conf_thresh: number;
    iou_thresh: number;
    max_det: number;
    skip_frame: number;
    ai_services: string[];
  };
  stats: {
    frames_processed: number;
    ai_processing_count: number;
    last_processing_time: string | null;
    avg_processing_time_ms: number;
    errors: number;
    current_count: number;
  };
}

export interface Store {
  id: string;
  name: string;
}

export interface SystemStats {
  total_cameras: number;
  active_cameras: number;
  total_people: number;
  active_streams: number;
  system_uptime: number;
}

export interface SystemHealth {
  overall_status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  system_uptime: number;
  ai_services: {
    [key: string]: {
      status: 'healthy' | 'unhealthy' | 'unreachable';
      response_time_ms?: number;
      details?: any;
      error?: string;
    };
  };
  performance: {
    cpu_usage: number;
    memory_usage: number;
    gpu_usage: number;
  };
  unhealthy_services: string[];
}

export interface UploadedFile {
  file_id: string;
  original_filename: string;
  saved_filename: string;
  file_path: string;
  file_size: number;
  duration: number;
  fps: number;
  width: number;
  height: number;
  format: string;
}

// API functions
export const cameraApi = {
  // Get all cameras
  getCameras: async (): Promise<Camera[]> => {
    const response = await api.get('/cameras/');
    return response.data;
  },

  // Create new camera
  createCamera: async (cameraData: CameraCreate): Promise<Camera> => {
    const response = await api.post('/cameras/', cameraData);
    return response.data;
  },

  // Get camera by ID
  getCamera: async (id: string): Promise<Camera> => {
    const response = await api.get(`/cameras/${id}`);
    return response.data;
  },

  // Update camera
  updateCamera: async (id: string, cameraData: Partial<CameraCreate>): Promise<Camera> => {
    const response = await api.put(`/cameras/${id}`, cameraData);
    return response.data;
  },

  // Delete camera
  deleteCamera: async (id: string): Promise<void> => {
    await api.delete(`/cameras/${id}`);
  },

  // Get camera stats
  getCameraStats: async (id: string): Promise<CameraStats> => {
    const response = await api.get(`/cameras/${id}/stats`);
    return response.data;
  },

  // Start camera
  startCamera: async (id: string): Promise<void> => {
    await api.post(`/cameras/${id}/start`);
  },

  // Stop camera
  stopCamera: async (id: string): Promise<void> => {
    await api.post(`/cameras/${id}/stop`);
  },

  // Get camera configuration
  getCameraConfig: async (id: string) => {
    const response = await api.get(`/cameras/${id}/config`);
    return response.data;
  },

  // Update camera configuration
  updateCameraConfig: async (id: string, config: any) => {
    const response = await api.put(`/cameras/${id}/config`, config);
    return response.data;
  },

  // Get camera stream URL
  getCameraStreamUrl: (id: string, overlay: boolean = true): string => {
    const base = resolveBaseUrl().replace(/\/api$/, '');
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${base}/api/cameras/${id}/stream?overlay=${overlay}${tokenParam}`;
  },

  // Get camera frame URL
  getCameraFrameUrl: (id: string, overlay: boolean = true): string => {
    const base = resolveBaseUrl().replace(/\/api$/, '');
    return `${base}/api/cameras/${id}/frame?overlay=${overlay}`;
  },
};


export const systemApi = {
  // Get system stats
  getSystemStats: async (): Promise<SystemStats> => {
    const response = await api.get('/system/stats/summary');
    return response.data;
  },

  // Get system health
  getSystemHealth: async (): Promise<SystemHealth> => {
    const response = await api.get('/system/health');
    return response.data;
  },

  // Get system performance
  getSystemPerformance: async () => {
    const response = await api.get('/system/performance');
    return response.data;
  },

  // Get GPU info
  getGpuInfo: async () => {
    const response = await api.get('/system/gpu_info');
    return response.data;
  },

  // Get system metrics
  getSystemMetrics: async () => {
    const response = await api.get('/system/metrics');
    return response.data;
  },
};

export const uploadApi = {
  // Upload file
  uploadFile: async (file: File): Promise<{ success: boolean; file: UploadedFile }> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/upload/file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Get uploaded files
  getUploadedFiles: async () => {
    const response = await api.get('/upload/files');
    return response.data;
  },

  // Delete file
  deleteFile: async (filename: string) => {
    const response = await api.delete(`/upload/files/${filename}`);
    return response.data;
  },

  // Get file info
  getFileInfo: async (filename: string) => {
    const response = await api.get(`/upload/files/${filename}/info`);
    return response.data;
  },

  // Get preview URL
  getPreviewUrl: async (filename: string) => {
    const response = await api.post(`/upload/files/${filename}/preview`);
    return response.data;
  },
};


export interface StoreMemberAccountCreate {
  username: string;
  password: string;
  camera_ids: string[];
  can_access_dashboard: boolean;
}

export interface StoreMemberAccountResponse {
  message: string;
  user: UserInfo;
  username: string;
  store_id: string;
  store_name: string;
}

export interface StoreMemberCameraAccess {
  camera_id: string;
  camera_name?: string | null;
}

export interface StoreMemberAccountSummary {
  membership_id: string;
  user_id: string;
  username: string;
  email: string;
  store_id: string;
  store_name: string;
  can_access_dashboard: boolean;
  camera_access: StoreMemberCameraAccess[];
  created_at: string;
}

export interface StoreMemberAccountUpdate {
  camera_ids: string[];
  can_access_dashboard: boolean;
  password?: string;
}

export const storeApi = {
  // Get all stores
  getStores: async (): Promise<Store[]> => {
    const response = await api.get('/stores/');
    return response.data;
  },

  // Create store
  createStore: async (name: string): Promise<Store> => {
    const response = await api.post('/stores/', { name });
    return response.data;
  },

  getStoreMembers: async (storeId: string): Promise<StoreMemberAccountSummary[]> => {
    const response = await api.get(`/stores/${storeId}/members`);
    return response.data;
  },

  // Create member account for a store
  createStoreMemberAccount: async (
    storeId: string,
    data: StoreMemberAccountCreate
  ): Promise<StoreMemberAccountResponse> => {
    const response = await api.post(`/stores/${storeId}/member-account`, data);
    return response.data;
  },

  updateStoreMemberAccount: async (
    storeId: string,
    membershipId: string,
    data: StoreMemberAccountUpdate
  ): Promise<StoreMemberAccountSummary> => {
    const response = await api.put(`/stores/${storeId}/members/${membershipId}`, data);
    return response.data;
  },
};

// Auth types
export interface UserInfo {
  id: string;
  email: string;
  name: string;
}

export interface OrganizationInfo {
  id: string;
  name: string;
}

export interface MembershipInfo {
  id: string;
  organization: OrganizationInfo;
  role: 'manager' | 'member';
}

export interface ProfileResponse {
  user: UserInfo;
  active_membership: MembershipInfo;
  memberships: MembershipInfo[];
}

export interface AuthResponse extends ProfileResponse {
  access_token: string;
  token_type: string;
}

export interface MemberSignupRequest {
  email: string;
  password: string;
  name: string;
  invite_token?: string;
  join_code?: string;
}

export interface ManagerSignupRequest {
  email: string;
  password: string;
  name: string;
  organization_name: string;
}

export interface CreateOrganizationRequest {
  name: string;
}

export interface OrganizationResponse {
  id: string;
  name: string;
  join_code?: string;
  created_at: string;
}

export interface InviteResponse {
  id: string;
  token: string;
  invite_url: string;
  email?: string;
  role: 'manager' | 'member';
  expires_at?: string;
  used_at?: string;
  created_at: string;
}

export interface InvitesResponse {
  invites: InviteResponse[];
}

export interface LoginRequest {
  email: string;
  password: string;
  organization_id?: string;
}

export interface MemberLoginRequest {
  organization_id?: string;
  organization_name?: string;
  join_code?: string;
  password: string;
}

export interface SetMemberPasswordRequest {
  password: string;
}

export interface InviteMemberRequest {
  email: string;
  name: string;
  password?: string;
  role: 'manager' | 'member';
}

export interface MembershipResponse {
  id: string;
  user: UserInfo;
  organization: OrganizationInfo;
  role: 'manager' | 'member';
}

export interface MembersResponse {
  members: MembershipResponse[];
}

export interface MemberPermissionRequest {
  membership_id: string;
  camera_ids: string[];
  can_access_dashboard: boolean;
}

export interface MemberPermissionResponse {
  membership_id: string;
  user: UserInfo;
  accessible_cameras: string[];
  can_access_dashboard: boolean;
}

// Auth API
// Notification/Alert types
export interface Alert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  store_id?: string;
  camera_id?: string;
  anomaly_type?: string;
  confidence?: number;
  timestamp: string;
  acknowledged: boolean;
  store_name?: string;
  camera_name?: string;
}

export interface AlertsResponse {
  alerts: Alert[];
  unread_count: number;
  total_count: number;
}

export const eventsApi = {
  getAlerts: async (params?: { limit?: number; unread_only?: boolean; store_id?: string }): Promise<AlertsResponse> => {
    const response = await api.get('/events/alerts', { params });
    return response.data;
  },

  acknowledgeAlert: async (alertId: string): Promise<void> => {
    await api.put(`/events/alerts/${alertId}/acknowledge`);
  },

  acknowledgeAllAlerts: async (storeId?: string): Promise<{ status: string; message: string; count: number }> => {
    const response = await api.put('/events/alerts/acknowledge-all', null, { params: storeId ? { store_id: storeId } : {} });
    return response.data;
  },

  // Get recent behaviors for a camera
  getCameraRecentBehaviors: async (cameraId: string, limit: number = 5): Promise<Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
    timestamp: string;
    confidence?: number;
  }>> => {
    const response = await api.get(`/events/camera/${cameraId}/recent-behaviors`, { params: { limit } });
    return response.data;
  },
};

export const authApi = {
  signupMember: async (data: MemberSignupRequest): Promise<AuthResponse> => {
    const response = await api.post('/auth/signup/member', data);
    return response.data;
  },

  signupManager: async (data: ManagerSignupRequest): Promise<AuthResponse> => {
    const response = await api.post('/auth/signup/manager', data);
    return response.data;
  },

  login: async (data: LoginRequest): Promise<AuthResponse | any> => {
    const response = await api.post('/auth/login', data);
    // Check if response indicates no organization
    if (response.headers?.['x-no-organization'] === 'true') {
      return response.data; // Return the detail message
    }
    return response.data;
  },

  memberLogin: async (data: MemberLoginRequest): Promise<AuthResponse> => {
    const response = await api.post('/auth/login/member', data);
    return response.data;
  },

  switchOrg: async (organizationId: string): Promise<AuthResponse> => {
    const response = await api.post('/auth/switch-org', { organization_id: organizationId });
    return response.data;
  },

  getCurrentUser: async (): Promise<ProfileResponse> => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  getMembers: async (orgId: string): Promise<MembersResponse> => {
    const response = await api.get(`/auth/orgs/${orgId}/members`);
    return response.data;
  },

  addMember: async (orgId: string, data: InviteMemberRequest): Promise<MembershipResponse> => {
    const response = await api.post(`/auth/orgs/${orgId}/members`, data);
    return response.data;
  },

  updateMemberRole: async (orgId: string, membershipId: string, role: 'manager' | 'member'): Promise<MembershipResponse> => {
    const response = await api.patch(`/auth/orgs/${orgId}/members/${membershipId}/role`, { role });
    return response.data;
  },

  removeMember: async (orgId: string, membershipId: string): Promise<void> => {
    await api.delete(`/auth/orgs/${orgId}/members/${membershipId}`);
  },

  createOrganization: async (name: string): Promise<AuthResponse> => {
    const response = await api.post('/auth/organizations', { name });
    return response.data;
  },

  listOrganizations: async (): Promise<OrganizationResponse[]> => {
    const response = await api.get('/auth/organizations');
    return response.data;
  },

  createInvite: async (orgId: string, data: { email?: string; role: 'manager' | 'member'; expires_in_days?: number }): Promise<InviteResponse> => {
    const response = await api.post(`/auth/orgs/${orgId}/invites`, data);
    return response.data;
  },

  listInvites: async (orgId: string): Promise<InvitesResponse> => {
    const response = await api.get(`/auth/orgs/${orgId}/invites`);
    return response.data;
  },

  deleteInvite: async (inviteId: string): Promise<void> => {
    await api.delete(`/auth/invites/${inviteId}`);
  },

  getInviteInfo: async (token: string): Promise<InviteResponse> => {
    const response = await api.get(`/auth/invites/${token}/info`);
    return response.data;
  },

  generateJoinCode: async (orgId: string, enabled: boolean): Promise<OrganizationResponse> => {
    const response = await api.post(`/auth/orgs/${orgId}/join-code`, { enabled });
    return response.data;
  },

  getMemberPermissions: async (orgId: string, membershipId: string): Promise<MemberPermissionResponse> => {
    const response = await api.get(`/auth/orgs/${orgId}/members/${membershipId}/permissions`);
    return response.data;
  },

  updateMemberPermissions: async (orgId: string, membershipId: string, data: MemberPermissionRequest): Promise<MemberPermissionResponse> => {
    const response = await api.put(`/auth/orgs/${orgId}/members/${membershipId}/permissions`, data);
    return response.data;
  },

  setMemberPassword: async (orgId: string, data: SetMemberPasswordRequest): Promise<OrganizationResponse> => {
    const response = await api.put(`/auth/orgs/${orgId}/member-password`, data);
    return response.data;
  },

  removeMemberPassword: async (orgId: string): Promise<OrganizationResponse> => {
    const response = await api.delete(`/auth/orgs/${orgId}/member-password`);
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_membership');
  },
};

export default api;
