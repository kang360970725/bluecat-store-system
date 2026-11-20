import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CurrentUser } from '@bluecat/shared';
import { PrismaService } from '../../database/prisma.service';
import {
  buildUsageStrategies,
  type UsageStrategyAdvice
} from './usage-analytics-strategy';

type TrafficPoint = {
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
};

export type V2UsageAnalytics = {
  contractVersion: '1.0';
  externalStoreId: string;
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
  hourly: TrafficPoint[];
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

type StoreView = {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  dataSource: { sourceSystem: string; externalStoreId: string } | null;
};

@Injectable()
export class V2UsageAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async read(
    storeId: string,
    start: string | undefined,
    end: string | undefined,
    user: CurrentUser
  ) {
    const range = this.range(start, end);
    if (
      !user.roles.includes('super_admin') &&
      !user.accessibleStoreIds.includes(storeId)
    )
      throw new ForbiddenException('无权查看该门店上机分析');
    const store = await this.prisma.v2Store.findFirst({
      where: { id: storeId, deletedAt: null, status: { not: 'CLOSED' } },
      select: {
        id: true,
        code: true,
        name: true,
        shortName: true,
        dataSource: { select: { sourceSystem: true, externalStoreId: true } }
      }
    });
    if (!store) throw new NotFoundException('门店不存在或已闭店');
    const externalStoreId = this.externalStoreId(store);
    const analytics = await this.fetchAnalytics(
      externalStoreId,
      range.start,
      range.end
    );
    return { store: this.storeView(store), ...analytics };
  }

  async ranking(
    start: string | undefined,
    end: string | undefined,
    user: CurrentUser
  ) {
    const range = this.range(start, end);
    const scopedIds = user.roles.includes('super_admin')
      ? undefined
      : user.accessibleStoreIds;
    const stores = await this.prisma.v2Store.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['PREPARING', 'CLOSED'] },
        ...(scopedIds ? { id: { in: scopedIds } } : {}),
        dataSource: { is: { sourceSystem: 'X_MANAGER' } }
      },
      select: {
        id: true,
        code: true,
        name: true,
        shortName: true,
        dataSource: { select: { sourceSystem: true, externalStoreId: true } }
      },
      orderBy: { code: 'asc' }
    });
    const fetched = await this.mapLimit(stores, 2, async (store) => {
      try {
        const analytics = await this.fetchAnalytics(
          this.externalStoreId(store),
          range.start,
          range.end,
          true
        );
        const peak = analytics.hourly.reduce<TrafficPoint | null>(
          (best, item) =>
            !best || item.averageConcurrent > best.averageConcurrent
              ? item
              : best,
          null
        );
        const low = analytics.weekdayHourly
          .filter((item) => item.dayCount > 0)
          .reduce<(typeof analytics.weekdayHourly)[number] | null>(
            (best, item) =>
              !best || item.averageSessionStarts < best.averageSessionStarts
                ? item
                : best,
            null
          );
        const topArea = analytics.areas[0];
        return {
          available: true as const,
          store: this.storeView(store),
          coverageDays: analytics.coverageDays.length,
          expectedDays: analytics.expectedDays,
          machineCount: analytics.capacity.machineCount,
          configuredMachineCount: analytics.capacity.configuredMachineCount,
          observedMachineCount: analytics.capacity.observedMachineCount,
          seatRate: analytics.capacity.seatRate ?? 0,
          sessionStarts: analytics.traffic.sessionStarts,
          uniqueVisitors: analytics.traffic.uniqueVisitors,
          repeatRate: analytics.customerSegments.repeatRate ?? 0,
          averageStayHours: analytics.traffic.averageStayHours,
          peakConcurrent: analytics.traffic.peakConcurrent,
          feePerVisitor: analytics.traffic.feePerVisitor,
          peakHour: peak?.hour ?? null,
          lowWindow: low
            ? `${low.weekdayLabel} ${String(low.hour).padStart(2, '0')}:00`
            : null,
          topAreaShare:
            topArea && analytics.totals.usageHours > 0
              ? this.round(
                  (topArea.usageHours / analytics.totals.usageHours) * 100
                )
              : 0,
          qualityWarnings: analytics.quality.warnings,
          suggestions: [] as UsageStrategyAdvice[]
        };
      } catch (error) {
        return {
          available: false as const,
          store: this.storeView(store),
          error: error instanceof Error ? error.message : '上座数据读取失败'
        };
      }
    });
    const available = fetched.filter(
      (item): item is Extract<(typeof fetched)[number], { available: true }> =>
        item.available
    );
    const benchmarks = {
      seatRate: this.median(available.map((item) => item.seatRate)),
      repeatRate: this.median(available.map((item) => item.repeatRate)),
      averageStayHours: this.median(
        available.map((item) => item.averageStayHours)
      ),
      feePerVisitor: this.median(available.map((item) => item.feePerVisitor))
    };
    available.sort((left, right) => right.seatRate - left.seatRate);
    const bottomStart = Math.max(
      0,
      available.length - Math.max(3, Math.ceil(available.length * 0.2))
    );
    available.forEach((item, index) => {
      Object.assign(item, {
        rank: index + 1,
        bottomStore: index >= bottomStart,
        suggestions: buildUsageStrategies(
          item,
          benchmarks,
          index >= bottomStart
        )
      });
    });
    return {
      start: range.start,
      end: range.end,
      storeCount: fetched.length,
      availableStoreCount: available.length,
      benchmarks,
      items: [...available, ...fetched.filter((item) => !item.available)]
    };
  }

  private range(start: string | undefined, end: string | undefined) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start ?? '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end ?? '')
    )
      throw new BadRequestException('请选择有效的开始和结束日期');
    const startAt = Date.parse(`${start}T00:00:00Z`);
    const endAt = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt > endAt)
      throw new BadRequestException('结束日期不能早于开始日期');
    if ((endAt - startAt) / 86_400_000 > 62)
      throw new BadRequestException('单次查询最多支持 63 天');
    return { start: start!, end: end! };
  }

  private externalStoreId(store: StoreView) {
    if (
      store.dataSource?.sourceSystem !== 'X_MANAGER' ||
      !store.dataSource.externalStoreId
    )
      throw new BadRequestException('门店尚未关联 X 管家数据源');
    return store.dataSource.externalStoreId;
  }

  private storeView(store: StoreView) {
    return {
      id: store.id,
      code: store.code,
      name: store.name,
      shortName: store.shortName
    };
  }

  private async fetchAnalytics(
    externalStoreId: string,
    start: string,
    end: string,
    summaryOnly = false
  ) {
    const base = this.config
      .get<string>('app.bluecatBridgeBaseUrl')
      ?.replace(/\/bridge\/bluecat\/?$/, '');
    const token = this.config.get<string>('app.bluecatBridgeReadToken');
    if (!base || !token) throw new BadRequestException('未配置上机数据桥接');
    const query = new URLSearchParams({
      externalStoreId,
      start,
      end,
      ...(summaryOnly ? { summaryOnly: 'true' } : {})
    });
    const response = await fetch(
      `${base}/bridge/bluecat/v1/operations/usage-analytics?${query}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok)
      throw new BadRequestException(
        `上机数据读取失败：HTTP ${response.status}`
      );
    const analytics = (await response.json()) as V2UsageAnalytics;
    if (analytics.contractVersion !== '1.0')
      throw new BadRequestException('上机数据契约版本不兼容');
    return analytics;
  }

  private median(values: number[]) {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : this.round((sorted[middle - 1] + sorted[middle]) / 2);
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async mapLimit<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T) => Promise<R>
  ) {
    const results = new Array<R>(items.length);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (cursor < items.length) {
          const index = cursor++;
          results[index] = await mapper(items[index]);
        }
      }
    );
    await Promise.all(workers);
    return results;
  }
}
