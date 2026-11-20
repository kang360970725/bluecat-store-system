import { request, API_BASE_URL } from './http';
import { useAuthStore } from '@/stores/auth';

export type V2MasterDataOverview = {
  organizations: Array<{
    id: string;
    name: string;
    code: string;
    type: string;
    enabled: boolean;
    positions: Array<{
      id: string;
      name: string;
      code: string;
      description?: string | null;
      requiresPGrade: boolean;
    }>;
    _count: { employments: number };
  }>;
  stores: Array<{
    id: string;
    name: string;
    shortName?: string | null;
    code: string;
    status: string;
    organization: { id: string; name: string; code: string };
    _count: { employments: number; positions: number };
    positions: Array<{
      id: string;
      name: string;
      code: string;
      description?: string | null;
      source: string;
      enabled: boolean;
      templateId?: string | null;
      _count: { employments: number };
    }>;
  }>;
  positionTemplates: Array<{
    id: string;
    name: string;
    code: string;
    description?: string | null;
    enabled: boolean;
    monthlyBaseSalary: string | number;
    monthlyPerformanceSalary: string | number;
    hourlyRate: string | number;
    roleId?: string | null;
  }>;
};

let overviewRequest: Promise<V2MasterDataOverview> | null = null;

export function getV2MasterDataOverview() {
  if (overviewRequest) return overviewRequest;
  overviewRequest = request<V2MasterDataOverview>('/v2/master-data/overview');
  void overviewRequest.then(
    () => {
      overviewRequest = null;
    },
    () => {
      overviewRequest = null;
    }
  );
  return overviewRequest;
}

export type V2StoreArchive = {
  costMonth: string;
  store: V2MasterDataOverview['stores'][number] & {
    openedOn?: string | null;
    address?: string | null;
    phone?: string | null;
    machineCount: number;
    businessDayStartsAt: string;
    operatingProfile?: {
      legalEntityName?: string | null;
      usableAreaSqm?: string | null;
      seatCount: number;
      leaseStartsOn?: string | null;
      leaseEndsOn?: string | null;
      notes?: string | null;
    } | null;
  };
  costs: Array<{
    id: string;
    name: string;
    code: string;
    category: string;
    method: string;
    frequency: string;
    fixedAmount?: string | null;
    rate?: string | null;
    effectiveFrom: string;
    effectiveTo?: string | null;
    enabled: boolean;
    corrected?: boolean;
    correctionId?: string | null;
    reason?: string | null;
  }>;
  investments: Array<{
    id: string;
    type: string;
    category: string;
    name: string;
    amount: string;
    occurredOn: string;
    description?: string | null;
  }>;
  areas: Array<{
    id: string;
    name: string;
    code: string;
    description?: string | null;
    enabled: boolean;
  }>;
  assets: Array<{
    id: string;
    assetNo: string;
    category: string;
    name: string;
    brand?: string | null;
    model?: string | null;
    quantity: number;
    purchasePrice?: string | null;
    purchasedOn?: string | null;
    expectedReplacementMonths?: number | null;
    status: string;
    area?: { id: string; name: string; code: string } | null;
  }>;
  positions: Array<{
    id: string;
    name: string;
    code: string;
    source: string;
    enabled: boolean;
  }>;
  employments: Array<{
    id: string;
    startedOn: string;
    employee: {
      id: string;
      employeeNo: string;
      name: string;
      phone?: string | null;
      status: string;
    };
    position: { id: string; name: string; code: string };
  }>;
};

export function getV2StoreArchive(storeId: string, costMonth?: string) {
  return request<V2StoreArchive>(`/v2/master-data/stores/${storeId}/archive${costMonth ? `?costMonth=${encodeURIComponent(costMonth)}` : ''}`);
}

export function createV2PositionTemplate(payload: {
  name: string;
  code?: string;
  description?: string;
  sort?: number;
  monthlyBaseSalary?: number;
  monthlyPerformanceSalary?: number;
  hourlyRate?: number;
  roleId?: string;
}) {
  return request('/v2/master-data/position-templates', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
export const updateV2PositionTemplate = (
  id: string,
  payload: Record<string, unknown>
) =>
  request(`/v2/master-data/position-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export function inheritV2StorePositions(storeId: string) {
  return request(`/v2/master-data/stores/${storeId}/positions/inherit`, {
    method: 'POST'
  });
}

export function createV2StorePosition(
  storeId: string,
  payload: { name: string; code?: string; description?: string; sort?: number }
) {
  return request(`/v2/master-data/stores/${storeId}/positions`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
export const updateV2StorePosition = (
  id: string,
  body: Record<string, unknown>
) =>
  request(`/v2/master-data/positions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
export const deleteV2StorePosition = (id: string) =>
  request(`/v2/master-data/positions/${id}`, { method: 'DELETE' });

export function saveV2OperatingProfile(
  storeId: string,
  payload: Record<string, unknown>
) {
  return request(`/v2/master-data/stores/${storeId}/operating-profile`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
export function createV2StoreCost(
  storeId: string,
  payload: Record<string, unknown>
) {
  return request(`/v2/master-data/stores/${storeId}/costs`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
export function createV2StoreInvestment(
  storeId: string,
  payload: Record<string, unknown>
) {
  return request(`/v2/master-data/stores/${storeId}/investments`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
export function createV2StoreArea(
  storeId: string,
  payload: Record<string, unknown>
) {
  return request(`/v2/master-data/stores/${storeId}/areas`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
export function createV2StoreAsset(
  storeId: string,
  payload: Record<string, unknown>
) {
  return request(`/v2/master-data/stores/${storeId}/assets`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
export const updateV2Store = (id: string, body: Record<string, unknown>) =>
  request(`/v2/master-data/stores/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
export const updateV2StoreCost = (id: string, body: Record<string, unknown>) =>
  request(`/v2/master-data/costs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
export const correctV2StoreCost = (
  storeId: string,
  body: Record<string, unknown>
) =>
  request(`/v2/master-data/stores/${storeId}/cost-corrections`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const deleteV2StoreCost = (id: string) =>
  request(`/v2/master-data/costs/${id}`, { method: 'DELETE' });
export const updateV2StoreInvestment = (
  id: string,
  body: Record<string, unknown>
) =>
  request(`/v2/master-data/investments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
export const deleteV2StoreInvestment = (id: string) =>
  request(`/v2/master-data/investments/${id}`, { method: 'DELETE' });
export const updateV2StoreArea = (id: string, body: Record<string, unknown>) =>
  request(`/v2/master-data/areas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
export const deleteV2StoreArea = (id: string) =>
  request(`/v2/master-data/areas/${id}`, { method: 'DELETE' });
export const updateV2StoreAsset = (id: string, body: Record<string, unknown>) =>
  request(`/v2/master-data/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
export const deleteV2StoreAsset = (id: string) =>
  request(`/v2/master-data/assets/${id}`, { method: 'DELETE' });

export type V2EmployeeItem = {
  id: string;
  employeeNo: string;
  name: string;
  phone?: string | null;
  hiredOn?: string | null;
  status: string;
  employments: Array<{
    id: string;
    store: { id: string; name: string; shortName?: string | null };
    position: { id: string; name: string };
    compensationType: 'MONTHLY' | 'HOURLY';
  }>;
  organizationEmployments: Array<{
    id: string;
    organization: { id: string; name: string; code: string; type: string };
    position: { id: string; name: string; requiresPGrade: boolean };
    costStore?: { id: string; name: string; shortName?: string | null } | null;
    grade?: string | null;
    compensationType: 'MONTHLY' | 'HOURLY';
  }>;
};
export const getV2Employees = (filters?: {
  storeId?: string;
  organizationId?: string;
}) => {
  const params = new URLSearchParams();
  if (filters?.storeId) params.set('storeId', filters.storeId);
  if (filters?.organizationId)
    params.set('organizationId', filters.organizationId);
  const query = params.toString();
  return request<V2EmployeeItem[]>(
    `/v2/master-data/employees${query ? `?${query}` : ''}`
  );
};
export type V2EmployeePayrollProfile = {
  id: string;
  employeeId: string;
  employeeType: 'STORE_STAFF' | 'STORE_MANAGER' | 'HEAD_OFFICE';
  grade?: string | null;
  category?: '一类' | '二类' | '三类' | null;
  probationary: boolean;
  baseSalary: string | number;
  performanceBase: string | number;
  socialSecurityScheme?: string | null;
  socialSecuritySubsidy: string | number;
  rankAllowance: string | number;
  mealAllowanceRate: string | number;
  makeupAllowance: string | number;
  employeeInsurance: string | number;
  employeeProvidentFund: string | number;
  employerInsurance: string | number;
  employerProvidentFund: string | number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  source?: 'PERSONAL' | 'TEMPLATE';
  confirmed?: boolean;
  templateId?: string | null;
  templateName?: string | null;
  reason?: string | null;
};
export type V2PayrollProfileTemplate = Omit<
  V2EmployeePayrollProfile,
  'id' | 'employeeId' | 'effectiveFrom' | 'effectiveTo'
> & {
  id: string;
  name: string;
  code: string;
  positionKeyword?: string | null;
  isDefault: boolean;
};
export const getV2PayrollProfileTemplates = () =>
  request<V2PayrollProfileTemplate[]>(
    '/v2/master-data/payroll-profile-templates'
  );
export const getV2OnboardingPayrollTemplates = () =>
  request<V2PayrollProfileTemplate[]>(
    '/v2/master-data/onboarding-payroll-templates'
  );
export const getV2PayrollGrades = () =>
  request<V2PayrollProfileTemplate[]>('/v2/master-data/payroll-grades');
export const createV2PayrollGrade = (body: Record<string, unknown>) =>
  request('/v2/master-data/payroll-profile-templates', {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const updateV2PayrollGrade = (
  id: string,
  body: Record<string, unknown>
) =>
  request(`/v2/master-data/payroll-profile-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
export const getV2EmployeePayrollProfiles = (month?: string) =>
  request<V2EmployeePayrollProfile[]>(
    `/v2/master-data/employee-payroll-profiles${month ? `?month=${encodeURIComponent(month)}` : ''}`
  );
export const createV2EmployeePayrollProfile = (
  employeeId: string,
  body: Record<string, unknown>
) =>
  request(`/v2/master-data/employees/${employeeId}/payroll-profiles`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const createV2Employee = (body: Record<string, unknown>) =>
  request('/v2/master-data/employees', {
    method: 'POST',
    body: JSON.stringify(body)
  });
export type V2EmployeeImportResult = {
  total: number;
  success: number;
  failed: number;
  failures: Array<{ row: number; reason: string }>;
};
const employeeImportFetch = (path: string, options?: RequestInit) => {
  const auth = useAuthStore();
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      ...options?.headers
    }
  });
};
export const downloadV2EmployeeImportTemplate = async () => {
  const response = await employeeImportFetch('/v2/master-data/employees-import/template');
  if (!response.ok) throw new Error('导入模板下载失败');
  return response.blob();
};
export const importV2Employees = async (file: File) => {
  const body = new FormData();
  body.append('file', file);
  const response = await employeeImportFetch('/v2/master-data/employees-import', { method: 'POST', body });
  const payload = await response.json();
  if (!response.ok || payload.code !== 0) throw new Error(payload.message || '员工导入失败');
  return payload.data as V2EmployeeImportResult;
};
export const updateV2Employee = (
  employeeId: string,
  body: Record<string, unknown>
) =>
  request(`/v2/master-data/employees/${employeeId}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
export const resetV2EmployeePassword = (employeeId: string) =>
  request<{ success: boolean; initialPassword: string }>(
    `/v2/master-data/employees/${employeeId}/reset-password`,
    { method: 'POST' }
  );
export const changeV2Employment = (
  employeeId: string,
  body: Record<string, unknown>
) =>
  request(`/v2/master-data/employees/${employeeId}/employment-change`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const changeV2ManagerStore = (
  employeeId: string,
  body: { managedStoreId: string; effectiveOn: string; reason?: string }
) =>
  request(`/v2/master-data/employees/${employeeId}/manager-transfer`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const addV2Employment = (
  employeeId: string,
  body: Record<string, unknown>
) =>
  request(`/v2/master-data/employees/${employeeId}/employments`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const terminateV2Employee = (
  employeeId: string,
  body: Record<string, unknown>
) =>
  request(`/v2/master-data/employees/${employeeId}/terminate`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const createV2EmployeeLeave = (
  employeeId: string,
  body: Record<string, unknown>
) =>
  request(`/v2/master-data/employees/${employeeId}/leaves`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
export type V2AccessControl = {
  accounts: Array<{
    id: string;
    username: string;
    displayName: string;
    status: string;
    dataScope: string;
    employee?: { id: string; name: string; employeeNo: string } | null;
    roles: Array<{ role: { id: string; name: string; code: string } }>;
  }>;
  roles: Array<{
    id: string;
    name: string;
    code: string;
    description?: string | null;
    permissions: Array<{
      permission: { id: string; code: string; name: string; module: string };
    }>;
  }>;
  permissions: Array<{
    id: string;
    code: string;
    name: string;
    module: string;
  }>;
};
export const getV2AccessControl = () =>
  request<V2AccessControl>('/v2/master-data/access-control');
export interface V2EffectivePermissions {
  displayName: string;
  status: string;
  dataScope: string;
  mustChangePassword: boolean;
  rows: Array<{ code: string; name: string; allowed: boolean; allStores: boolean; stores: Array<{ id: string; name: string }> }>;
}

export interface V2RolePermissionAudit {
  id: string;
  actorName: string;
  beforeCodes: string[];
  afterCodes: string[];
  createdAt: string;
}

export const getV2EffectivePermissions = (id: string) =>
  request<V2EffectivePermissions>(`/v2/master-data/accounts/${encodeURIComponent(id)}/effective-permissions`);
export const getV2RolePermissionAudit = (id: string) =>
  request<V2RolePermissionAudit[]>(`/v2/master-data/roles/${encodeURIComponent(id)}/permission-audit`);
export type V2AccountScopeMode = 'EMPLOYEE_STORE' | 'ASSIGNED_STORES' | 'ALL_STORES';
export type V2AuthorizationSnapshot = { roleId?: string | null; dataScope?: V2AccountScopeMode; storeIds?: string[] };
export interface V2AuthorizationAudit {
  id: string;
  subject: 'POSITION_TEMPLATE' | 'ACCOUNT_SCOPE';
  subjectName: string;
  actorName: string;
  before: V2AuthorizationSnapshot | null;
  after: V2AuthorizationSnapshot;
  createdAt: string;
}
export const getV2AuthorizationAudit = () =>
  request<V2AuthorizationAudit[]>('/v2/master-data/authorization-audit');
export const updateV2AccountScope = (id: string, dataScope: V2AccountScopeMode, storeIds: string[]) =>
  request(`/v2/master-data/accounts/${encodeURIComponent(id)}/store-scope`, {
    method: 'PATCH', body: JSON.stringify({ dataScope, storeIds })
  });
export const createV2Role = (body: Record<string, unknown>) =>
  request('/v2/master-data/roles', {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const updateV2Role = (id: string, body: Record<string, unknown>) =>
  request(`/v2/master-data/roles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
export const createV2Account = (body: Record<string, unknown>) =>
  request('/v2/master-data/accounts', {
    method: 'POST',
    body: JSON.stringify(body)
  });

export type V2LoginUser = {
  id: string;
  accountType: 'LEGACY_USER' | 'V2_ACCOUNT';
  username: string;
  displayName: string;
  status: string;
  dataScope: string;
  employee?: { id: string; name: string; employeeNo: string } | null;
  roles: Array<{ name: string; code: string }>;
  stores: Array<{ id: string; name: string; shortName?: string | null }>;
  lastLoginAt?: string | null;
};
export type V2LoginLog = {
  id: string;
  accountType: string;
  accountId: string;
  username: string;
  displayName: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  loggedInAt: string;
};
export const getV2LoginUsers = () =>
  request<V2LoginUser[]>('/v2/master-data/login-users');
export const getV2LoginLogs = (
  accountType: string,
  accountId: string,
  page = 1,
  pageSize = 20
) =>
  request<{
    items: V2LoginLog[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    `/v2/master-data/login-users/${encodeURIComponent(accountType)}/${encodeURIComponent(accountId)}/logs?page=${page}&pageSize=${pageSize}`
  );
