import { request } from './http';

export type StoreStatus = 'ENABLED' | 'DISABLED';
export type StoreAreaLevel = 'LOW' | 'MID' | 'HIGH';
export type MemberPriceTier =
  | 'TEMPORARY'
  | 'NORMAL_MEMBER'
  | 'BLUECAT_MEMBER'
  | 'EXTRAORDINARY_MEMBER'
  | 'APEX_MEMBER'
  | 'PLATINUM_MEMBER'
  | 'BLACK_GOLD_MEMBER'
  | 'MYTHIC_MEMBER';

export type Store = {
  id: string;
  orgId: string;
  name: string;
  code: string;
  status: StoreStatus;
  machineCount: number;
  address?: string | null;
  longitude?: string | number | null;
  latitude?: string | number | null;
  phone?: string | null;
  managerEmployeeId?: string | null;
  responsibleEmployeeId?: string | null;
  managerEmployee?: Employee | null;
  responsibleEmployee?: Employee | null;
  _count?: {
    employees: number;
    areas: number;
  };
};

export type Employee = {
  id: string;
  storeId: string;
  positionId?: string | null;
  employeeNo: string;
  name: string;
  phone?: string | null;
  position?: string | null;
  positionRef?: Pick<Position, 'id' | 'name' | 'code'> | null;
  enabled: boolean;
  store?: Pick<Store, 'id' | 'name' | 'code'>;
};

export type Permission = {
  id: string;
  name: string;
  code: string;
  type: string;
  path?: string | null;
};

export type Position = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  permissions?: Array<{
    permission: Permission;
  }>;
  _count?: {
    employees: number;
  };
};

export type StoreAreaPrice = {
  id: string;
  areaId: string;
  tier: MemberPriceTier;
  price: string | number;
};

export type StoreArea = {
  id: string;
  storeId: string;
  name: string;
  code: string;
  level: StoreAreaLevel;
  machineCount: number;
  gpuModel?: string | null;
  cpuModel?: string | null;
  monitorModel?: string | null;
  prices?: StoreAreaPrice[];
  store?: Pick<Store, 'id' | 'name' | 'code'>;
};

export type StorePayload = {
  orgId: string;
  name: string;
  code?: string;
  status?: StoreStatus;
  machineCount?: number;
  address?: string;
  longitude?: number | null;
  latitude?: number | null;
  phone?: string;
  managerEmployeeId?: string | null;
  responsibleEmployeeId?: string | null;
};

export type EmployeePayload = {
  storeId: string;
  employeeNo?: string;
  name: string;
  phone?: string;
  position?: string;
  positionId?: string | null;
  enabled?: boolean;
  userId?: string | null;
};

export type AreaPayload = {
  storeId: string;
  name: string;
  code?: string;
  level: StoreAreaLevel;
  machineCount?: number;
  gpuModel?: string;
  cpuModel?: string;
  monitorModel?: string;
  prices?: Array<{
    tier: MemberPriceTier;
    price: number;
  }>;
};

export const MEMBER_PRICE_TIER_LABELS: Record<MemberPriceTier, string> = {
  TEMPORARY: '临时卡',
  NORMAL_MEMBER: '普通会员',
  BLUECAT_MEMBER: '蓝猫会员',
  EXTRAORDINARY_MEMBER: '超凡会员',
  APEX_MEMBER: '冠绝会员',
  PLATINUM_MEMBER: '白金会员',
  BLACK_GOLD_MEMBER: '黑金会员',
  MYTHIC_MEMBER: '神话会员'
};

export const AREA_LEVEL_LABELS: Record<StoreAreaLevel, string> = {
  LOW: '低端',
  MID: '中端',
  HIGH: '高端'
};

export function listStores() {
  return request<Store[]>('/stores');
}

export function createStore(payload: StorePayload) {
  return request<Store>('/stores', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateStore(id: string, payload: Partial<StorePayload>) {
  return request<Store>(`/stores/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function listEmployees(storeId?: string) {
  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return request<Employee[]>(`/stores/employees${query}`);
}

export function createEmployee(payload: EmployeePayload) {
  return request<Employee>('/stores/employees', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateEmployee(id: string, payload: Partial<EmployeePayload>) {
  return request<Employee>(`/stores/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function listStoreAreas(storeId?: string) {
  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return request<StoreArea[]>(`/stores/areas${query}`);
}

export function createStoreArea(payload: AreaPayload) {
  return request<StoreArea>('/stores/areas', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateStoreArea(id: string, payload: Partial<AreaPayload>) {
  return request<StoreArea>(`/stores/areas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function upsertAreaPrices(
  id: string,
  prices: Array<{ tier: MemberPriceTier; price: number }>
) {
  return request<StoreAreaPrice[]>(`/stores/areas/${id}/prices`, {
    method: 'POST',
    body: JSON.stringify({ prices })
  });
}

export function listPermissions() {
  return request<Permission[]>('/iam/permissions');
}

export function listPositions() {
  return request<Position[]>('/iam/positions');
}

export function createPosition(payload: {
  name: string;
  code: string;
  description?: string;
  permissionIds?: string[];
}) {
  return request<Position>('/iam/positions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updatePosition(
  id: string,
  payload: {
    name?: string;
    description?: string;
    permissionIds?: string[];
  }
) {
  return request<Position>(`/iam/positions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}
