export type XManagerShiftRow = {
  shiftId: string;
  snbid: string;
  branchName: string;
  shiftTime: string;
  shiftStartTime: string;
  shiftEndTime: string;
  operator?: string | null;
  barEnd?: string | null;
  currentIncome: number;
  barFeeIncome: number;
  goodsSaleIncome: number;
  leaseIncome?: number | null;
  otherIncome?: number | null;
  otherExpenditure?: number | null;
};

export type NormalizedShiftRevenue = {
  externalShiftId: string;
  externalStoreId: string;
  externalStoreName: string;
  businessDate: string;
  shiftStartedAt: string;
  shiftEndedAt: string;
  handedOverAt: string;
  operatorLabel: string | null;
  terminalLabel: string | null;
  totalIncome: number;
  netFeeIncome: number;
  productSales: number;
  rental: number;
  otherNet: number;
};

const money = (value: number | null | undefined) => Number(value ?? 0);

export function normalizeShiftRevenue(row: XManagerShiftRow): NormalizedShiftRevenue {
  return {
    externalShiftId: row.shiftId, externalStoreId: row.snbid, externalStoreName: row.branchName,
    // X 管家班次从白班或晚班开始时刻归属营业日；不要按跨日后的交班时间归属。
    businessDate: row.shiftStartTime.slice(0, 10), shiftStartedAt: row.shiftStartTime,
    shiftEndedAt: row.shiftEndTime, handedOverAt: row.shiftTime,
    operatorLabel: row.operator ?? null, terminalLabel: row.barEnd ?? null,
    totalIncome: money(row.currentIncome), netFeeIncome: money(row.barFeeIncome),
    productSales: money(row.goodsSaleIncome), rental: money(row.leaseIncome),
    otherNet: money(row.otherIncome) - money(row.otherExpenditure)
  };
}

export function shiftComponentsMatch(row: NormalizedShiftRevenue, tolerance = 0.01) {
  return Math.abs(row.totalIncome - (row.netFeeIncome + row.productSales + row.rental + row.otherNet)) <= tolerance;
}
