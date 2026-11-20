import type { LoginPayload, LoginResult } from '@bluecat/shared';
import { request } from './http';

export function login(payload: LoginPayload) {
  return request<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function switchStore(storeId: string) {
  return request<LoginResult>('/auth/switch-store', {
    method: 'POST',
    body: JSON.stringify({ storeId })
  });
}
export function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}) {
  return request<LoginResult>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
