import assert from 'node:assert/strict';
import { normalizeShiftRevenue, shiftComponentsMatch } from './domain/x-manager-shift-contract';

const night = normalizeShiftRevenue({
  shiftId: '{e1b8362f-ecd5-45aa-95e0-affa70be302f}', snbid: 'aqxh-4624',
  branchName: '成都恒伟琳网络科技有限公司（蓝猫）', shiftTime: '2026-09-01 09:00:20',
  shiftStartTime: '2026-08-31 21:00:11', shiftEndTime: '2026-09-01 09:00:20',
  operator: '晚班', barEnd: '100', currentIncome: 2159.30, barFeeIncome: 1470.50,
  goodsSaleIncome: 688.80
});

assert.equal(night.businessDate, '2026-08-31');
assert.equal(night.totalIncome, 2159.30);
assert.equal(shiftComponentsMatch(night), true);
assert.equal(night.operatorLabel, '晚班');

const white = normalizeShiftRevenue({
  shiftId: '{22056dc3-8b13-40d2-831f-7344019bdcee}', snbid: 'aqxh-4624',
  branchName: '成都恒伟琳网络科技有限公司（蓝猫）', shiftTime: '2026-08-31 21:00:11',
  shiftStartTime: '2026-08-31 09:00:19', shiftEndTime: '2026-08-31 21:00:11',
  operator: '白班', barEnd: '100', currentIncome: 1693.22, barFeeIncome: 1174.50,
  goodsSaleIncome: 518.72
});

assert.equal(white.businessDate, '2026-08-31');
assert.equal(shiftComponentsMatch(white), true);
assert.ok(Math.abs(night.totalIncome + white.totalIncome - 3852.52) <= 0.001);

console.log('X Manager shift contract regression passed');
