import axios from 'axios';
import { DispatchConfig, TagDefinition, OperationLog, TSignConfig, CallbackDiagnostic, DispatchRecord, DispatchStats, ApiResponse } from '../types/api.types';
import { getToken, clearAuth } from './auth';

/**
 * Generate a unique request ID (UUID v4-like).
 */
function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach auth token + unique request ID
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Request-Id'] = generateRequestId();
  return config;
});

// Response interceptor: handle 401 (expired/invalid token)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuth();
      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export async function login(username: string, password: string): Promise<{ token: string; username: string }> {
  const res = await api.post<ApiResponse<{ token: string; username: string }>>('/auth/login', { username, password });
  return res.data.data!;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await api.put('/auth/password', { oldPassword, newPassword });
}

export async function fetchProfile(): Promise<{ username: string }> {
  const res = await api.get<ApiResponse<{ username: string }>>('/auth/profile');
  return res.data.data!;
}

// Callbacks
export async function fetchCallbacks(): Promise<DispatchConfig[]> {
  const res = await api.get<ApiResponse<DispatchConfig[]>>('/callbacks');
  return res.data.data || [];
}

export async function fetchCallback(id: string): Promise<DispatchConfig> {
  const res = await api.get<ApiResponse<DispatchConfig>>(`/callbacks/${id}`);
  return res.data.data!;
}

export async function createCallback(data: Partial<DispatchConfig>): Promise<DispatchConfig> {
  const res = await api.post<ApiResponse<DispatchConfig>>('/callbacks', data);
  return res.data.data!;
}

export async function updateCallback(id: string, data: Partial<DispatchConfig>): Promise<DispatchConfig> {
  const res = await api.put<ApiResponse<DispatchConfig>>(`/callbacks/${id}`, data);
  return res.data.data!;
}

export async function deleteCallback(id: string): Promise<void> {
  await api.delete(`/callbacks/${id}`);
}

// Tags
export async function fetchTags(): Promise<TagDefinition[]> {
  const res = await api.get<ApiResponse<TagDefinition[]>>('/tags');
  return res.data.data || [];
}

export async function createTag(data: Partial<TagDefinition>): Promise<TagDefinition> {
  const res = await api.post<ApiResponse<TagDefinition>>('/tags', data);
  return res.data.data!;
}

export async function updateTag(id: string, data: Partial<TagDefinition>): Promise<TagDefinition> {
  const res = await api.put<ApiResponse<TagDefinition>>(`/tags/${id}`, data);
  return res.data.data!;
}

export async function deleteTag(id: string): Promise<void> {
  await api.delete(`/tags/${id}`);
}

// Logs & Stats
export async function fetchLogs(limit = 100, offset = 0): Promise<{ logs: OperationLog[]; total: number }> {
  const res = await api.get<ApiResponse<{ logs: OperationLog[]; total: number }>>('/logs', { params: { limit, offset } });
  return res.data.data || { logs: [], total: 0 };
}

// Health
export interface SystemStatus {
  status: string;
  uptime: number;
  memory: { heapUsed: number; heapTotal: number; rss: number };
  timestamp: string;
}

export async function fetchHealth(): Promise<SystemStatus> {
  const res = await api.get<SystemStatus>('/system-status');
  return res.data;
}

// Generate Keys
export async function generateKeys(): Promise<{ encryptKey: string; signToken: string }> {
  const res = await api.get<ApiResponse<{ encryptKey: string; signToken: string }>>('/callbacks/generate-keys');
  return res.data.data!;
}

// TSign Config
export async function fetchTSignConfig(): Promise<TSignConfig> {
  const res = await api.get<ApiResponse<TSignConfig>>('/tsign-config');
  return res.data.data || { encryptKey: '', token: '' };
}

export async function updateTSignConfig(data: TSignConfig): Promise<void> {
  await api.put('/tsign-config', data);
}

// Callback Diagnostic
export async function fetchCallbackDiagnostic(): Promise<CallbackDiagnostic | null> {
  const res = await api.get<ApiResponse<CallbackDiagnostic | null>>('/callback-diagnostic');
  return res.data.data ?? null;
}

// Dispatch History & Stats
export async function fetchDispatchHistory(
  limit = 20,
  offset = 0,
  search = ''
): Promise<{ records: DispatchRecord[]; total: number; limit: number; offset: number }> {
  const params: Record<string, string | number> = { limit, offset };
  if (search.trim()) {
    params.search = search.trim();
  }
  const res = await api.get<ApiResponse<{ records: DispatchRecord[]; total: number; limit: number; offset: number }>>(
    '/dispatch-history',
    { params }
  );
  return res.data.data || { records: [], total: 0, limit, offset };
}

export async function fetchDispatchStats(): Promise<DispatchStats> {
  const res = await api.get<ApiResponse<DispatchStats>>('/dispatch-stats');
  return res.data.data || {
    totalDispatched: 0,
    totalSuccess: 0,
    totalFailed: 0,
    recentFailures: [],
    bufferUsage: { used: 0, capacity: 0 },
  };
}
