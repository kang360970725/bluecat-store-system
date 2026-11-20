export type OperationsMetric = {
  code: string;
  label: string;
  unit: 'CURRENCY' | 'COUNT' | 'HOURS' | 'PERCENT' | 'RATIO';
  previous: number | null;
  current: number | null;
  changeRate: number | null;
  available: boolean;
  source: string | null;
};

export function metric(
  code: string,
  label: string,
  unit: OperationsMetric['unit'],
  previous: number | null,
  current: number | null,
  source: string | null
): OperationsMetric {
  const available = previous !== null || current !== null;
  return {
    code,
    label,
    unit,
    previous,
    current,
    changeRate: changeRate(previous, current),
    available,
    source
  };
}

export function missingMetric(
  code: string,
  label: string,
  unit: OperationsMetric['unit']
): OperationsMetric {
  return metric(code, label, unit, null, null, null);
}

export function changeRate(previous: number | null, current: number | null) {
  if (previous === null || current === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

export function roundMetric(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type ReportProductBuckets = {
  drinks: number;
  food: number;
  cigarettes: number;
  additional: number;
};

const PRODUCT_CATEGORY_RULES = {
  cigarettes: ['香烟', '烟草'],
  drinks: [
    '水吧',
    '饮品',
    '咖啡',
    '奶茶',
    '果汁',
    '果茶',
    '拿铁',
    '美式',
    '续杯',
    '乌龙',
    '沙冰',
    '畅饮',
    '巨量装'
  ],
  food: [
    '副食',
    '方便面',
    '本吧套餐',
    '餐食',
    '主食',
    '简餐',
    '食堂',
    '小食',
    '小吃',
    '零食',
    '炸物',
    '甜品'
  ]
} as const;

/**
 * 报表按采集期内每条商品销售记录携带的展示分类归类。
 * 规则同时兼容已停用的历史分类名称，未命中的分类完整计入“附加商品”，
 * 从而避免分类整理后历史销售额消失或依赖人工导出补数。
 */
export function classifyReportProductCategories(
  categories: Record<string, number>
): ReportProductBuckets {
  const buckets: ReportProductBuckets = {
    drinks: 0,
    food: 0,
    cigarettes: 0,
    additional: 0
  };
  for (const [rawName, rawAmount] of Object.entries(categories ?? {})) {
    const name = rawName.trim();
    const parsedAmount = Number(rawAmount);
    const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
    if (PRODUCT_CATEGORY_RULES.cigarettes.some((word) => name.includes(word))) {
      buckets.cigarettes += amount;
    } else if (
      PRODUCT_CATEGORY_RULES.drinks.some((word) => name.includes(word))
    ) {
      buckets.drinks += amount;
    } else if (
      PRODUCT_CATEGORY_RULES.food.some((word) => name.includes(word))
    ) {
      buckets.food += amount;
    } else {
      buckets.additional += amount;
    }
  }
  return Object.fromEntries(
    Object.entries(buckets).map(([key, value]) => [key, roundMetric(value)])
  ) as ReportProductBuckets;
}

export function reportNewMemberCount(members: {
  blueCat?: number;
  privilege?: number;
}) {
  const blueCat = Number(members.blueCat ?? 0);
  const privilege = Number(members.privilege ?? 0);
  return (
    (Number.isFinite(blueCat) ? blueCat : 0) +
    (Number.isFinite(privilege) ? privilege : 0)
  );
}

export type ReportIncomeCompositionRow = {
  code: string;
  label: string;
  amount: number | null;
  percentage: number | null;
};

export function reportIncomeComposition(input: {
  subtotal: number;
  cash: number;
  otaTotal: number;
  otaChannels: Record<string, number>;
  incomeAvailable: boolean;
  otaAvailable: boolean;
}): ReportIncomeCompositionRow[] {
  const subtotal = Number(input.subtotal ?? 0);
  const cash = Number(input.cash ?? 0);
  const otaTotal = Number(input.otaTotal ?? 0);
  const channel = (code: string) => Number(input.otaChannels[code] ?? 0);
  const selectedOtaTotal =
    channel('MEITUAN') + channel('DOUYIN') + channel('AMAP');
  const otherOta = Math.max(0, otaTotal - selectedOtaTotal);
  const denominator = subtotal + otaTotal;
  const percentageAvailable =
    input.incomeAvailable && input.otaAvailable && denominator > 0;
  const rows: Array<{
    code: string;
    label: string;
    amount: number;
    available: boolean;
  }> = [
    {
      code: 'X_INCOME',
      label: 'X收入',
      amount: Math.max(0, subtotal - cash),
      available: input.incomeAvailable
    },
    {
      code: 'MEITUAN',
      label: '美团',
      amount: channel('MEITUAN'),
      available: input.otaAvailable
    },
    {
      code: 'DOUYIN',
      label: '抖音',
      amount: channel('DOUYIN'),
      available: input.otaAvailable
    },
    {
      code: 'AMAP',
      label: '高德',
      amount: channel('AMAP'),
      available: input.otaAvailable
    },
    {
      code: 'CASH',
      label: '现金',
      amount: cash,
      available: input.incomeAvailable
    }
  ];
  if (otherOta > 0) {
    rows.splice(4, 0, {
      code: 'OTHER_OTA',
      label: '其他团购',
      amount: otherOta,
      available: input.otaAvailable
    });
  }
  return rows.map((row) => ({
    code: row.code,
    label: row.label,
    amount: row.available ? roundMetric(row.amount) : null,
    percentage:
      row.available && percentageAvailable ? row.amount / denominator : null
  }));
}

export function reportingWeek(dateValue: string) {
  const anchor = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(anchor.getTime())) throw new Error('invalid_report_date');
  const weekday = (anchor.getUTCDay() + 6) % 7;
  const start = new Date(anchor.getTime() - weekday * 86_400_000);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  return { start, end };
}

export function projectMonthlyRevenue(input: {
  month: string;
  currentMonth: string;
  todayDay: number;
  daysInMonth: number;
  actualRevenue: number;
  completedRevenue: number;
}) {
  if (input.month < input.currentMonth)
    return {
      elapsedDays: input.daysInMonth,
      forecastRevenue: roundMetric(input.actualRevenue)
    };
  if (input.month > input.currentMonth)
    return { elapsedDays: 0, forecastRevenue: 0 };
  const elapsedDays = Math.max(
    0,
    Math.min(input.daysInMonth, input.todayDay - 1)
  );
  return {
    elapsedDays,
    forecastRevenue: elapsedDays
      ? roundMetric((input.completedRevenue / elapsedDays) * input.daysInMonth)
      : 0
  };
}

export function reportCoverage(sourceDays: number, expectedDays: number) {
  const normalizedExpected = Math.max(0, Math.floor(expectedDays));
  return {
    sourceDays,
    expectedDays: normalizedExpected,
    complete: normalizedExpected > 0 && sourceDays >= normalizedExpected
  };
}

export function unavailableMetricCodes(
  groups: Array<{ metrics: OperationsMetric[] }>
) {
  return groups.flatMap((group) =>
    group.metrics.filter((item) => !item.available).map((item) => item.code)
  );
}
