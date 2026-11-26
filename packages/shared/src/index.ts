export const APP_NAME = 'BlueCat Store System';

export const AUTH_TOKEN_STORAGE_KEY = 'bluecat.accessToken';
export const AUTH_REFRESH_TOKEN_STORAGE_KEY = 'bluecat.refreshToken';
export const AUTH_USER_STORAGE_KEY = 'bluecat.currentUser';

export type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type LoginPayload = {
  username: string;
  password: string;
};

export type LoginResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: CurrentUser;
};

export type CurrentUser = {
  id: string;
  username: string;
  nickname: string;
  orgId: string | null;
  storeId: string | null;
  employeeId: string | null;
  positionId: string | null;
  accessibleStoreIds: string[];
  roles: string[];
  permissions: string[];
  mustChangePassword?: boolean;
  wechatBoundAt?: string;
};

export type DataScope = 'ALL' | 'ORG' | 'STORE' | 'SELF' | 'CUSTOM_STORES';
