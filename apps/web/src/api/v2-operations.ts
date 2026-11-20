import { request } from './http';
export type V2OperationsOverview = {
  shiftTemplates: Array<{
    id: string;
    name: string;
    code: string;
    startsAt: string;
    endsAt: string;
    spansNextDay: boolean;
  }>;
  schedules: Array<{
    id: string;
    startsOn: string;
    endsOn: string;
    status: string;
    store: { id: string; name: string; shortName?: string | null };
    _count: { assignments: number };
  }>;
  targets: Array<{
    id: string;
    targetMonth: string;
    revenueTarget: string;
    profitTarget?: string | null;
    status: string;
    store: { id: string; name: string; shortName?: string | null };
  }>;
  scorePlans: Array<{
    id: string;
    name: string;
    code: string;
    version: number;
    enabled: boolean;
    _count: { criteria: number; scores: number };
  }>;
  connections: Array<{
    id: string;
    storeId: string;
    externalStoreId: string;
    externalStoreName?: string | null;
    enabledModules: string[];
    sessionStatus: string;
    lastCheckedAt?: string | null;
    lastSucceededAt?: string | null;
    store: {
      id: string;
      name: string;
      shortName?: string | null;
      code: string;
    };
    jobs: Array<{
      id: string;
      module: string;
      status: string;
      createdAt: string;
      errorReason?: string | null;
    }>;
  }>;
  externalStoreCandidates: Array<{
    id: string;
    externalStoreId: string;
    externalBranchId?: string | null;
    externalStoreName?: string | null;
    status: 'PENDING' | 'MATCHED' | 'IGNORED';
    lastSeenAt: string;
  }>;
};
export const getV2OperationsOverview = () =>
  request<V2OperationsOverview>('/v2/operations/overview');
export const createV2ShiftTemplate = (body: Record<string, unknown>) =>
  request('/v2/operations/shift-templates', {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const inheritV2Shifts = (storeId: string) =>
  request(`/v2/operations/stores/${storeId}/shifts/inherit`, {
    method: 'POST'
  });
export const createV2Schedule = (body: Record<string, unknown>) =>
  request('/v2/operations/schedules', {
    method: 'POST',
    body: JSON.stringify(body)
  });
export type V2ScheduleDetail = {
  id: string;
  storeId: string;
  startsOn: string;
  endsOn: string;
  status: string;
  store: { id: string; name: string; shortName?: string | null; code: string };
  assignments: Array<{
    id: string;
    workDate: string;
    lockedAt?: string | null;
    note?: string | null;
    shift: { id: string; name: string; startsAt: string; endsAt: string };
    employee: { id: string; name: string; employeeNo: string };
    position: { id: string; name: string; code: string };
  }>;
};
export type V2ScheduleOptions = {
  shifts: Array<{
    id: string;
    name: string;
    code: string;
    startsAt: string;
    endsAt: string;
  }>;
  employments: Array<{
    id: string;
    employee: { id: string; name: string; employeeNo: string; status: string };
    position: { id: string; name: string; code: string };
  }>;
};
export const getV2Schedule = (id: string) =>
  request<V2ScheduleDetail>(`/v2/operations/schedules/${id}`);
export const getV2ScheduleOptions = (storeId: string) =>
  request<V2ScheduleOptions>(
    `/v2/operations/stores/${storeId}/schedule-options`
  );
export const createV2ScheduleAssignment = (body: Record<string, unknown>) =>
  request('/v2/operations/schedule-assignments', {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const deleteV2ScheduleAssignment = (id: string) =>
  request(`/v2/operations/schedule-assignments/${id}`, { method: 'DELETE' });
export const publishV2Schedule = (id: string) =>
  request(`/v2/operations/schedules/${id}/publish`, { method: 'POST' });
export const lockV2Schedule = (id: string) =>
  request(`/v2/operations/schedules/${id}/lock`, { method: 'POST' });
export const createV2Target = (body: Record<string, unknown>) =>
  request('/v2/operations/targets', {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const createV2ScorePlan = (body: Record<string, unknown>) =>
  request('/v2/operations/score-plans', {
    method: 'POST',
    body: JSON.stringify(body)
  });
export type V2WecomWebhookConfig = {
  id: string;
  name: string;
  webhookMasked: string;
  reportType: 'SINGLE' | 'MULTI' | 'ALL';
  storeIds: string[];
  enabled: boolean;
  scheduleEnabled: boolean;
  scheduleFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
  scheduleTime?: string | null;
  scheduleWeekday?: number | null;
  scheduleMonthDay?: number | null;
  lastScheduledAt?: string | null;
  lastScheduleStatus?: string | null;
  lastScheduleError?: string | null;
  lastTestedAt?: string | null;
  lastTestStatus?: string | null;
  lastTestMessage?: string | null;
  pushLogs: Array<{
    id: string;
    status: string;
    reportMonth: string;
    errorMessage?: string | null;
    createdAt: string;
    sentAt?: string | null;
  }>;
};
export const getV2WecomWebhooks = () =>
  request<V2WecomWebhookConfig[]>('/v2/operations/wecom-webhooks');
export const createV2WecomWebhook = (body: Record<string, unknown>) =>
  request('/v2/operations/wecom-webhooks', {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const updateV2WecomWebhook = (
  id: string,
  body: Record<string, unknown>
) =>
  request(`/v2/operations/wecom-webhooks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
export const testV2WecomWebhook = (id: string) =>
  request<{ success: boolean; message: string }>(
    `/v2/operations/wecom-webhooks/${id}/test`,
    { method: 'POST' }
  );
export const pushV2WecomReport = (id: string) =>
  request<{
    success: boolean;
    reportMonth: string;
    storeCount: number;
    imageBytes: number;
  }>(`/v2/operations/wecom-webhooks/${id}/push`, { method: 'POST' });
export const saveV2DataSource = (body: Record<string, unknown>) =>
  request('/v2/operations/data-sources', {
    method: 'POST',
    body: JSON.stringify(body)
  });
export const discoverV2Stores = () =>
  request<{
    discovered: number;
    createdCandidates: number;
    updatedCandidates: number;
    pending: number;
    mapped: number;
  }>('/v2/operations/data-sources/discover', { method: 'POST' });
export const syncV2StoreMachineCounts = () =>
  request<{
    mappedStoreCount: number;
    updatedStoreCount: number;
    skippedStoreCount: number;
    updated: Array<{
      storeId: string;
      storeName: string;
      previousMachineCount: number;
      machineCount: number;
    }>;
    skipped: Array<{
      externalStoreId: string;
      storeName: string;
      reason: string;
    }>;
  }>('/v2/operations/data-sources/sync-machine-counts', { method: 'POST' });
export const matchV2ExternalStoreCandidate = (id: string, storeId: string) =>
  request(`/v2/operations/external-store-candidates/${id}/match`, {
    method: 'POST',
    body: JSON.stringify({ storeId })
  });
export const checkV2DataSource = (id: string) =>
  request(`/v2/operations/data-sources/${id}/check-session`, {
    method: 'POST'
  });
export const triggerV2Capture = (body: Record<string, unknown>) =>
  request<{
    results: Array<{ module: string; status: string; error?: string }>;
  }>('/v2/operations/capture', { method: 'POST', body: JSON.stringify(body) });
export type V2StorePerformance = {
  store: {
    id: string;
    name: string;
    shortName?: string | null;
    code: string;
    businessDayStartsAt: string;
  };
  month: string;
  currentShiftIncome: number;
  currentShiftLabel?: string | null;
  currentShiftHandedOverAt?: string | null;
  todayIncome: number;
  monthTotal: number;
  otaTotal: number;
  otaReferenceTotal?: number;
  settledDays: number;
  liveIncluded: boolean;
  shifts: Array<{
    id: string;
    businessDate: string;
    shiftStartedAt: string;
    shiftEndedAt: string;
    handedOverAt: string;
    operatorLabel?: string | null;
    totalIncome: string;
    netFeeIncome: string;
    productSales: string;
    rental: string;
    storeShift?: { id: string; name: string; code: string } | null;
  }>;
};
export const getV2StorePerformance = (storeId: string, month: string) =>
  request<V2StorePerformance>(
    `/v2/operations/stores/${storeId}/performance?month=${encodeURIComponent(month)}`
  );
export type V2StorePerformanceRanking = {
  month: string;
  elapsedDays: number;
  daysInMonth: number;
  items: Array<{
    storeId: string;
    monthTotal: number;
    estimatedRevenue: number;
    target: number;
    completionRate: number;
    estimatedCompletionRate: number;
    profitTarget: number;
    actualProfit: number;
    profitCompletionRate: number;
    estimatedProfit: number;
    estimatedProfitCompletionRate: number;
    rank: number;
  }>;
};
export const getV2StorePerformanceRanking = (month = '') =>
  request<V2StorePerformanceRanking>(
    `/v2/operations/store-performance-ranking${month ? `?month=${encodeURIComponent(month)}` : ''}`
  );
export type V2OperatingDashboard = {
  store: V2StorePerformance['store'];
  month: string;
  isCurrentMonth: boolean;
  elapsedDays: number;
  daysInMonth: number;
  actualRevenue: number;
  forecastRevenue: number;
  operatingExpense: number;
  investmentOutflow: number;
  totalCashOutflow: number;
  forecastProfit: number;
  forecastProfitRate: number;
  settledDays: number;
  liveIncluded: boolean;
  costItems: Array<{
    id: string;
    name: string;
    category: string;
    method: string;
    frequency: string;
    fixedAmount: number;
    rate: number;
    amount: number;
  }>;
};
export const getV2OperatingDashboard = (storeId: string, month: string) =>
  request<V2OperatingDashboard>(
    `/v2/operations/stores/${storeId}/operating-dashboard?month=${encodeURIComponent(month)}`
  );
export type V2UsageAnalytics = {
  store: {
    id: string;
    code: string;
    name: string;
    shortName?: string | null;
  };
  start: string;
  end: string;
  expectedDays: number;
  coverageDays: string[];
  machineSnapshot: {
    date: string | null;
    capturedAt: string | null;
    machineCount: number;
    areaCount: number;
  };
  totals: {
    sessionCount: number;
    usageHours: number;
    feeConsumption: number;
    timedFeeConsumption: number;
  };
  capacity: {
    configuredMachineCount: number;
    observedMachineCount: number;
    machineCount: number;
    expectedMachineHours: number;
    seatRate: number | null;
  };
  traffic: {
    sessionStarts: number;
    sessionEnds: number;
    uniqueVisitors: number;
    identifiedSessionStarts: number;
    customerIdentificationRate: number | null;
    averageStayHours: number;
    peakConcurrent: number;
    feePerVisitor: number;
  };
  customerSegments: {
    uniqueVisitors: number;
    firstObservedVisitors: number;
    returningVisitors: number;
    repeatVisitors: number;
    repeatRate: number | null;
    frequentVisitors: number;
    dormantReturnVisitors: number;
    historyStartDate: string | null;
  };
  areas: Array<{
    areaName: string;
    machineCount: number;
    configuredMachineCount: number;
    observedMachineCount: number;
    sessionCount: number;
    usageHours: number;
    feeConsumption: number;
    feePerUsageHour: number;
    utilizationRate: number | null;
  }>;
  machines: Array<{
    machineNumber: string;
    areaName: string;
    configured: boolean;
    sessionCount: number;
    usageHours: number;
    feeConsumption: number;
    utilizationRate: number;
  }>;
  hourly: Array<{
    hour: number;
    sessionStarts: number;
    sessionEnds: number;
    averageSessionStarts: number;
    averageSessionEnds: number;
    uniqueVisitors: number;
    usageHours: number;
    feeConsumption: number;
    averageConcurrent: number;
    peakConcurrent: number;
    seatRate: number | null;
  }>;
  weekdayHourly: Array<{
    weekday: number;
    weekdayLabel: string;
    hour: number;
    dayCount: number;
    sessionStarts: number;
    sessionEnds: number;
    averageSessionStarts: number;
    averageSessionEnds: number;
    uniqueVisitors: number;
    averageUniqueVisitors: number;
    usageHours: number;
    averageConcurrent: number;
    peakConcurrent: number;
    seatRate: number | null;
    feeConsumption: number;
  }>;
  dailyAreas: Array<{
    date: string;
    areas: Array<{
      areaName: string;
      machineCount: number;
      usageHours: number;
      feeConsumption: number;
      utilizationRate: number | null;
    }>;
  }>;
  dailyTraffic: Array<{
    date: string;
    weekday: number;
    weekdayLabel: string;
    sessionStarts: number;
    sessionEnds: number;
    uniqueVisitors: number;
    usageHours: number;
    averageConcurrent: number;
    peakConcurrent: number;
    seatRate: number | null;
    feeConsumption: number;
  }>;
  quality: {
    invalidDurationCount: number;
    missingAreaCount: number;
    missingMachineCount: number;
    unmappedObservedMachineCount: number;
    unusedConfiguredMachineCount: number;
    warnings: string[];
  };
};
export const getV2UsageAnalytics = (
  storeId: string,
  start: string,
  end: string
) =>
  request<V2UsageAnalytics>(
    `/v2/operations/stores/${storeId}/usage-analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  );
export type V2UsageStrategyAdvice = {
  code: string;
  title: string;
  evidence: string;
  action: string;
};
export type V2UsageAnalyticsRanking = {
  start: string;
  end: string;
  storeCount: number;
  availableStoreCount: number;
  benchmarks: {
    seatRate: number;
    repeatRate: number;
    averageStayHours: number;
    feePerVisitor: number;
  };
  items: Array<
    | {
        available: true;
        rank: number;
        bottomStore: boolean;
        store: V2UsageAnalytics['store'];
        coverageDays: number;
        expectedDays: number;
        machineCount: number;
        configuredMachineCount: number;
        observedMachineCount: number;
        seatRate: number;
        sessionStarts: number;
        uniqueVisitors: number;
        repeatRate: number;
        averageStayHours: number;
        peakConcurrent: number;
        feePerVisitor: number;
        peakHour: number | null;
        lowWindow: string | null;
        topAreaShare: number;
        qualityWarnings: string[];
        suggestions: V2UsageStrategyAdvice[];
      }
    | {
        available: false;
        store: V2UsageAnalytics['store'];
        error: string;
      }
  >;
};
export const getV2UsageAnalyticsRanking = (start: string, end: string) =>
  request<V2UsageAnalyticsRanking>(
    `/v2/operations/usage-analytics-ranking?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  );
export type V2OperationsMonthlyReport = {
  generated: boolean;
  store: {
    id: string;
    code: string;
    name: string;
    shortName?: string | null;
    machineCount: number;
  };
  periodType: 'MONTH' | 'WEEK';
  periodKey: string;
  startDate: string;
  endDate: string;
  previousStartDate?: string;
  previousEndDate?: string;
  comparison?: 'MONTH_OVER_MONTH' | 'WEEK_OVER_WEEK';
  error?: string | null;
  generatedAt?: string;
  machineCount?: number;
  groups: Array<{
    code: string;
    label: string;
    metrics: Array<{
      code: string;
      label: string;
      unit: 'CURRENCY' | 'COUNT' | 'HOURS' | 'PERCENT' | 'RATIO';
      previous: number | null;
      current: number | null;
      changeRate: number | null;
      available: boolean;
      source: string | null;
    }>;
  }>;
  groupPurchase?: Array<{
    code: string;
    label: string;
    previousAmount: number | null;
    currentAmount: number | null;
    changeRate: number | null;
    percentage: number | null;
    channels: Record<string, number>;
  }>;
  incomeComposition?: Array<{
    code: string;
    label: string;
    amount: number | null;
    percentage: number | null;
  }>;
};
export const getV2OperationsMonthlyReport = (storeId: string, month: string) =>
  request<V2OperationsMonthlyReport>(
    `/v2/operations/stores/${storeId}/monthly-report?month=${encodeURIComponent(month)}`
  );
export type V2OperationsWeeklyReport = Omit<
  V2OperationsMonthlyReport,
  'periodType' | 'comparison'
> & {
  periodType: 'WEEK';
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  comparison: 'WEEK_OVER_WEEK';
};
export const getV2OperationsWeeklyReport = (storeId: string, start: string) =>
  request<V2OperationsWeeklyReport>(
    `/v2/operations/stores/${storeId}/weekly-report?start=${encodeURIComponent(start)}`
  );
export const generateV2OperationsReport = (
  storeId: string,
  payload: { periodType: 'MONTH' | 'WEEK'; period: string; resync: boolean }
) =>
  request<V2OperationsMonthlyReport>(
    `/v2/operations/stores/${storeId}/reports/generate`,
    { method: 'POST', body: JSON.stringify(payload) }
  );
export type V2OperationsReportComparison = {
  periodType: 'MONTH' | 'WEEK';
  period: string | null;
  storeCount: number;
  rows: Array<{
    store: V2OperationsMonthlyReport['store'];
    metrics: Record<string, number | null>;
    revenueChangeRate: number | null;
    dataQuality: {
      sourceDays: number;
      expectedDays: number;
      complete: boolean;
      revenueRows: number;
      otaRows: number;
    };
  }>;
};
export const getV2OperationsReportComparison = (
  periodType: 'MONTH' | 'WEEK',
  period: string
) =>
  request<V2OperationsReportComparison>(
    `/v2/operations/report-comparison?periodType=${periodType}&period=${encodeURIComponent(period)}`
  );
export type V2PerformanceSplit = {
  month: string;
  date?: string | null;
  configured: boolean;
  target?: {
    id: string;
    revenueTarget: string;
    profitTarget?: string | null;
    status: string;
    ruleVersion: string;
  } | null;
  summary: {
    target: number;
    actual: number;
    netFeeActual: number;
    productGross: number;
    productExcluded: number;
    productActual: number;
    rentalActual: number;
    otaActual: number;
    todayRealtime: number;
    difference: number;
    completionRate: number;
    operatingCost: number;
    profitTarget: number;
    actualProfit: number;
    profitDifference: number;
    profitCompletionRate: number;
  };
  daily: Array<{
    date: string;
    target: number;
    actual: number;
    shiftActual: number;
    reconciliation: number;
    sourceKind?: string | null;
    difference: number;
    completionRate: number;
    shifts: Array<{
      id: string;
      targetAmount: string;
      actualAmount?: string | number | null;
      actualNetFee: number;
      actualProductSales: number;
      actualProductGross: number;
      actualProductExcluded: number;
      actualRental: number;
      actualOta: number;
      shift?: { id: string; name: string; code: string } | null;
    }>;
  }>;
};
export const getV2PerformanceSplit = (
  storeId: string,
  month: string,
  date?: string | null
) =>
  request<V2PerformanceSplit>(
    `/v2/operations/stores/${storeId}/performance-split?month=${encodeURIComponent(month)}${date ? `&date=${encodeURIComponent(date)}` : ''}`
  );
export const generateV2PerformanceSplit = (
  storeId: string,
  body: {
    targetMonth: string;
    revenueTarget: number;
    profitTarget?: number;
    weekendIncreaseRate?: number;
  }
) =>
  request<V2PerformanceSplit>(
    `/v2/operations/stores/${storeId}/performance-split/generate`,
    { method: 'POST', body: JSON.stringify(body) }
  );
export type V2ProductExclusionCenter = {
  month: string;
  selectedCategoryIds: string[];
  historicalEditable: boolean;
  categories: Array<{
    id: string;
    externalCategoryId: string;
    name: string;
    active: boolean;
    historical: boolean;
    excluded: boolean;
    monthSalesAmount: number;
    capturedAt: string;
  }>;
  summary: { excludedAmount: number; snapshotCount: number };
};
export const getV2ProductExclusionCenter = (storeId: string, month: string) =>
  request<V2ProductExclusionCenter>(
    `/v2/operations/stores/${storeId}/product-exclusions?month=${encodeURIComponent(month)}`
  );
export const syncV2ProductCategories = (storeId: string) =>
  request<{ count: number; historicalCount: number; deactivated: number }>(
    `/v2/operations/stores/${storeId}/product-categories/sync`,
    { method: 'POST' }
  );
export type V2CollectorLoginQr = {
  ok: boolean;
  contractVersion: '1.0';
  xmId: string;
  qrUrl: string;
};
export type V2CollectorLoginQrStatus = {
  ok: boolean;
  contractVersion: '1.0';
  status: string;
  message?: string;
  next?: { xmId: string; qrUrl: string };
};
export const createV2CollectorLoginQr = () =>
  request<V2CollectorLoginQr>('/v2/operations/data-sources/login/qr', {
    method: 'POST'
  });
export const checkV2CollectorLoginQr = (xmId: string) =>
  request<V2CollectorLoginQrStatus>(
    `/v2/operations/data-sources/login/qr/${encodeURIComponent(xmId)}`
  );
export const updateV2ProductCategoryExclusion = (
  id: string,
  excluded: boolean,
  month: string
) =>
  request(`/v2/operations/product-categories/${id}/excluded`, {
    method: 'PATCH',
    body: JSON.stringify({ excluded, month })
  });
export const updateV2ProductCategoryExclusions = (
  storeId: string,
  excludedIds: string[],
  month: string
) =>
  request(`/v2/operations/stores/${storeId}/product-categories/exclusions`, {
    method: 'POST',
    body: JSON.stringify({ excludedIds, month })
  });
export const syncV2ProductExclusions = (storeId: string, month: string) =>
  request(`/v2/operations/stores/${storeId}/product-exclusions/sync`, {
    method: 'POST',
    body: JSON.stringify({ month })
  });
export type V2OtaCenter = {
  month: string;
  summary: {
    gross: number;
    excluded: number;
    actual: number;
    feeAndSettlementDifference: number;
    count: number;
  };
  productPagination: { page: number; pageSize: number; total: number };
  redemptionPagination: { page: number; pageSize: number; total: number };
  products: Array<{
    id: string;
    platform: string;
    externalProductId: string;
    name: string;
    amount: string | number;
    status?: string | null;
    isBrush: boolean;
    settlementRate: string | number;
    feeRate: string | number;
    capturedAt: string;
  }>;
  redemptions: Array<{
    id: string;
    externalOrderId: string;
    platform: string;
    productName: string;
    operatedAt: string;
    operatorLabel?: string | null;
    useSource?: string | null;
    status?: string | null;
    amount: string | number;
    actualAmount: number;
    product?: {
      id: string;
      isBrush: boolean;
      settlementRate: string | number;
      feeRate: string | number;
    } | null;
    storeShift?: { id: string; name: string } | null;
  }>;
};
export const getV2OtaCenter = (
  storeId: string,
  month: string,
  productPage = 1,
  productPageSize = 20,
  redemptionPage = 1,
  redemptionPageSize = 30,
  redemptionStatus = 'ALL',
  redemptionKeyword = '',
  productStatus = 'ALL'
) =>
  request<V2OtaCenter>(
    `/v2/operations/stores/${storeId}/ota-center?month=${encodeURIComponent(month)}&productPage=${productPage}&productPageSize=${productPageSize}&redemptionPage=${redemptionPage}&redemptionPageSize=${redemptionPageSize}&redemptionStatus=${encodeURIComponent(redemptionStatus)}&redemptionKeyword=${encodeURIComponent(redemptionKeyword)}&productStatus=${encodeURIComponent(productStatus)}`
  );
export const updateV2OtaProductBrush = (id: string, isBrush: boolean) =>
  request(`/v2/operations/ota-products/${id}/brush`, {
    method: 'PATCH',
    body: JSON.stringify({ isBrush })
  });
export const updateV2OtaProductSettlement = (
  id: string,
  settlementRate: number,
  feeRate: number
) =>
  request(`/v2/operations/ota-products/${id}/settlement`, {
    method: 'PATCH',
    body: JSON.stringify({ settlementRate, feeRate })
  });
export const syncV2OtaProducts = (storeId: string) =>
  request(`/v2/operations/stores/${storeId}/ota-products/sync`, {
    method: 'POST'
  });
export const markV2RedemptionProductBrush = (id: string) =>
  request<{ linked: number }>(
    `/v2/operations/ota-redemptions/${id}/brush-product`,
    { method: 'POST' }
  );
