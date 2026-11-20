import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CurrentUser } from '@bluecat/shared';
import { PrismaService } from '../../database/prisma.service';
import {
  classifyReportProductCategories,
  metric,
  reportIncomeComposition,
  reportNewMemberCount,
  roundMetric,
  type OperationsMetric
} from './operations-dashboard.metrics';
import { V2OperationsService } from './v2-operations.service';

type ReportType = 'WEEK' | 'MONTH';
type PackageFact = {
  amount: number;
  count: number;
  channels: Record<string, number>;
};
type ReportSource = {
  contractVersion: string;
  externalStoreId: string;
  start: string;
  end: string;
  expectedDays: number;
  coverage: Record<string, string[]>;
  income: {
    subtotal: number;
    netFee: number;
    goods: number;
    rental: number;
    cash: number;
    online: number;
  };
  productCategories: Record<string, number>;
  usage: {
    sessions: number;
    hours: number;
    feeConsumption: number;
    visitingMembers: number;
  };
  members: {
    blueCat: number;
    advanced: number;
    privilege: number;
    onlineNew: number;
  };
  ota: {
    total: number;
    onlineNewMembers: number;
    packages: { NET_FEE: PackageFact; PACKAGE_TIME: PackageFact };
  };
  machine: { count: number; machineDays: number };
  warnings: string[];
};

type Period = {
  type: ReportType;
  key: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
};

type CalculatedFacts = {
  availability: {
    income: boolean;
    products: boolean;
    usage: boolean;
    members: boolean;
    ota: boolean;
  };
  operatingDays: number;
  machineCount: number;
  machineDays: number;
  netFee: number;
  drinks: number;
  food: number;
  rental: number;
  additional: number;
  cigarettes: number;
  productIncome: number;
  mainIncome: number;
  totalIncome: number;
  sessions: number;
  hours: number;
  feeConsumption: number;
  visitingMembers: number;
  newMemberCount: number;
  newPrivilege: number;
  onlineNew: number;
  otaTotal: number;
  netFeePackage: PackageFact;
  packageTime: PackageFact;
};

@Injectable()
export class V2OperationsReportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(V2OperationsReportService.name);
  private timer?: NodeJS.Timeout;
  private schedulerRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly operations: V2OperationsService
  ) {}

  onModuleInit() {
    if (!this.config.get<boolean>('app.backgroundJobsEnabled')) return;
    this.timer = setInterval(() => void this.runScheduler(), 30_000);
    this.timer.unref();
    setTimeout(() => void this.runScheduler(), 15_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  monthly(storeId: string, month: string | undefined, user: CurrentUser) {
    return this.read(storeId, this.monthPeriod(month), user);
  }

  weekly(storeId: string, start: string | undefined, user: CurrentUser) {
    return this.read(storeId, this.weekPeriod(start), user);
  }

  async generate(
    storeId: string,
    typeValue: string,
    periodValue: string | undefined,
    resync: boolean,
    user: CurrentUser
  ) {
    if (!user.roles.includes('super_admin'))
      throw new BadRequestException('仅超级管理员可以生成报表');
    const type: ReportType = typeValue === 'WEEK' ? 'WEEK' : 'MONTH';
    const period = type === 'WEEK' ? this.weekPeriod(periodValue) : this.monthPeriod(periodValue);
    return this.generateWithRetry(storeId, period, resync, user.id);
  }

  private async read(storeId: string, period: Period, user: CurrentUser) {
    if (
      !user.roles.includes('super_admin') &&
      !user.accessibleStoreIds.includes(storeId)
    )
      throw new ForbiddenException('无权查看该门店报表');
    const store = await this.store(storeId);
    const report = await this.prisma.v2OperationsReport.findUnique({
      where: {
        storeId_reportType_periodKey: {
          storeId,
          reportType: period.type,
          periodKey: period.key
        }
      }
    });
    if (!report || report.status === 'FAILED') {
      return {
        generated: false,
        store: this.storeView(store),
        periodType: period.type,
        periodKey: period.key,
        startDate: period.start,
        endDate: period.end,
        error:
          report?.status === 'FAILED'
            ? user.roles.includes('super_admin')
              ? `报表生成失败：${report.errorReason || '未知错误'}`
              : '报表生成失败，请联系超级管理员重新生成'
            : null
      };
    }
    return { generated: true, ...(report.payload as Record<string, unknown>) };
  }

  private async generateWithRetry(
    storeId: string,
    period: Period,
    resync: boolean,
    generatedBy: string | null
  ) {
    this.assertCompleted(period);
    let error: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.generateOnce(storeId, period, resync, generatedBy, attempt);
      } catch (caught) {
        error = caught;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 30_000));
      }
    }
    const reason = this.reason(error);
    await this.prisma.v2OperationsReport.upsert({
      where: {
        storeId_reportType_periodKey: {
          storeId,
          reportType: period.type,
          periodKey: period.key
        }
      },
      create: {
        storeId,
        reportType: period.type,
        periodKey: period.key,
        periodStart: this.date(period.start),
        periodEnd: this.date(period.end),
        status: 'FAILED',
        payload: {},
        errorReason: reason,
        attemptCount: 3,
        generatedBy,
        resynced: resync
      },
      update: {
        status: 'FAILED',
        errorReason: reason,
        attemptCount: 3,
        generatedAt: new Date(),
        generatedBy,
        resynced: resync
      }
    });
    throw new BadRequestException(`报表生成失败：${reason}`);
  }

  private async generateOnce(
    storeId: string,
    period: Period,
    resync: boolean,
    generatedBy: string | null,
    attempt: number
  ) {
    const store = await this.store(storeId);
    if (!store.dataSource?.externalStoreId)
      throw new BadRequestException('门店尚未绑定 X 系统账号');
    if (resync)
      await this.resyncPeriod(store.dataSource.externalStoreId, period.start, period.end);
    let [previousSource, currentSource] = await Promise.all([
      this.source(store.dataSource.externalStoreId, period.previousStart, period.previousEnd),
      this.source(store.dataSource.externalStoreId, period.start, period.end)
    ]);
    if (!generatedBy && !resync && this.hasIncompleteCoverage(currentSource)) {
      await this.resyncMissing(store.dataSource.externalStoreId, period.start, period.end, currentSource);
      currentSource = await this.source(store.dataSource.externalStoreId, period.start, period.end);
    }
    const previous = this.calculate(
      previousSource,
      store.openedOn,
      store.closedOn,
      store.machineCount
    );
    const current = this.calculate(
      currentSource,
      store.openedOn,
      store.closedOn,
      store.machineCount
    );
    const groups = this.groups(period.type, previous, current);
    const generatedAt = new Date();
    const status = currentSource.warnings.some((item) => item.includes('coverage_incomplete'))
      ? 'PARTIAL'
      : 'COMPLETE';
    const payload = {
      store: this.storeView(store),
      generated: true,
      periodType: period.type,
      periodKey: period.key,
      startDate: period.start,
      endDate: period.end,
      previousStartDate: period.previousStart,
      previousEndDate: period.previousEnd,
      comparison: period.type === 'WEEK' ? 'WEEK_OVER_WEEK' : 'MONTH_OVER_MONTH',
      groups,
      groupPurchase: this.groupPurchaseRows(previous, current),
      incomeComposition: this.incomeComposition(currentSource, current),
      generatedAt: generatedAt.toISOString(),
      machineCount: current.machineCount
    };
    const sourceSummary = {
      current: { coverage: currentSource.coverage, warnings: currentSource.warnings },
      previous: { coverage: previousSource.coverage, warnings: previousSource.warnings }
    };
    const report = await this.prisma.v2OperationsReport.upsert({
      where: {
        storeId_reportType_periodKey: {
          storeId,
          reportType: period.type,
          periodKey: period.key
        }
      },
      create: {
        storeId,
        reportType: period.type,
        periodKey: period.key,
        periodStart: this.date(period.start),
        periodEnd: this.date(period.end),
        status,
        payload: JSON.parse(JSON.stringify(payload)),
        sourceSummary: JSON.parse(JSON.stringify(sourceSummary)),
        attemptCount: attempt,
        generatedAt,
        generatedBy,
        resynced: resync
      },
      update: {
        status,
        payload: JSON.parse(JSON.stringify(payload)),
        sourceSummary: JSON.parse(JSON.stringify(sourceSummary)),
        errorReason: null,
        attemptCount: attempt,
        generatedAt,
        generatedBy,
        resynced: resync
      }
    });
    return { generated: true, ...(report.payload as Record<string, unknown>) };
  }

  private calculate(
    source: ReportSource,
    openedOn: Date | null,
    closedOn: Date | null,
    fallbackMachineCount: number
  ): CalculatedFacts {
    const operatingDays = this.operatingDays(source.start, source.end, openedOn, closedOn);
    const { drinks, food, cigarettes, additional } =
      classifyReportProductCategories(source.productCategories ?? {});
    const rental = Number(source.income.rental ?? 0);
    const productIncome = drinks + food + rental;
    const otaTotal = Number(source.ota.total ?? 0);
    const netFee = Number(source.income.netFee ?? 0) + otaTotal;
    const machineCount = Math.max(
      0,
      Number(source.machine.count || fallbackMachineCount || 0)
    );
    return {
      availability: {
        income: (source.coverage.income?.length ?? 0) > 0,
        products: (source.coverage.products?.length ?? 0) > 0,
        usage: (source.coverage.surf?.length ?? 0) > 0,
        members: (source.coverage.members?.length ?? 0) > 0,
        ota: (source.coverage.ota?.length ?? 0) > 0
      },
      operatingDays,
      machineCount,
      machineDays: machineCount * operatingDays,
      netFee,
      drinks,
      food,
      rental,
      additional,
      cigarettes,
      productIncome,
      mainIncome: netFee + productIncome,
      totalIncome: Number(source.income.subtotal ?? 0) + otaTotal,
      sessions: Number(source.usage.sessions ?? 0),
      hours: Number(source.usage.hours ?? 0),
      feeConsumption: Number(source.usage.feeConsumption ?? 0),
      visitingMembers: Number(source.usage.visitingMembers ?? 0),
      newMemberCount: reportNewMemberCount(source.members),
      newPrivilege: Number(source.members.privilege ?? 0),
      onlineNew: Number(source.members.onlineNew ?? 0),
      otaTotal,
      netFeePackage: source.ota.packages.NET_FEE,
      packageTime: source.ota.packages.PACKAGE_TIME
    };
  }

  private groups(type: ReportType, previous: CalculatedFacts, current: CalculatedFacts) {
    const m = (
      code: string,
      label: string,
      unit: OperationsMetric['unit'],
      getter: (facts: CalculatedFacts) => number | null
    ) => metric(code, label, unit, getter(previous), getter(current), 'X_MANAGER_REPORT_SOURCE_V1');
    const divide = (a: number, b: number) => (b > 0 ? roundMetric(a / b) : null);
    const available = (
      facts: CalculatedFacts,
      keys: Array<keyof CalculatedFacts['availability']>
    ) => keys.some((key) => facts.availability[key]);
    const value = (
      facts: CalculatedFacts,
      keys: Array<keyof CalculatedFacts['availability']>,
      getter: (item: CalculatedFacts) => number | null
    ) => (available(facts, keys) ? getter(facts) : null);
    const required = (
      facts: CalculatedFacts,
      keys: Array<keyof CalculatedFacts['availability']>,
      getter: (item: CalculatedFacts) => number | null
    ) => (keys.every((key) => facts.availability[key]) ? getter(facts) : null);
    const operating = [
      m('NET_FEE_INCOME', '网费', 'CURRENCY', (f) => value(f, ['income', 'ota'], (x) => x.netFee)),
      m('DRINK_SALES', '饮品', 'CURRENCY', (f) => value(f, ['products'], (x) => x.drinks)),
      m('FOOD_SALES', '餐食', 'CURRENCY', (f) => value(f, ['products'], (x) => x.food)),
      m('RENTAL_INCOME', '设备租赁', 'CURRENCY', (f) => value(f, ['income'], (x) => x.rental)),
      m('ADDITIONAL_PRODUCT_SALES', '附加商品', 'CURRENCY', (f) => value(f, ['products'], (x) => x.additional)),
      ...(type === 'MONTH' ? [m('CIGARETTE_SALES', '香烟', 'CURRENCY', (f) => value(f, ['products'], (x) => x.cigarettes))] : []),
      m('MAIN_REVENUE', '主营业务收入', 'CURRENCY', (f) => value(f, ['income', 'products', 'ota'], (x) => x.mainIncome)),
      ...(type === 'MONTH' ? [m('TOTAL_REVENUE', '月收入', 'CURRENCY', (f) => value(f, ['income', 'ota'], (x) => x.totalIncome))] : []),
      m('NET_FEE_PER_MACHINE_DAY', '单日单台网费收入', 'CURRENCY', (f) => value(f, ['income', 'ota'], (x) => divide(x.netFee, x.machineDays))),
      m('PRODUCT_PER_MACHINE_DAY', '单日单台商品收入', 'CURRENCY', (f) => value(f, ['income', 'products'], (x) => divide(x.productIncome, x.machineDays))),
      m('REVENUE_PER_MACHINE_DAY', '单日单台主营业务收入', 'CURRENCY', (f) => value(f, ['income', 'products', 'ota'], (x) => divide(x.mainIncome, x.machineDays)))
    ];
    const usage = [
      m('SESSION_COUNT', type === 'MONTH' ? '月上机人次' : '周上机人次', 'COUNT', (f) => value(f, ['usage'], (x) => x.sessions)),
      m('SESSION_HOURS', type === 'MONTH' ? '月上机时长' : '周上机时长', 'HOURS', (f) => value(f, ['usage'], (x) => x.hours)),
      m('NET_FEE_CONSUMPTION', type === 'MONTH' ? '月网费消耗' : '周网费消耗', 'CURRENCY', (f) => value(f, ['usage'], (x) => x.feeConsumption)),
      m('DAILY_SESSION_COUNT', '日均上机人次', 'COUNT', (f) => value(f, ['usage'], (x) => divide(x.sessions, x.operatingDays))),
      m('HOURS_PER_MACHINE_DAY', '单日单台上机时长', 'HOURS', (f) => value(f, ['usage'], (x) => divide(x.hours, x.machineDays))),
      m('PRODUCT_REVENUE_PER_SESSION', '每人次商品收入', 'CURRENCY', (f) => required(f, ['usage'], (x) => available(x, ['income', 'products']) ? divide(x.productIncome, x.sessions) : null)),
      m('UTILIZATION_RATE', '上机率', 'PERCENT', (f) => value(f, ['usage'], (x) => divide(x.hours, x.machineDays * 24))),
      m('CONSUMPTION_PER_MACHINE_DAY', '单日单台网费消耗', 'CURRENCY', (f) => value(f, ['usage'], (x) => divide(x.feeConsumption, x.machineDays))),
      m('HOURS_PER_SESSION', '每人次上机时长', 'HOURS', (f) => value(f, ['usage'], (x) => divide(x.hours, x.sessions))),
      m('TURNOVER_RATE', '翻台率', 'RATIO', (f) => value(f, ['usage'], (x) => divide(x.sessions, x.machineDays)))
    ];
    const members = [
      m('NEW_MEMBER_COUNT', '新增会员（蓝猫/女神/学生）', 'COUNT', (f) => value(f, ['members'], (x) => x.newMemberCount)),
      m('NEW_PRIVILEGE_MEMBER_COUNT', '新增女神/学生特权', 'COUNT', (f) => value(f, ['members'], (x) => x.newPrivilege)),
      m('NEW_ONLINE_MEMBER_COUNT', '新增线上会员', 'COUNT', (f) => value(f, ['ota'], (x) => x.onlineNew)),
      m('VISITING_MEMBER_COUNT', type === 'MONTH' ? '本月到店会员数' : '本周到店会员数', 'COUNT', (f) => value(f, ['usage'], (x) => x.visitingMembers)),
      ...(type === 'MONTH' ? [m('DAILY_NEW_MEMBER_COUNT', '日均新会员数', 'COUNT', (f) => value(f, ['members'], (x) => divide(x.newMemberCount, x.operatingDays)))] : []),
      m('NEW_MEMBER_RATE', '新会员占比', 'PERCENT', (f) => required(f, ['members', 'usage'], (x) => divide(x.newMemberCount, x.visitingMembers))),
      m('ONLINE_NEW_MEMBER_SHARE', '线上新会员占新会员比', 'PERCENT', (f) => required(f, ['members', 'ota'], (x) => divide(x.onlineNew, x.newMemberCount))),
      m('SPEND_PER_VISITING_MEMBER', '每会员消费', 'CURRENCY', (f) => required(f, ['usage'], (x) => available(x, ['income', 'products', 'ota']) ? divide(x.mainIncome, x.visitingMembers) : null)),
      m('RECHARGE_CONSUMPTION_RATE', '会员充值消耗比', 'PERCENT', (f) =>
        required(f, ['usage'], (x) =>
          available(x, ['income', 'ota'])
            ? divide(x.netFee - x.packageTime.amount, x.feeConsumption)
            : null
        )
      )
    ];
    return [
      { code: 'OPERATING_REVENUE', label: '运营数据', metrics: operating },
      { code: 'COMPUTER_USAGE', label: '上机数据', metrics: usage },
      { code: 'MEMBERS', label: '会员数据', metrics: members }
    ];
  }

  private groupPurchaseRows(previous: CalculatedFacts, current: CalculatedFacts) {
    return [
      this.packageRow('NET_FEE', '网费团购', previous.netFeePackage, current.netFeePackage, current.netFee, previous.availability.ota, current.availability.ota),
      this.packageRow('PACKAGE_TIME', '包时团购', previous.packageTime, current.packageTime, current.netFee, previous.availability.ota, current.availability.ota)
    ];
  }

  private packageRow(code: string, label: string, previous: PackageFact, current: PackageFact, denominator: number, previousAvailable: boolean, currentAvailable: boolean) {
    return {
      code,
      label,
      previousAmount: previousAvailable ? roundMetric(Number(previous.amount ?? 0)) : null,
      currentAmount: currentAvailable ? roundMetric(Number(current.amount ?? 0)) : null,
      changeRate:
        !previousAvailable || !currentAvailable
          ? null
          : previous.amount === 0
          ? current.amount === 0
            ? 0
            : null
          : (current.amount - previous.amount) / previous.amount,
      percentage: currentAvailable && denominator > 0 ? current.amount / denominator : null,
      channels: currentAvailable ? current.channels ?? {} : {}
    };
  }

  private incomeComposition(source: ReportSource, facts: CalculatedFacts) {
    return reportIncomeComposition({
      subtotal: source.income.subtotal,
      cash: source.income.cash,
      otaTotal: source.ota.total,
      otaChannels: {
        MEITUAN: this.channel(source, 'MEITUAN'),
        DOUYIN: this.channel(source, 'DOUYIN'),
        AMAP: this.channel(source, 'AMAP')
      },
      incomeAvailable: facts.availability.income,
      otaAvailable: facts.availability.ota
    });
  }

  private channel(source: ReportSource, platform: string) {
    return Object.values(source.ota.packages).reduce(
      (total, item) => total + Number(item.channels?.[platform] ?? 0),
      0
    );
  }

  private async source(externalStoreId: string, start: string, end: string): Promise<ReportSource> {
    const base = this.config.get<string>('app.bluecatBridgeBaseUrl')?.replace(/\/bridge\/bluecat\/?$/, '');
    const token = this.config.get<string>('app.bluecatBridgeReadToken');
    if (!base || !token) throw new BadRequestException('未配置报表数据桥接');
    const query = new URLSearchParams({ externalStoreId, start, end });
    const response = await fetch(`${base}/bridge/bluecat/v1/operations/report-source?${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`采集服务请求失败：HTTP ${response.status}`);
    const body = (await response.json()) as ReportSource;
    if (body.contractVersion !== '1.0') throw new Error('采集服务契约版本不兼容');
    return body;
  }

  private async resyncPeriod(externalStoreId: string, start: string, end: string) {
    const batch = Date.now();
    for (const day of this.days(start, end)) {
      for (const module of ['income', 'products', 'surf', 'members', 'ota'])
        await this.operations.runCollectorTask(module, day, `report:${batch}:${externalStoreId}:${module}:${day}`, externalStoreId);
    }
  }

  private hasIncompleteCoverage(source: ReportSource) {
    return ['income', 'products', 'surf', 'members', 'ota'].some(
      (module) => (source.coverage[module]?.length ?? 0) < source.expectedDays
    );
  }

  private async resyncMissing(externalStoreId: string, start: string, end: string, source: ReportSource) {
    const batch = Date.now();
    const moduleMap: Record<string, string> = {
      income: 'income', products: 'products', surf: 'surf', members: 'members', ota: 'ota'
    };
    for (const [coverageKey, module] of Object.entries(moduleMap)) {
      const existing = new Set(source.coverage[coverageKey] ?? []);
      for (const day of this.days(start, end)) {
        if (existing.has(day)) continue;
        await this.operations.runCollectorTask(
          module,
          day,
          `report-auto:${batch}:${externalStoreId}:${module}:${day}`,
          externalStoreId
        );
      }
    }
  }

  private async runScheduler() {
    if (this.schedulerRunning) return;
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
      hourCycle: 'h23'
    }).formatToParts(now);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    if (value('hour') !== '10' || Number(value('minute')) > 5) return;
    const isMonday = value('weekday') === 'Mon';
    const isMonthStart = value('day') === '01';
    if (!isMonday && !isMonthStart) return;
    this.schedulerRunning = true;
    try {
      const stores = await this.prisma.v2Store.findMany({
        where: {
          deletedAt: null,
          status: { notIn: ['PREPARING', 'CLOSED'] },
          dataSource: { isNot: null }
        },
        select: { id: true }
      });
      for (const store of stores) {
        if (isMonday) await this.generateMissing(store.id, this.weekPeriod());
        if (isMonthStart) await this.generateMissing(store.id, this.monthPeriod());
      }
    } finally {
      this.schedulerRunning = false;
    }
  }

  private async generateMissing(storeId: string, period: Period) {
    const exists = await this.prisma.v2OperationsReport.findUnique({
      where: { storeId_reportType_periodKey: { storeId, reportType: period.type, periodKey: period.key } },
      select: { status: true }
    });
    if (exists?.status === 'COMPLETE' || exists?.status === 'PARTIAL') return;
    try {
      await this.generateWithRetry(storeId, period, false, null);
    } catch (error) {
      this.logger.error(`自动生成 ${period.type} ${period.key} 失败：${this.reason(error)}`);
    }
  }

  private async store(storeId: string) {
    const store = await this.prisma.v2Store.findFirst({
      where: { id: storeId, deletedAt: null },
      select: {
        id: true, code: true, name: true, shortName: true, machineCount: true,
        openedOn: true, closedOn: true,
        dataSource: { select: { externalStoreId: true } }
      }
    });
    if (!store) throw new NotFoundException('门店不存在');
    return store;
  }

  private storeView(store: Awaited<ReturnType<V2OperationsReportService['store']>>) {
    return { id: store.id, code: store.code, name: store.name, shortName: store.shortName, machineCount: store.machineCount };
  }

  private monthPeriod(value?: string): Period {
    const today = this.chinaToday();
    const currentMonth = today.slice(0, 7);
    const key = /^\d{4}-\d{2}$/.test(value ?? '') ? value! : this.shiftMonth(currentMonth, -1);
    const previous = this.shiftMonth(key, -1);
    return {
      type: 'MONTH', key,
      start: `${key}-01`, end: this.previousDay(`${this.shiftMonth(key, 1)}-01`),
      previousStart: `${previous}-01`, previousEnd: this.previousDay(`${key}-01`)
    };
  }

  private weekPeriod(value?: string): Period {
    const anchor = this.date(/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value! : this.chinaToday());
    const weekday = (anchor.getUTCDay() + 6) % 7;
    let start = new Date(anchor.getTime() - weekday * 86_400_000);
    if (!value) start = new Date(start.getTime() - 7 * 86_400_000);
    const previous = new Date(start.getTime() - 7 * 86_400_000);
    return {
      type: 'WEEK', key: start.toISOString().slice(0, 10),
      start: start.toISOString().slice(0, 10),
      end: new Date(start.getTime() + 6 * 86_400_000).toISOString().slice(0, 10),
      previousStart: previous.toISOString().slice(0, 10),
      previousEnd: new Date(previous.getTime() + 6 * 86_400_000).toISOString().slice(0, 10)
    };
  }

  private assertCompleted(period: Period) {
    if (period.end >= this.chinaToday()) throw new BadRequestException('仅可生成已结束的完整周期报表');
  }

  private operatingDays(start: string, end: string, openedOn: Date | null, closedOn: Date | null) {
    const effectiveStart = openedOn && openedOn > this.date(start) ? openedOn : this.date(start);
    const effectiveEnd = closedOn && closedOn < this.date(end) ? closedOn : this.date(end);
    return effectiveEnd < effectiveStart ? 0 : Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / 86_400_000) + 1;
  }

  private *days(start: string, end: string) {
    for (let cursor = this.date(start); cursor <= this.date(end); cursor = new Date(cursor.getTime() + 86_400_000))
      yield cursor.toISOString().slice(0, 10);
  }

  private shiftMonth(month: string, offset: number) {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
  }

  private previousDay(value: string) {
    return new Date(this.date(value).getTime() - 86_400_000).toISOString().slice(0, 10);
  }

  private date(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private chinaToday() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  }

  private reason(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
