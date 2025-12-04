import axios from 'axios';

// Recreate minimal api + clipsApi needed for this fix
const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const baseUrl = rawBase.replace(/\/+$/, '');

const api = axios.create({
  baseURL: `${baseUrl}/api`,
});

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
}

export interface VideoClipsResponse {
  clips: VideoClip[];
  total_count: number;
}

export const clipsApi = {
  getClips: async (params?: { behavior?: string; store_id?: string; limit?: number }): Promise<VideoClipsResponse> => {
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


