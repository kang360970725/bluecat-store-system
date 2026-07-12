import type { ApiResponse } from '@bluecat/shared';
import { useAuthStore } from '@/stores/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const auth = useAuthStore();
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth.accessToken) {
    headers.set('Authorization', `Bearer ${auth.accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const body = (await response.json()) as ApiResponse<T>;

  if (response.status === 401 && path !== '/auth/login') {
    auth.clearSession();
    if (window.location.pathname !== '/login') {
      window.location.href = `/login?redirect=${encodeURIComponent(
        window.location.pathname + window.location.search
      )}`;
    }
    throw new Error('登录已失效，请重新登录');
  }

  if (!response.ok || body.code !== 0) {
    throw new Error(body.message || '请求失败');
  }

  return body.data;
}
