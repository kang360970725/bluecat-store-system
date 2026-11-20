export type XManagerSettledRevenueRow = {
  data_start_time: string;
  data_end_time: string;
  snbid: string;
  snbid_name: string;
  surplus: number;
  fee_income: number;
  goods_income: number;
  lease_deposit_charge_all?: number | null;
  other_income?: number | null;
  other_payout?: number | null;
  tipOnline?: number | null;
  couponSaleOnline?: number | null;
  benefitSaleOnline?: number | null;
};

export type XManagerLiveRevenueRow = {
  data_start_time: string;
  data_end_time: string;
  snbid: string;
  snbid_name: string;
  total_income: number;
  fee_income: number;
  goods_income: number;
  lease_deposit_charge_all?: number | null;
  other_income?: number | null;
  cash_income?: number | null;
  paymentIncomeList?: Array<{ payAccount: string; money: number }> | null;
  bar_counter_pay?: number | null;
  mini_pay?: number | null;
  desk_pay?: number | null;
  wechat_pay?: number | null;
  alipay?: number | null;
  otherEndPay?: number | null;
};

export type NormalizedRevenueSnapshot = {
  kind: 'SETTLED_DAILY' | 'LIVE_TODAY';
  externalStoreId: string;
  externalStoreName: string;
  businessDate: string;
  subtotal: number;
  netFeeIncome: number;
  productSales: number;
  rental: number;
  tips: number;
  voucherSales: number;
  equitySales: number;
  otherIncome: number;
  otherExpense: number;
  otherNet: number;
  cashAmount: number | null;
  onlineAmount: number | null;
};

const money = (value: number | null | undefined) => Number(value ?? 0);
const businessDate = (value: string) => value.slice(0, 10);

export function normalizeSettledRevenue(row: XManagerSettledRevenueRow): NormalizedRevenueSnapshot {
  return {
    kind: 'SETTLED_DAILY', externalStoreId: row.snbid, externalStoreName: row.snbid_name,
    businessDate: businessDate(row.data_start_time), subtotal: money(row.surplus),
    netFeeIncome: money(row.fee_income), productSales: money(row.goods_income),
    rental: money(row.lease_deposit_charge_all), tips: money(row.tipOnline),
    voucherSales: money(row.couponSaleOnline), equitySales: money(row.benefitSaleOnline),
    otherIncome: money(row.other_income), otherExpense: money(row.other_payout),
    otherNet: money(row.other_income) - money(row.other_payout), cashAmount: null, onlineAmount: null
  };
}

export function normalizeLiveRevenue(row: XManagerLiveRevenueRow): NormalizedRevenueSnapshot {
  const onlineAmount = (row.paymentIncomeList ?? []).reduce((sum, item) => sum + money(item.money), 0);
  return {
    kind: 'LIVE_TODAY', externalStoreId: row.snbid, externalStoreName: row.snbid_name,
    businessDate: businessDate(row.data_start_time), subtotal: money(row.total_income),
    netFeeIncome: money(row.fee_income), productSales: money(row.goods_income),
    rental: money(row.lease_deposit_charge_all), tips: 0, voucherSales: 0, equitySales: 0,
    otherIncome: money(row.other_income), otherExpense: 0, otherNet: money(row.other_income),
    cashAmount: money(row.cash_income), onlineAmount
  };
}

export function revenueComponentsMatch(snapshot: NormalizedRevenueSnapshot, tolerance = 0.01) {
  const componentTotal = snapshot.netFeeIncome + snapshot.productSales + snapshot.rental +
    snapshot.tips + snapshot.voucherSales + snapshot.equitySales + snapshot.otherNet;
  return Math.abs(snapshot.subtotal - componentTotal) <= tolerance;
}
