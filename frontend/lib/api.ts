import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
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
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
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
  model_name: string;
  device: string;
  conf_thresh: number;
  iou_thresh: number;
  max_det: number;
  skip_frame: number;
  is_active: boolean;
}

export interface CameraCreate {
  store_id: string;
  name: string;
  source: string;
  ai_services?: string[];
  model_name?: string;
  device?: string;
  conf_thresh?: number;
  iou_thresh?: number;
  max_det?: number;
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
    return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/cameras/${id}/stream?overlay=${overlay}`;
  },

  // Get camera frame URL
  getCameraFrameUrl: (id: string, overlay: boolean = true): string => {
    return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/cameras/${id}/frame?overlay=${overlay}`;
  },
};

// Task types
export interface TaskZoneCreate {
  name: string;
  polygon: number[][]; // [[x,y], ...]
  is_active?: boolean;
}

export interface TaskLineCreate {
  name: string;
  p1: number[]; // [x,y]
  p2: number[]; // [x,y]
  is_active?: boolean;
}

export interface TaskSetRequest {
  task_type: 'zone' | 'line' | 'both';
  zones?: TaskZoneCreate[] | null;
  lines?: TaskLineCreate[] | null;
}

export const tasksApi = {
  setCameraTasks: async (cameraId: string, payload: TaskSetRequest) => {
    const response = await api.post(`/tasks/camera/${cameraId}/set`, payload);
    return response.data;
  },
  getCameraTaskConfig: async (cameraId: string) => {
    const response = await api.get(`/tasks/camera/${cameraId}/config`);
    return response.data;
  },
  clearCameraTasks: async (cameraId: string) => {
    const response = await api.post(`/tasks/camera/${cameraId}/clear`);
    return response.data;
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
};

// Auth API (placeholder - implement based on your auth system)
export const authApi = {
  login: async (email: string, password: string) => {
    // Implement based on your authentication system
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  logout: async () => {
    localStorage.removeItem('auth_token');
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

export default api;
