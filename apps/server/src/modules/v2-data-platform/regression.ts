import assert from 'node:assert/strict';
import { reconcileGoldenStore9 } from './domain/reconciliation-engine';
import { store9GoldenRecords } from './fixtures/store-9.golden';
import {
  changeRate,
  classifyReportProductCategories,
  metric,
  missingMetric,
  projectMonthlyRevenue,
  reportCoverage,
  reportIncomeComposition,
  reportNewMemberCount,
  reportingWeek,
  roundMetric,
  unavailableMetricCodes
} from '../v2-operations/operations-dashboard.metrics';
import { businessSourceHash } from '../v2-operations/source-fingerprint';
import { buildUsageStrategies } from '../v2-operations/usage-analytics-strategy';

const first = reconcileGoldenStore9(store9GoldenRecords);
const replay = reconcileGoldenStore9([...store9GoldenRecords].reverse());

assert.equal(first.includedAmount, 116034.12);
assert.equal(first.differenceAmount, -52.88);
assert.equal(
  first.events.filter((event) => event.decision === 'INCLUDED').length,
  3
);
assert.equal(
  first.events.filter(
    (event) => event.ruleCode === 'DEDUP_SOURCE_BUSINESS_KEY_V1'
  ).length,
  1
);
assert.equal(
  first.events.filter(
    (event) => event.ruleCode === 'OTA_STORED_VALUE_OVERLAP_V1'
  ).length,
  1
);
assert.equal(
  first.resultHash,
  replay.resultHash,
  '相同数据重放必须产生相同结果'
);
assert.ok(
  first.events.every(
    (event) => event.rawRecordHash && event.ruleCode && event.reason
  )
);
assert.equal(changeRate(100, 125), 0.25);
assert.equal(changeRate(0, 0), 0, '上期与本期均为零时环比为零');
assert.equal(changeRate(0, 125), null, '上期为零、本期非零时不得产生无穷值');
assert.equal(changeRate(null, 125), null, '缺失值不得伪造环比');
assert.deepEqual(
  projectMonthlyRevenue({
    month: '2026-11',
    currentMonth: '2026-11',
    todayDay: 9,
    daysInMonth: 30,
    actualRevenue: 95,
    completedRevenue: 80
  }),
  { elapsedDays: 8, forecastRevenue: 300 },
  '当前月预测必须只使用昨天及以前的完整日期，不能把今天当作完整经营日'
);
assert.deepEqual(
  projectMonthlyRevenue({
    month: '2026-10',
    currentMonth: '2026-11',
    todayDay: 9,
    daysInMonth: 31,
    actualRevenue: 310,
    completedRevenue: 310
  }),
  { elapsedDays: 31, forecastRevenue: 310 },
  '历史月份必须直接使用完整月实际收入'
);
assert.deepEqual(
  projectMonthlyRevenue({
    month: '2026-11',
    currentMonth: '2026-11',
    todayDay: 1,
    daysInMonth: 30,
    actualRevenue: 12,
    completedRevenue: 0
  }),
  { elapsedDays: 0, forecastRevenue: 0 },
  '每月第一天没有完整经营日，不得用当天实时收入生成月度预测'
);
assert.equal(
  roundMetric(
    [10.005, 20.005].reduce((sum, amount) => sum + roundMetric(amount), 0)
  ),
  30.02,
  '预计利润必须先按分取整每项成本，再汇总成本'
);
assert.deepEqual(
  Object.values(reportingWeek('2026-10-13')).map((item) =>
    item.toISOString().slice(0, 10)
  ),
  ['2026-10-12', '2026-10-19'],
  '周报必须按周一至周日归属'
);
assert.deepEqual(
  Object.values(reportingWeek('2026-10-18')).map((item) =>
    item.toISOString().slice(0, 10)
  ),
  ['2026-10-12', '2026-10-19'],
  '周日仍必须归入当周周一开始的周期'
);
assert.deepEqual(reportCoverage(3, 4), {
  sourceDays: 3,
  expectedDays: 4,
  complete: false
});
assert.deepEqual(reportCoverage(4, 4), {
  sourceDays: 4,
  expectedDays: 4,
  complete: true
});
assert.deepEqual(
  unavailableMetricCodes([
    {
      metrics: [
        metric('READY', '已采集', 'COUNT', 1, 2, 'test'),
        missingMetric('PENDING', '待采集', 'COUNT')
      ]
    }
  ]),
  ['PENDING'],
  '周报和月报必须显式返回待采集指标'
);
const historicalProductBuckets = classifyReportProductCategories({
  '果茶/鲜奶茶': 120,
  无限续杯类: 80,
  果香美式: 60,
  简餐食堂: 90,
  饱腹主食: 70,
  '炸物/小吃': 50,
  香烟跑腿代购: 40,
  跑腿代购: 30,
  蓝猫严选: 20
});
assert.deepEqual(historicalProductBuckets, {
  drinks: 260,
  food: 210,
  cigarettes: 40,
  additional: 50
});
assert.equal(
  Object.values(historicalProductBuckets).reduce(
    (total, amount) => total + amount,
    0
  ),
  560,
  '历史展示分类和未识别分类的销售额都必须完整保留'
);
assert.equal(
  reportNewMemberCount({ blueCat: 18, privilege: 7 }),
  25,
  '新增会员必须包含蓝猫会员、女神卡和学生卡'
);
assert.equal(
  businessSourceHash({ orderId: 'A-1', amount: 50, __captured_at: 'first' }),
  businessSourceHash({ amount: 50, orderId: 'A-1', __captured_at: 'second' }),
  '采集时间和字段顺序变化不得触发业务记录重写'
);
assert.notEqual(
  businessSourceHash({ orderId: 'A-1', amount: 50 }),
  businessSourceHash({ orderId: 'A-1', amount: 60 }),
  '真实业务字段变化必须产生新指纹'
);
const incomeComposition = reportIncomeComposition({
  subtotal: 78289.51,
  cash: 4869.24,
  otaTotal: 45588.2,
  otaChannels: { MEITUAN: 44464.6, DOUYIN: 1123.6, AMAP: 0 },
  incomeAvailable: true,
  otaAvailable: true
});
assert.equal(
  incomeComposition.find((row) => row.code === 'X_INCOME')?.amount,
  73420.27
);
assert.ok(
  Math.abs(
    incomeComposition.reduce(
      (total, row) => total + Number(row.percentage ?? 0),
      0
    ) - 1
  ) < 0.000001,
  '收入渠道必须以总收入为分母并完整合计到 100%'
);
const bottomStoreStrategies = buildUsageStrategies(
  {
    seatRate: 20,
    repeatRate: 18,
    averageStayHours: 2.5,
    feePerVisitor: 30,
    peakHour: 21,
    lowWindow: '周二 08:00',
    topAreaShare: 42
  },
  {
    seatRate: 40,
    repeatRate: 35,
    averageStayHours: 5,
    feePerVisitor: 50
  },
  true
);
assert.deepEqual(
  bottomStoreStrategies.map((item) => item.code),
  ['OFF_PEAK_ACQUISITION', 'RETURN_VISIT', 'EXTEND_STAY'],
  '末位门店建议必须优先覆盖低谷引流、复访和停留，并保持最多三项'
);
assert.equal(
  buildUsageStrategies(
    {
      seatRate: 45,
      repeatRate: 40,
      averageStayHours: 5.5,
      feePerVisitor: 60,
      peakHour: 21,
      lowWindow: '周一 08:00',
      topAreaShare: 25
    },
    {
      seatRate: 40,
      repeatRate: 35,
      averageStayHours: 5,
      feePerVisitor: 50
    },
    false
  )[0]?.code,
  'PEAK_CONVERSION',
  '指标健康的门店应转向高峰客流转化建议'
);

console.log(
  JSON.stringify(
    {
      store: first.externalStoreId,
      includedAmount: first.includedAmount,
      excludedAmount: first.excludedAmount,
      authoritativeAmount: first.authoritativeAmount,
      differenceAmount: first.differenceAmount,
      eventCount: first.events.length,
      resultHash: first.resultHash,
      idempotent: true
    },
    null,
    2
  )
);
