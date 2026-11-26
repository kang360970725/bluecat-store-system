import { request } from './http';

export type PayrollStatus =
  | 'DRAFT'
  | 'CALCULATED'
  | 'PENDING_REVIEW'
  | 'REVIEWED'
  | 'APPROVED'
  | 'LOCKED'
  | 'PAID'
  | 'CANCELLED';

export type PayrollBatchListItem = {
  id: string;
  payrollMonth: string;
  status: PayrollStatus;
  formulaVersion: string;
  monthlyProrationDays: string | number;
  notes?: string | null;
  calculatedAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  lockedAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
};

export type PayrollStoreProfit = {
  id: string;
  storeId: string;
  targetProfit: string | number;
  actualProfit: string | number;
  achievementRate: string | number;
  excessProfit: string | number;
  bonusPool: string | number;
  includedInHeadOffice: boolean;
  exclusionReason?: string | null;
  store: { id: string; name: string; code: string };
};

export type PayrollEmployeeInput = {
  employeeId: string;
  storeId?: string;
  employeeType: 'STORE_STAFF' | 'STORE_MANAGER' | 'HEAD_OFFICE';
  grade?: string;
  category?: '一类' | '二类' | '三类';
  requiredAttendance: number;
  actualAttendance: number;
  kpiScore: number;
  baseSalary?: number;
  performanceBase?: number;
  probationary?: boolean;
  fullAttendance?: boolean;
  socialSecuritySubsidy?: number;
  rankAllowance?: number;
  mealAllowanceRate?: number;
  makeupAllowance?: number;
  customScoreAdjustment?: number;
  otherEarnings?: number;
  otherDeductions?: number;
  employeeInsurance?: number;
  employeeProvidentFund?: number;
  employerInsurance?: number;
  employerProvidentFund?: number;
  incomeTax?: number;
  alreadyPaid?: number;
  advancePayment?: number;
  attendanceOverride?: boolean;
  attendanceOverrideReason?: string;
};

export type PayrollEmployeeResult = {
  id: string;
  employeeId: string;
  storeId?: string | null;
  employeeType: string;
  inputSnapshot: PayrollEmployeeInput;
  calculationBreakdown: Record<string, number>;
  grossPay: string | number;
  employeeDeductions: string | number;
  netPay: string | number;
  employerContributions: string | number;
  employerCost: string | number;
  attendanceQualified: boolean;
  attendanceOverride?: boolean | null;
  attendanceOverrideReason?: string | null;
};

export type PayrollBatchDetail = PayrollBatchListItem & {
  storeProfits: PayrollStoreProfit[];
  employeeResults?: PayrollEmployeeResult[];
  adjustments?: unknown[];
  auditLogs?: Array<{
    id: string;
    action: string;
    actorName: string;
    reason?: string | null;
    createdAt: string;
  }>;
};

export const getPayrollBatches = () =>
  request<PayrollBatchListItem[]>('/v2/finance/payroll-batches');
export const createPayrollBatch = (body: {
  payrollMonth: string;
  notes?: string;
  monthlyProrationDays?: number;
}) =>
  request<PayrollBatchListItem>('/v2/finance/payroll-batches', {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const deletePayrollBatch = (id: string) =>
  request<{ id: string }>(`/v2/finance/payroll-batches/${id}`, {
    method: 'DELETE'
  });
export const getPayrollBatch = (id: string, sensitive = false) =>
  request<PayrollBatchDetail>(
    `/v2/finance/payroll-batches/${id}?sensitive=${sensitive}`
  );
export const savePayrollStoreProfit = (
  id: string,
  body: {
    storeId: string;
    targetProfit: number;
    actualProfit: number;
    includedInHeadOffice: boolean;
    exclusionReason?: string;
  }
) =>
  request(`/v2/finance/payroll-batches/${id}/store-profit`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
export const calculatePayrollBatch = (
  id: string,
  employees: PayrollEmployeeInput[]
) =>
  request<{
    employeeCount: number;
    headOfficeProfitRate: number;
    totals: { grossPay: number; netPay: number; employerCost: number };
  }>(`/v2/finance/payroll-batches/${id}/calculate`, {
    method: 'POST',
    body: JSON.stringify({ employees })
  });
export const transitionPayrollBatch = (
  id: string,
  status: PayrollStatus,
  reason?: string
) =>
  request(`/v2/finance/payroll-batches/${id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ status, reason })
  });
