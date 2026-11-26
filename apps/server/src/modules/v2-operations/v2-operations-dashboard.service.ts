import { Injectable, NotFoundException } from '@nestjs/common';
import type { CurrentUser } from '@bluecat/shared';
import { PrismaService } from '../../database/prisma.service';
import {
  metric,
  missingMetric,
  reportCoverage,
  reportingWeek,
  roundMetric,
  unavailableMetricCodes,
  type OperationsMetric
} from './operations-dashboard.metrics';

type MonthFacts = {
  netFeeIncome: number | null;
  productSales: number | null;
  rentalIncome: number | null;
  otaIncome: number | null;
  totalIncome: number | null;
  otaCount: number | null;
  sourceDays: number;
  revenueRows: number;
  otaRows: number;
  platformIncome: Record<string, number>;
  platformCount: Record<string, number>;
  packageRanking: Array<{
    name: string;
    platform: string;
    sales: number;
    amount: number;
  }>;
};

@Injectable()
export class V2OperationsDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async monthlyReport(storeId: string, monthValue?: string) {
    const month = /^\d{4}-\d{2}$/.test(monthValue ?? '')
      ? monthValue!
      : new Date()
          .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
          .slice(0, 7);
    const previousMonth = this.shiftMonth(month, -1);
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
    const comparableDays =
      month === today.slice(0, 7) ? Number(today.slice(8, 10)) : undefined;
    const store = await this.prisma.v2Store.findFirst({
      where: { id: storeId, deletedAt: null, status: { not: 'CLOSED' } },
      select: {
        id: true,
        code: true,
        name: true,
        shortName: true,
        machineCount: true
      }
    });
    if (!store) throw new NotFoundException('门店不存在或已关闭');

    const [previous, current] = await Promise.all([
      this.monthFacts(storeId, previousMonth, comparableDays),
      this.monthFacts(storeId, month, comparableDays)
    ]);
    const previousExpectedDays = Math.min(
      comparableDays ?? this.daysInMonth(previousMonth),
      this.daysInMonth(previousMonth)
    );
    const currentExpectedDays = Math.min(
      comparableDays ?? this.daysInMonth(month),
      this.daysInMonth(month)
    );
    const groups: Array<{
      code: string;
      label: string;
      metrics: OperationsMetric[];
    }> = [
      {
        code: 'OPERATING_REVENUE',
        label: '运营数据',
        metrics: [
          metric(
            'NET_FEE_INCOME',
            '网费收入',
            'CURRENCY',
            previous.netFeeIncome,
            current.netFeeIncome,
            'V2RevenueSnapshot.netFeeIncome'
          ),
          metric(
            'PRODUCT_SALES',
            '商品收入',
            'CURRENCY',
            previous.productSales,
            current.productSales,
            'V2RevenueSnapshot.productSales minus exclusions'
          ),
          metric(
            'RENTAL_INCOME',
            '租赁收入',
            'CURRENCY',
            previous.rentalIncome,
            current.rentalIncome,
            'V2RevenueSnapshot.rental'
          ),
          metric(
            'MONTHLY_REVENUE',
            '月收入',
            'CURRENCY',
            previous.totalIncome,
            current.totalIncome,
            'existing Store revenue composition'
          ),
          missingMetric('DRINK_SALES', '饮品', 'CURRENCY'),
          missingMetric('FOOD_SALES', '餐食', 'CURRENCY'),
          missingMetric('PERIPHERAL_SALES', '外设', 'CURRENCY'),
          missingMetric('ADDITIONAL_PRODUCT_SALES', '附加商品', 'CURRENCY'),
          missingMetric('CIGARETTE_SALES', '香烟', 'CURRENCY'),
          missingMetric(
            'NET_FEE_PER_MACHINE_DAY',
            '机台日均网费收入',
            'CURRENCY'
          ),
          missingMetric(
            'PRODUCT_PER_MACHINE_DAY',
            '机台日均商品收入',
            'CURRENCY'
          ),
          missingMetric('REVENUE_PER_MACHINE_DAY', '机台日均总收入', 'CURRENCY')
        ]
      },
      {
        code: 'COMPUTER_USAGE',
        label: '上机数据',
        metrics: [
          missingMetric('SESSION_COUNT', '月上机人次', 'COUNT'),
          missingMetric('SESSION_HOURS', '月上机时长', 'HOURS'),
          missingMetric('NET_FEE_CONSUMPTION', '月网费消耗', 'CURRENCY'),
          missingMetric('DAILY_SESSION_COUNT', '日均上机人次', 'COUNT'),
          missingMetric('HOURS_PER_MACHINE_DAY', '机台日均上机时长', 'HOURS'),
          missingMetric(
            'PRODUCT_REVENUE_PER_SESSION',
            '人次商品收入',
            'CURRENCY'
          ),
          missingMetric('UTILIZATION_RATE', '上机率', 'PERCENT'),
          missingMetric(
            'CONSUMPTION_PER_MACHINE_DAY',
            '机台日均网费消耗',
            'CURRENCY'
          ),
          missingMetric('HOURS_PER_SESSION', '每人次上机时长', 'HOURS'),
          missingMetric('TURNOVER_RATE', '翻台率', 'RATIO')
        ]
      },
      {
        code: 'ONLINE_OTA',
        label: '线上运营数据',
        metrics: [
          metric(
            'OTA_ACTUAL_INCOME',
            '团购实际收入',
            'CURRENCY',
            previous.otaIncome,
            current.otaIncome,
            'V2OtaRedemption after brush and settlement rules'
          ),
          metric(
            'OTA_ORDER_COUNT',
            '团购核销单数',
            'COUNT',
            previous.otaCount,
            current.otaCount,
            'V2OtaRedemption'
          ),
          ...['MEITUAN', 'DOUYIN', 'GAODE'].flatMap((platform) => [
            metric(
              `${platform}_INCOME`,
              `${this.platformLabel(platform)}收入`,
              'CURRENCY',
              previous.otaRows
                ? (previous.platformIncome[platform] ?? 0)
                : null,
              current.otaRows ? (current.platformIncome[platform] ?? 0) : null,
              'V2OtaRedemption'
            ),
            metric(
              `${platform}_COUNT`,
              `${this.platformLabel(platform)}单数`,
              'COUNT',
              previous.otaRows ? (previous.platformCount[platform] ?? 0) : null,
              current.otaRows ? (current.platformCount[platform] ?? 0) : null,
              'V2OtaRedemption'
            )
          ]),
          missingMetric('PACKAGE_TIME_INCOME', '包时收入', 'CURRENCY'),
          missingMetric('NEW_MEMBER_PACKAGE_COUNT', '新会员团购数', 'COUNT'),
          missingMetric(
            'NEW_MEMBER_PACKAGE_INCOME',
            '新会员团购金额',
            'CURRENCY'
          ),
          missingMetric(
            'RETURNING_MEMBER_PACKAGE_COUNT',
            '老会员团购数',
            'COUNT'
          ),
          missingMetric(
            'RETURNING_MEMBER_PACKAGE_INCOME',
            '老会员团购金额',
            'CURRENCY'
          )
        ]
      },
      {
        code: 'MEMBERS',
        label: '会员数据',
        metrics: [
          missingMetric('NEW_MEMBER_COUNT', '新增会员（蓝猫/女神/学生）', 'COUNT'),
          missingMetric('NEW_PRIVILEGE_MEMBER_COUNT', '新增特权会员', 'COUNT'),
          missingMetric('NEW_ONLINE_MEMBER_COUNT', '新增线上会员', 'COUNT'),
          missingMetric('VISITING_MEMBER_COUNT', '本月到店会员数', 'COUNT'),
          missingMetric('DAILY_NEW_MEMBER_COUNT', '日均新增会员', 'COUNT'),
          missingMetric('NEW_MEMBER_RATE', '新会员率', 'PERCENT'),
          missingMetric(
            'ONLINE_NEW_MEMBER_SHARE',
            '线上新增会员占比',
            'PERCENT'
          ),
          missingMetric(
            'SPEND_PER_VISITING_MEMBER',
            '到店会员人均消费',
            'CURRENCY'
          ),
          missingMetric(
            'RECHARGE_CONSUMPTION_RATE',
            '会员充值消耗比',
            'PERCENT'
          )
        ]
      }
    ];

    return {
      store,
      month,
      previousMonth,
      comparison: 'MONTH_OVER_MONTH',
      comparisonBasis: comparableDays ? 'SAME_ELAPSED_DAYS' : 'FULL_PERIOD',
      comparableDays: comparableDays ?? null,
      dataQuality: {
        previous: {
          ...reportCoverage(previous.sourceDays, previousExpectedDays),
          revenueRows: previous.revenueRows,
          otaRows: previous.otaRows
        },
        current: {
          ...reportCoverage(current.sourceDays, currentExpectedDays),
          revenueRows: current.revenueRows,
          otaRows: current.otaRows
        }
      },
      groups,
      packageRanking: current.packageRanking,
      missingMetricCodes: unavailableMetricCodes(groups)
    };
  }

  async weeklyReport(storeId: string, startValue?: string) {
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
    const requested = /^\d{4}-\d{2}-\d{2}$/.test(startValue ?? '')
      ? startValue!
      : today;
    const { start, end: naturalEnd } = reportingWeek(requested);
    const todayDate = new Date(`${today}T00:00:00.000Z`);
    const isCurrentWeek = todayDate >= start && todayDate < naturalEnd;
    const elapsedDays = isCurrentWeek
      ? Math.floor((todayDate.getTime() - start.getTime()) / 86_400_000) + 1
      : 7;
    const end = new Date(start.getTime() + elapsedDays * 86_400_000);
    const previousStart = new Date(start.getTime() - 7 * 86_400_000);
    const previousEnd = new Date(
      previousStart.getTime() + elapsedDays * 86_400_000
    );
    const store = await this.prisma.v2Store.findFirst({
      where: { id: storeId, deletedAt: null, status: { not: 'CLOSED' } },
      select: {
        id: true,
        code: true,
        name: true,
        shortName: true,
        machineCount: true
      }
    });
    if (!store) throw new NotFoundException('门店不存在或已关闭');
    const [previous, current] = await Promise.all([
      this.rangeFacts(storeId, previousStart, previousEnd),
      this.rangeFacts(storeId, start, end)
    ]);
    const groups = this.reportGroups(previous, current, {
      totalCode: 'PERIOD_REVENUE',
      totalLabel: '本周收入'
    });
    const dateText = (value: Date) => value.toISOString().slice(0, 10);
    return {
      store,
      periodType: 'WEEK',
      startDate: dateText(start),
      endDate: dateText(new Date(end.getTime() - 1)),
      previousStartDate: dateText(previousStart),
      previousEndDate: dateText(new Date(previousEnd.getTime() - 1)),
      comparison: 'WEEK_OVER_WEEK',
      comparisonBasis: isCurrentWeek ? 'SAME_ELAPSED_DAYS' : 'FULL_PERIOD',
      comparableDays: elapsedDays,
      groups,
      packageRanking: current.packageRanking,
      missingMetricCodes: unavailableMetricCodes(groups),
      dataQuality: {
        previous: {
          ...reportCoverage(previous.sourceDays, elapsedDays),
          revenueRows: previous.revenueRows,
          otaRows: previous.otaRows
        },
        current: {
          ...reportCoverage(current.sourceDays, elapsedDays),
          revenueRows: current.revenueRows,
          otaRows: current.otaRows
        }
      }
    };
  }

  async comparison(
    user: CurrentUser,
    periodTypeValue?: string,
    periodValue?: string
  ) {
    const periodType = periodTypeValue === 'WEEK' ? 'WEEK' : 'MONTH';
    const stores = await this.prisma.v2Store.findMany({
      where: {
        deletedAt: null,
        status: { not: 'CLOSED' },
        ...(user.roles.includes('super_admin')
          ? {}
          : { id: { in: user.accessibleStoreIds } })
      },
      select: { id: true, code: true, name: true, shortName: true },
      orderBy: { code: 'asc' }
    });
    const reports = await this.mapWithConcurrency(
      stores,
      2,
      async (store) => {
        if (periodType === 'WEEK') {
          const report = await this.weeklyReport(store.id, periodValue);
          return {
            store: report.store,
            groups: report.groups,
            dataQuality: report.dataQuality
          };
        }
        const report = await this.monthlyReport(store.id, periodValue);
        return {
          store: report.store,
          groups: report.groups,
          dataQuality: report.dataQuality
        };
      }
    );
    const metricCodes = [
      'NET_FEE_INCOME',
      'PRODUCT_SALES',
      'RENTAL_INCOME',
      periodType === 'WEEK' ? 'PERIOD_REVENUE' : 'MONTHLY_REVENUE',
      'OTA_ACTUAL_INCOME',
      'OTA_ORDER_COUNT'
    ];
    const rows = reports.map((report) => {
      const metrics = new Map(
        report.groups
          .flatMap((group) => group.metrics)
          .map((item) => [item.code, item])
      );
      const value = (code: string) => metrics.get(code)?.current ?? null;
      const totalCode =
        periodType === 'WEEK' ? 'PERIOD_REVENUE' : 'MONTHLY_REVENUE';
      return {
        store: report.store,
        metrics: Object.fromEntries(
          metricCodes.map((code) => [code, value(code)])
        ),
        revenueChangeRate: metrics.get(totalCode)?.changeRate ?? null,
        dataQuality: report.dataQuality.current
      };
    });
    rows.sort(
      (a, b) =>
        (b.metrics[
          periodType === 'WEEK' ? 'PERIOD_REVENUE' : 'MONTHLY_REVENUE'
        ] ?? -1) -
        (a.metrics[
          periodType === 'WEEK' ? 'PERIOD_REVENUE' : 'MONTHLY_REVENUE'
        ] ?? -1)
    );
    return {
      periodType,
      period: periodValue ?? null,
      storeCount: rows.length,
      rows
    };
  }

  private reportGroups(
    previous: MonthFacts,
    current: MonthFacts,
    period: { totalCode: string; totalLabel: string }
  ): Array<{ code: string; label: string; metrics: OperationsMetric[] }> {
    const core = (
      code: string,
      label: string,
      unit: OperationsMetric['unit'],
      key: keyof Pick<
        MonthFacts,
        | 'netFeeIncome'
        | 'productSales'
        | 'rentalIncome'
        | 'otaIncome'
        | 'totalIncome'
        | 'otaCount'
      >,
      source: string
    ) => metric(code, label, unit, previous[key], current[key], source);
    return [
      {
        code: 'OPERATING_REVENUE',
        label: '运营数据',
        metrics: [
          core(
            'NET_FEE_INCOME',
            '网费收入',
            'CURRENCY',
            'netFeeIncome',
            'V2RevenueSnapshot.netFeeIncome'
          ),
          core(
            'PRODUCT_SALES',
            '商品收入',
            'CURRENCY',
            'productSales',
            'V2RevenueSnapshot.productSales minus exclusions'
          ),
          core(
            'RENTAL_INCOME',
            '租赁收入',
            'CURRENCY',
            'rentalIncome',
            'V2RevenueSnapshot.rental'
          ),
          core(
            period.totalCode,
            period.totalLabel,
            'CURRENCY',
            'totalIncome',
            'existing Store revenue composition'
          ),
          missingMetric('DRINK_SALES', '饮品', 'CURRENCY'),
          missingMetric('FOOD_SALES', '餐食', 'CURRENCY'),
          missingMetric('PERIPHERAL_SALES', '外设', 'CURRENCY'),
          missingMetric('ADDITIONAL_PRODUCT_SALES', '附加商品', 'CURRENCY'),
          missingMetric('CIGARETTE_SALES', '香烟', 'CURRENCY'),
          missingMetric(
            'NET_FEE_PER_MACHINE_DAY',
            '机台日均网费收入',
            'CURRENCY'
          ),
          missingMetric(
            'PRODUCT_PER_MACHINE_DAY',
            '机台日均商品收入',
            'CURRENCY'
          ),
          missingMetric('REVENUE_PER_MACHINE_DAY', '机台日均总收入', 'CURRENCY')
        ]
      },
      {
        code: 'COMPUTER_USAGE',
        label: '上机数据',
        metrics: [
          missingMetric('SESSION_COUNT', '上机人次', 'COUNT'),
          missingMetric('SESSION_HOURS', '上机时长', 'HOURS'),
          missingMetric('NET_FEE_CONSUMPTION', '网费消耗', 'CURRENCY'),
          missingMetric('DAILY_SESSION_COUNT', '日均上机人次', 'COUNT'),
          missingMetric('HOURS_PER_MACHINE_DAY', '机台日均上机时长', 'HOURS'),
          missingMetric(
            'PRODUCT_REVENUE_PER_SESSION',
            '人次商品收入',
            'CURRENCY'
          ),
          missingMetric('UTILIZATION_RATE', '上机率', 'PERCENT'),
          missingMetric(
            'CONSUMPTION_PER_MACHINE_DAY',
            '机台日均网费消耗',
            'CURRENCY'
          ),
          missingMetric('HOURS_PER_SESSION', '每人次上机时长', 'HOURS'),
          missingMetric('TURNOVER_RATE', '翻台率', 'RATIO')
        ]
      },
      {
        code: 'ONLINE_OTA',
        label: '线上运营数据',
        metrics: [
          core(
            'OTA_ACTUAL_INCOME',
            '团购实际收入',
            'CURRENCY',
            'otaIncome',
            'V2OtaRedemption after brush and settlement rules'
          ),
          core(
            'OTA_ORDER_COUNT',
            '团购核销单数',
            'COUNT',
            'otaCount',
            'V2OtaRedemption'
          ),
          ...['MEITUAN', 'DOUYIN', 'GAODE'].flatMap((platform) => [
            metric(
              `${platform}_INCOME`,
              `${this.platformLabel(platform)}收入`,
              'CURRENCY',
              previous.otaRows
                ? (previous.platformIncome[platform] ?? 0)
                : null,
              current.otaRows ? (current.platformIncome[platform] ?? 0) : null,
              'V2OtaRedemption'
            ),
            metric(
              `${platform}_COUNT`,
              `${this.platformLabel(platform)}单数`,
              'COUNT',
              previous.otaRows ? (previous.platformCount[platform] ?? 0) : null,
              current.otaRows ? (current.platformCount[platform] ?? 0) : null,
              'V2OtaRedemption'
            )
          ]),
          missingMetric('PACKAGE_TIME_INCOME', '包时收入', 'CURRENCY'),
          missingMetric('NEW_MEMBER_PACKAGE_COUNT', '新会员团购数', 'COUNT'),
          missingMetric(
            'NEW_MEMBER_PACKAGE_INCOME',
            '新会员团购金额',
            'CURRENCY'
          ),
          missingMetric(
            'RETURNING_MEMBER_PACKAGE_COUNT',
            '老会员团购数',
            'COUNT'
          ),
          missingMetric(
            'RETURNING_MEMBER_PACKAGE_INCOME',
            '老会员团购金额',
            'CURRENCY'
          )
        ]
      },
      {
        code: 'MEMBERS',
        label: '会员数据',
        metrics: [
          missingMetric('NEW_MEMBER_COUNT', '新增会员（蓝猫/女神/学生）', 'COUNT'),
          missingMetric('NEW_PRIVILEGE_MEMBER_COUNT', '新增特权会员', 'COUNT'),
          missingMetric('NEW_ONLINE_MEMBER_COUNT', '新增线上会员', 'COUNT'),
          missingMetric('VISITING_MEMBER_COUNT', '到店会员数', 'COUNT'),
          missingMetric('DAILY_NEW_MEMBER_COUNT', '日均新增会员', 'COUNT'),
          missingMetric('NEW_MEMBER_RATE', '新会员率', 'PERCENT'),
          missingMetric(
            'ONLINE_NEW_MEMBER_SHARE',
            '线上新增会员占比',
            'PERCENT'
          ),
          missingMetric(
            'SPEND_PER_VISITING_MEMBER',
            '到店会员人均消费',
            'CURRENCY'
          ),
          missingMetric(
            'RECHARGE_CONSUMPTION_RATE',
            '会员充值消耗比',
            'PERCENT'
          )
        ]
      }
    ];
  }

  private async monthFacts(
    storeId: string,
    month: string,
    comparableDays?: number
  ): Promise<MonthFacts> {
    const start = this.monthStart(month);
    const naturalEnd = this.monthStart(this.shiftMonth(month, 1));
    const end = comparableDays
      ? new Date(
          Math.min(
            naturalEnd.getTime(),
            start.getTime() + comparableDays * 86_400_000
          )
        )
      : naturalEnd;
    return this.rangeFacts(storeId, start, end);
  }

  private async rangeFacts(
    storeId: string,
    start: Date,
    end: Date
  ): Promise<MonthFacts> {
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
    const [revenues, exclusions, redemptions] = await Promise.all([
      this.prisma.v2RevenueSnapshot.findMany({
        where: { storeId, businessDate: { gte: start, lt: end } },
        select: {
          businessDate: true,
          kind: true,
          netFeeIncome: true,
          productSales: true,
          rental: true
        }
      }),
      this.prisma.v2ProductExclusionSnapshot.findMany({
        where: { storeId, businessDate: { gte: start, lt: end } },
        select: {
          businessDate: true,
          kind: true,
          excludedAmount: true
        }
      }),
      this.prisma.v2OtaRedemption.findMany({
        where: {
          storeId,
          businessDate: { gte: start, lt: end },
          OR: [{ productId: null }, { product: { is: { isBrush: false } } }]
        },
        select: {
          platform: true,
          productName: true,
          amount: true,
          product: {
            select: { isBrush: true, settlementRate: true, feeRate: true }
          }
        }
      })
    ]);
    const exclusionMap = new Map<string, number>();
    for (const item of exclusions) {
      const key = `${item.businessDate.toISOString().slice(0, 10)}:${item.kind}`;
      exclusionMap.set(
        key,
        (exclusionMap.get(key) ?? 0) + Number(item.excludedAmount)
      );
    }
    const selectedRevenue = revenues.filter((item) => {
      const date = item.businessDate.toISOString().slice(0, 10);
      return item.kind === 'SETTLED_DAILY'
        ? date !== today
        : item.kind === 'LIVE_TODAY' && date === today;
    });
    const hasRevenue = selectedRevenue.length > 0;
    const hasOta = redemptions.length > 0;
    const netFeeIncome = selectedRevenue.reduce(
      (sum, item) => sum + Number(item.netFeeIncome ?? 0),
      0
    );
    const productSales = selectedRevenue.reduce((sum, item) => {
      const key = `${item.businessDate.toISOString().slice(0, 10)}:${item.kind}`;
      return (
        sum +
        Math.max(
          0,
          Number(item.productSales ?? 0) - (exclusionMap.get(key) ?? 0)
        )
      );
    }, 0);
    const rentalIncome = selectedRevenue.reduce(
      (sum, item) => sum + Number(item.rental ?? 0),
      0
    );
    const platformIncome: Record<string, number> = {};
    const platformCount: Record<string, number> = {};
    const ranking = new Map<
      string,
      { name: string; platform: string; sales: number; amount: number }
    >();
    let otaIncome = 0;
    for (const item of redemptions) {
      const platform = String(item.platform || 'OTHER').toUpperCase();
      const amount = this.otaActualAmount(item);
      otaIncome += amount;
      platformIncome[platform] = (platformIncome[platform] ?? 0) + amount;
      platformCount[platform] = (platformCount[platform] ?? 0) + 1;
      const key = `${platform}:${item.productName}`;
      const row = ranking.get(key) ?? {
        name: item.productName,
        platform,
        sales: 0,
        amount: 0
      };
      row.sales += 1;
      row.amount += amount;
      ranking.set(key, row);
    }
    return {
      netFeeIncome: hasRevenue ? roundMetric(netFeeIncome) : null,
      productSales: hasRevenue ? roundMetric(productSales) : null,
      rentalIncome: hasRevenue ? roundMetric(rentalIncome) : null,
      otaIncome: hasOta ? roundMetric(otaIncome) : null,
      totalIncome:
        hasRevenue || hasOta
          ? roundMetric(netFeeIncome + productSales + rentalIncome + otaIncome)
          : null,
      otaCount: hasOta ? redemptions.length : null,
      sourceDays: new Set(
        selectedRevenue.map((item) =>
          item.businessDate.toISOString().slice(0, 10)
        )
      ).size,
      revenueRows: selectedRevenue.length,
      otaRows: redemptions.length,
      platformIncome: Object.fromEntries(
        Object.entries(platformIncome).map(([key, value]) => [
          key,
          roundMetric(value)
        ])
      ),
      platformCount,
      packageRanking: [...ranking.values()]
        .map((item) => ({ ...item, amount: roundMetric(item.amount) }))
        .sort(
          (left, right) =>
            right.sales - left.sales || right.amount - left.amount
        )
        .slice(0, 10)
    };
  }

  private otaActualAmount(item: {
    amount: unknown;
    product?: { settlementRate?: unknown; feeRate?: unknown } | null;
  }) {
    const settlementRate = Number(item.product?.settlementRate ?? 1);
    const feeRate = Number(item.product?.feeRate ?? 0);
    return roundMetric(
      Number(item.amount ?? 0) * settlementRate * (1 - feeRate)
    );
  }

  private async mapWithConcurrency<T, R>(
    values: T[],
    concurrency: number,
    task: (value: T) => Promise<R>
  ) {
    const results = new Array<R>(values.length);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await task(values[index]);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(Math.max(1, concurrency), values.length) },
        () => worker()
      )
    );
    return results;
  }

  private monthStart(month: string) {
    return new Date(`${month}-01T00:00:00.000Z`);
  }

  private daysInMonth(month: string) {
    return Math.round(
      (this.monthStart(this.shiftMonth(month, 1)).getTime() -
        this.monthStart(month).getTime()) /
        86_400_000
    );
  }

  private shiftMonth(month: string, delta: number) {
    const [year, number] = month.split('-').map(Number);
    const value = new Date(Date.UTC(year, number - 1 + delta, 1));
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private platformLabel(platform: string) {
    return (
      (
        { MEITUAN: '美团', DOUYIN: '抖音', GAODE: '高德' } as Record<
          string,
          string
        >
      )[platform] ?? platform
    );
  }
}
