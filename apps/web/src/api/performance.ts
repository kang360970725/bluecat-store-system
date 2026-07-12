import { request } from './http';

export type PerformanceCosts = {
  managementFee: number;
  rent: number;
  propertyTrashFee: number;
  utilities: number;
  drinkMaterial: number;
  mealMaterial: number;
  welfare: number;
  salary: number;
  franchiseFee: number;
  baseOperationSoftware: number;
  storeOperation: number;
  advertisingMaterial: number;
  financeTax: number;
  withdrawalFee: number;
};

export type PerformanceRow = {
  store: {
    id: string;
    name: string;
    code: string;
  };
  month: string;
  targetId: string | null;
  targetRevenue: number;
  netFeeTarget: number;
  productTarget: number;
  splitStatus: 'PENDING' | 'ACTIVE';
  actualRevenue: number;
  estimatedRevenue: number;
  monthlyCompletionRate: number;
  currentProgress: number;
  rank: number;
  costs: PerformanceCosts;
  totalCost: number;
  costRatio: number;
  grossProfit: number;
  editable: boolean;
};

export type MonthlyPerformanceResult = {
  month: string;
  dataDeadline: string;
  rows: PerformanceRow[];
  summary: Omit<PerformanceRow, 'store' | 'month' | 'targetId' | 'rank' | 'costs' | 'editable'>;
};

export type PerformanceTargetPayload = Partial<
  PerformanceCosts & {
    targetRevenue: number;
    netFeeTarget: number;
    productTarget: number;
  }
>;

export function listMonthlyPerformances(month: string) {
  return request<MonthlyPerformanceResult>(
    `/performances/monthly?month=${encodeURIComponent(month)}`
  );
}

export function updatePerformanceTarget(
  storeId: string,
  month: string,
  payload: PerformanceTargetPayload
) {
  return request(`/performances/monthly/${storeId}?month=${encodeURIComponent(month)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function createPerformanceTarget(
  payload: PerformanceTargetPayload & {
    storeId: string;
    month: string;
  }
) {
  return request('/performances/monthly', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function listPerformanceExistingMonths(storeId: string) {
  return request<string[]>(
    `/performances/monthly/existing-months?storeId=${encodeURIComponent(storeId)}`
  );
}

export function copyPreviousMonthCosts(storeId: string, month: string) {
  return request<PerformanceCosts>(
    `/performances/monthly/${storeId}/copy-costs?month=${encodeURIComponent(month)}`,
    {
      method: 'POST'
    }
  );
}

export function generatePerformanceSplit(
  targetId: string,
  payload: {
    netFeeTarget?: number;
    productTarget?: number;
    weekendIncreaseRate?: number;
  } = {}
) {
  return request(`/performances/splits/${targetId}/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export type SplitPlanResult = {
  id: string;
  store: {
    id: string;
    name: string;
    code: string;
  };
  month: string;
  status: 'PENDING' | 'ACTIVE';
  netFeeTarget: number;
  productTarget: number;
  weekendIncreaseRate: number;
  rows: Array<{
    id: string;
    date: string;
    weekday: string;
    shift: {
      id: string;
      name: string;
      code: string;
    };
    staff: {
      cashier: EmployeeOption | null;
      floor: EmployeeOption | null;
      flex: EmployeeOption | null;
    };
    netFeeTarget: number;
    productTarget: number;
    netFeeActual: number;
    productActual: number;
    netFeeCompletionRate: number;
    productCompletionRate: number;
    totalTarget: number;
    totalActual: number;
    totalCompletionRate: number;
  }>;
  summary: {
    netFeeTarget: number;
    productTarget: number;
    netFeeActual: number;
    productActual: number;
  };
};

type EmployeeOption = {
  id: string;
  name: string;
  employeeNo: string;
};

export function getPerformanceSplit(storeId: string, month: string) {
  return request<SplitPlanResult>(
    `/performances/splits?storeId=${encodeURIComponent(storeId)}&month=${encodeURIComponent(month)}`
  );
}

export function updatePerformanceSplitItem(
  id: string,
  payload: {
    netFeeTarget?: number;
    productTarget?: number;
  }
) {
  return request(`/performances/splits/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export type ScheduleRole = 'CASHIER' | 'FLOOR' | 'FLEX';

export type ScheduleResult = {
  month: string;
  roles: Array<{ label: string; value: ScheduleRole }>;
  shifts: Array<{ id: string; name: string; code: string }>;
  employees: Array<EmployeeOption & { position?: string | null }>;
  rows: Array<{
    id: string;
    date: string;
    weekday: string;
    shift: {
      id: string;
      name: string;
      code: string;
    };
    role: ScheduleRole;
    employee: EmployeeOption;
  }>;
};

export function listSchedules(storeId: string, month: string) {
  return request<ScheduleResult>(
    `/performances/schedules?storeId=${encodeURIComponent(storeId)}&month=${encodeURIComponent(month)}`
  );
}

export function upsertSchedule(payload: {
  storeId: string;
  workDate: string;
  shiftId: string;
  role: ScheduleRole;
  employeeId?: string | null;
}) {
  return request('/performances/schedules', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export type ShiftDashboardResult =
  | {
      active: false;
      storeId: string;
      date: string;
      message: string;
    }
  | {
      active: true;
      store: {
        id: string;
        name: string;
        code: string;
      };
      date: string;
      todayRows: Array<{
        shift: {
          id: string;
          name: string;
          code: string;
        };
        netFeeTarget: number;
        productTarget: number;
        netFeeActual: number;
        productActual: number;
        totalCompletionRate: number;
      }>;
      performanceScore: number;
      monthSummary: {
        totalTarget: number;
        currentPerformance: number;
        remainingPerformance: number;
      };
      scoreRule: string;
    };

export function getShiftDashboard(storeId?: string, date?: string) {
  const params = new URLSearchParams();
  if (storeId) params.set('storeId', storeId);
  if (date) params.set('date', date);
  const query = params.toString();
  return request<ShiftDashboardResult>(
    `/performances/shift-dashboard${query ? `?${query}` : ''}`
  );
}
