import assert from 'node:assert/strict';
import { normalizeLiveRevenue, normalizeSettledRevenue, revenueComponentsMatch } from './domain/x-manager-revenue-contract';

const settled = normalizeSettledRevenue({
  data_start_time: '2026-08-31 00:00:00', data_end_time: '2026-08-31 23:59:59',
  snbid: 'aqxh-4624', snbid_name: '成都恒伟琳网络科技有限公司（蓝猫）',
  surplus: 2985.82, fee_income: 1865, goods_income: 1120.82
});
assert.deepEqual({ kind: settled.kind, date: settled.businessDate, total: settled.subtotal },
  { kind: 'SETTLED_DAILY', date: '2026-08-31', total: 2985.82 });
assert.equal(revenueComponentsMatch(settled), true);

const live = normalizeLiveRevenue({
  data_start_time: '2026-09-01 00:00:00', data_end_time: '2026-09-01 23:59:59',
  snbid: 'aqxh-4624', snbid_name: '成都恒伟琳网络科技有限公司（蓝猫）',
  total_income: 3808.8, fee_income: 2863, goods_income: 945.8, cash_income: 26,
  paymentIncomeList: [{ payAccount: '凡商通道', money: 3782.8 }]
});
assert.deepEqual({ kind: live.kind, date: live.businessDate, total: live.subtotal, cash: live.cashAmount, online: live.onlineAmount },
  { kind: 'LIVE_TODAY', date: '2026-09-01', total: 3808.8, cash: 26, online: 3782.8 });
assert.equal(revenueComponentsMatch(live), true);

console.log('X Manager revenue contract regression passed');
