import type { ApiResponse } from '@bluecat/shared';
import { useAuthStore } from '@/stores/auth';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const auth = useAuthStore();
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth.accessToken) {
    headers.set('Authorization', `Bearer ${auth.accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const raw = await response.text();
  let body: ApiResponse<T> | null = null;
  if (raw) {
    try {
      body = JSON.parse(raw) as ApiResponse<T>;
    } catch {
      throw new Error(
        response.ok
          ? '服务器返回了无法识别的数据'
          : `服务请求失败（HTTP ${response.status}）`
      );
    }
  }

  if (response.status === 401 && path !== '/auth/login') {
    auth.clearSession();
    if (window.location.pathname !== '/login') {
      window.location.href = `/login?redirect=${encodeURIComponent(
        window.location.pathname + window.location.search
      )}`;
    }
    throw new Error('登录已失效，请重新登录');
  }

  if (!response.ok || !body || body.code !== 0) {
    throw new Error(body?.message || `服务请求失败（HTTP ${response.status}）`);
  }

  return body.data;
}
