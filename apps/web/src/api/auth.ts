import type { LoginPayload, LoginResult } from '@bluecat/shared';
import { request } from './http';

export function login(payload: LoginPayload) {
  return request<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
