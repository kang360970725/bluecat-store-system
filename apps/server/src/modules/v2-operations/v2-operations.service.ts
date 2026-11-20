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
import { Prisma } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID
} from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../../database/prisma.service';
import {
  normalizeLiveRevenue,
  normalizeSettledRevenue,
  revenueComponentsMatch,
  type XManagerLiveRevenueRow,
  type XManagerSettledRevenueRow
} from '../v2-data-platform/domain/x-manager-revenue-contract';
import {
  normalizeShiftRevenue,
  shiftComponentsMatch,
  type XManagerShiftRow
} from '../v2-data-platform/domain/x-manager-shift-contract';
import {
  CreateV2OperatingTargetDto,
  CreateV2ScheduleAssignmentDto,
  CreateV2SchedulePeriodDto,
  UpdateV2ScheduleAssignmentDto,
  CreateV2ScorePlanDto,
  CreateV2ShiftTemplateDto,
  ApplyV2ScheduleCycleDto,
  GenerateV2TargetAllocationsDto,
  SaveV2WecomWebhookDto,
  SaveV2StoreShiftDto,
  SaveV2ScheduleSuccessionDto,
  TriggerV2CaptureDto,
  MatchV2ExternalStoreCandidateDto,
  UpsertV2DataSourceDto
} from './dto';
import { businessSourceHash } from './source-fingerprint';
import {
  projectMonthlyRevenue,
  roundMetric
} from './operations-dashboard.metrics';
import { scheduleCycleValue, sourceOffsetForTargetDay } from './schedule-cycle';

const CAPTURE_MODULES = new Set([
  'income',
  'recharge',
  'ota',
  'products',
  'surf',
  'members',
  'shifts',
  'branches',
  'machines'
]);

@Injectable()
export class V2OperationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(V2OperationsService.name);
  private scheduleTimer?: NodeJS.Timeout;
  private wecomScheduleRunning = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  onModuleInit() {
    if (!this.config.get<boolean>('app.backgroundJobsEnabled')) {
      this.logger.log('Background jobs disabled by configuration');
      return;
    }
    this.scheduleTimer = setInterval(
      () => void this.runDueWecomSchedulesSafely(),
      30_000
    );
    this.scheduleTimer.unref();
    setTimeout(() => void this.runDueWecomSchedulesSafely(), 5_000).unref();
  }

  onModuleDestroy() {
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
  }

  overview(user?: CurrentUser) {
    return Promise.all([
      this.prisma.v2ShiftTemplate.findMany({
        where: { deletedAt: null },
        orderBy: [{ sort: 'asc' }, { name: 'asc' }]
      }),
      this.prisma.v2SchedulePeriod.findMany({
        where:
          user && !user.roles.includes('super_admin')
            ? { storeId: { in: user.accessibleStoreIds } }
            : undefined,
        include: {
          store: { select: { id: true, name: true, shortName: true } },
          _count: { select: { assignments: true } }
        },
        orderBy: { startsOn: 'desc' },
        take: 50
      }),
      this.prisma.v2OperatingTarget.findMany({
        include: {
          store: { select: { id: true, name: true, shortName: true } }
        },
        orderBy: { targetMonth: 'desc' },
        take: 50
      }),
      this.prisma.v2ScorePlan.findMany({
        include: { _count: { select: { criteria: true, scores: true } } },
        orderBy: [{ code: 'asc' }, { version: 'desc' }]
      }),
      this.prisma.v2DataSourceConnection.findMany({
        include: {
          store: {
            select: { id: true, name: true, shortName: true, code: true }
          },
          jobs: { orderBy: { createdAt: 'desc' }, take: 5 }
        },
        orderBy: { createdAt: 'asc' }
      }),
      this.prisma.v2ExternalStoreCandidate.findMany({
        orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }]
      })
    ]).then(
      ([
        shiftTemplates,
        schedules,
        targets,
        scorePlans,
        connections,
        externalStoreCandidates
      ]) => ({
        shiftTemplates,
        schedules,
        targets,
        scorePlans,
        connections,
        externalStoreCandidates
      })
    );
  }

  createShiftTemplate(dto: CreateV2ShiftTemplateDto) {
    return this.prisma.v2ShiftTemplate.create({ data: dto });
  }

  listWecomWebhooks() {
    return this.prisma.v2WecomWebhookConfig.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        webhookMasked: true,
        reportType: true,
        storeIds: true,
        enabled: true,
        lastTestedAt: true,
        lastTestStatus: true,
        lastTestMessage: true,
        scheduleEnabled: true,
        scheduleFrequency: true,
        scheduleTime: true,
        scheduleWeekday: true,
        scheduleMonthDay: true,
        lastScheduledAt: true,
        lastScheduleStatus: true,
        lastScheduleError: true,
        createdAt: true,
        updatedAt: true,
        pushLogs: {
          select: {
            id: true,
            status: true,
            reportMonth: true,
            errorMessage: true,
            createdAt: true,
            sentAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  async saveWecomWebhook(
    dto: SaveV2WecomWebhookDto,
    user: CurrentUser,
    id?: string
  ) {
    const existing = id
      ? await this.prisma.v2WecomWebhookConfig.findFirst({
          where: { id, deletedAt: null }
        })
      : null;
    if (id && !existing) throw new NotFoundException('企微推送配置不存在');
    if (!existing && !dto.webhookUrl)
      throw new BadRequestException('新建配置时必须填写 Webhook 地址');
    if (dto.webhookUrl) this.assertWecomWebhook(dto.webhookUrl);
    const storeIds =
      dto.reportType === 'ALL' ? [] : [...new Set(dto.storeIds ?? [])];
    if (dto.reportType === 'SINGLE' && storeIds.length !== 1)
      throw new BadRequestException('单店报表必须选择一家门店');
    if (dto.reportType === 'MULTI' && storeIds.length < 2)
      throw new BadRequestException('多店对比至少选择两家门店');
    if (storeIds.length) {
      const count = await this.prisma.v2Store.count({
        where: { id: { in: storeIds }, deletedAt: null }
      });
      if (count !== storeIds.length)
        throw new BadRequestException('包含不存在的门店');
    }
    if (dto.scheduleEnabled && (!dto.scheduleFrequency || !dto.scheduleTime))
      throw new BadRequestException('启用定时推送时必须选择周期和推送时间');
    if (
      dto.scheduleEnabled &&
      dto.scheduleFrequency === 'WEEKLY' &&
      !dto.scheduleWeekday
    )
      throw new BadRequestException('按周推送必须选择星期');
    if (
      dto.scheduleEnabled &&
      dto.scheduleFrequency === 'MONTHLY' &&
      !dto.scheduleMonthDay
    )
      throw new BadRequestException('按月推送必须选择日期');
    const data = {
      name: dto.name,
      reportType: dto.reportType,
      storeIds,
      enabled: dto.enabled ?? true,
      scheduleEnabled: dto.scheduleEnabled ?? false,
      scheduleFrequency: dto.scheduleEnabled ? dto.scheduleFrequency : null,
      scheduleTime: dto.scheduleEnabled ? dto.scheduleTime : null,
      scheduleWeekday:
        dto.scheduleEnabled && dto.scheduleFrequency === 'WEEKLY'
          ? dto.scheduleWeekday
          : null,
      scheduleMonthDay:
        dto.scheduleEnabled && dto.scheduleFrequency === 'MONTHLY'
          ? dto.scheduleMonthDay
          : null,
      ...(dto.webhookUrl
        ? {
            webhookEncrypted: this.encryptSecret(dto.webhookUrl),
            webhookMasked: this.maskWebhook(dto.webhookUrl)
          }
        : {}),
      updatedBy: user.id
    };
    return existing
      ? this.prisma.v2WecomWebhookConfig.update({
          where: { id: existing.id },
          data,
          select: {
            id: true,
            name: true,
            webhookMasked: true,
            reportType: true,
            storeIds: true,
            enabled: true,
            scheduleEnabled: true,
            scheduleFrequency: true,
            scheduleTime: true,
            scheduleWeekday: true,
            scheduleMonthDay: true
          }
        })
      : this.prisma.v2WecomWebhookConfig.create({
          data: {
            ...data,
            webhookEncrypted: data.webhookEncrypted!,
            webhookMasked: data.webhookMasked!,
            createdBy: user.id
          },
          select: {
            id: true,
            name: true,
            webhookMasked: true,
            reportType: true,
            storeIds: true,
            enabled: true,
            scheduleEnabled: true,
            scheduleFrequency: true,
            scheduleTime: true,
            scheduleWeekday: true,
            scheduleMonthDay: true
          }
        });
  }

  async testWecomWebhook(id: string) {
    const config = await this.prisma.v2WecomWebhookConfig.findFirst({
      where: { id, deletedAt: null }
    });
    if (!config) throw new NotFoundException('企微推送配置不存在');
    let status = 'FAILED';
    let detail = '';
    try {
      const webhook = this.decryptSecret(config.webhookEncrypted);
      this.assertWecomWebhook(webhook);
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content: '蓝猫门店运营系统：企微群机器人连接测试成功' }
        }),
        signal: AbortSignal.timeout(10000)
      });
      const result = (await response.json()) as {
        errcode?: number;
        errmsg?: string;
      };
      if (!response.ok || result.errcode !== 0)
        throw new Error(result.errmsg || `HTTP ${response.status}`);
      status = 'SUCCESS';
      detail = '测试消息发送成功';
    } catch (error) {
      detail = error instanceof Error ? error.message : '未知错误';
    }
    await this.prisma.v2WecomWebhookConfig.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: status,
        lastTestMessage: detail
      }
    });
    if (status !== 'SUCCESS')
      throw new BadRequestException(`企微连接测试失败：${detail}`);
    return { success: true, message: detail };
  }

  async pushWecomReport(id: string) {
    const config = await this.prisma.v2WecomWebhookConfig.findFirst({
      where: { id, deletedAt: null }
    });
    if (!config) throw new NotFoundException('企微推送配置不存在');
    if (!config.enabled) throw new BadRequestException('该企微推送配置已停用');
    const configuredStoreIds = Array.isArray(config.storeIds)
      ? config.storeIds.map(String)
      : [];
    const [ranking, stores] = await Promise.all([
      this.storePerformanceRanking(),
      this.prisma.v2Store.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          shortName: true,
          code: true,
          status: true
        }
      })
    ]);
    const activeStores = stores.filter((item) => item.status !== 'CLOSED');
    const selectedIds =
      config.reportType === 'ALL'
        ? activeStores.map((item) => item.id)
        : configuredStoreIds.filter((id) =>
            activeStores.some((store) => store.id === id)
          );
    const storeMap = new Map(activeStores.map((item) => [item.id, item]));
    const items = ranking.items
      .filter(
        (item) =>
          selectedIds.includes(item.storeId) && storeMap.has(item.storeId)
      )
      .map((item) => {
        const store = storeMap.get(item.storeId)!;
        return {
          ...item,
          storeName: store.shortName?.trim() || store.name,
          storeFullName: store.name,
          storeCode: store.code
        };
      })
      .sort(
        (a, b) =>
          Number(b.profitTarget !== 0) - Number(a.profitTarget !== 0) ||
          b.estimatedProfitCompletionRate - a.estimatedProfitCompletionRate ||
          b.estimatedProfit - a.estimatedProfit
      )
      .map((item, index) => ({ ...item, rank: index + 1 }));
    if (!items.length)
      throw new BadRequestException('该配置没有可推送的门店数据');
    const withRevenueTarget = items.filter((item) => item.target > 0);
    const withProfitTarget = items.filter((item) => item.profitTarget !== 0);
    const average = (values: number[]) =>
      values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;
    const summary = {
      totalTarget: items.reduce((sum, item) => sum + item.target, 0),
      totalRevenue: items.reduce((sum, item) => sum + item.monthTotal, 0),
      estimatedRevenue: items.reduce(
        (sum, item) => sum + item.estimatedRevenue,
        0
      ),
      estimatedCompletionRate: 0,
      averageCompletionRate: average(
        withRevenueTarget.map((item) => item.completionRate)
      ),
      totalProfitTarget: items.reduce(
        (sum, item) => sum + item.profitTarget,
        0
      ),
      totalProfit: items.reduce((sum, item) => sum + item.actualProfit, 0),
      positiveEstimatedProfit: items
        .filter((item) => item.estimatedProfit > 0)
        .reduce((sum, item) => sum + item.estimatedProfit, 0),
      estimatedLossAbsolute: Math.abs(
        items
          .filter((item) => item.estimatedProfit < 0)
          .reduce((sum, item) => sum + item.estimatedProfit, 0)
      ),
      netEstimatedProfit: items.reduce(
        (sum, item) => sum + item.estimatedProfit,
        0
      ),
      estimatedProfitCompletionRate: 0,
      averageProfitCompletionRate: average(
        withProfitTarget.map((item) => item.profitCompletionRate)
      )
    };
    summary.estimatedCompletionRate = summary.totalTarget
      ? summary.estimatedRevenue / summary.totalTarget
      : 0;
    summary.estimatedProfitCompletionRate = summary.totalProfitTarget
      ? summary.netEstimatedProfit / summary.totalProfitTarget
      : 0;
    const snapshot = {
      generatedAt: new Date().toISOString(),
      month: ranking.month,
      reportType: config.reportType,
      summary,
      items
    };
    const log = await this.prisma.v2WecomPushLog.create({
      data: {
        configId: config.id,
        reportType: config.reportType,
        reportMonth: ranking.month,
        storeIds: selectedIds,
        snapshot,
        status: 'PROCESSING'
      }
    });
    try {
      const png = await sharp(
        Buffer.from(
          this.wecomReportSvg(config.name, ranking.month, items, summary)
        )
      )
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();
      if (png.length > 2 * 1024 * 1024)
        throw new Error('生成的报表图片超过企微 2MB 限制');
      const md5 = createHash('md5').update(png).digest('hex');
      const webhook = this.decryptSecret(config.webhookEncrypted);
      this.assertWecomWebhook(webhook);
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'image',
          image: { base64: png.toString('base64'), md5 }
        }),
        signal: AbortSignal.timeout(15000)
      });
      const result = (await response.json()) as {
        errcode?: number;
        errmsg?: string;
      };
      if (!response.ok || result.errcode !== 0)
        throw new Error(result.errmsg || `HTTP ${response.status}`);
      await this.prisma.v2WecomPushLog.update({
        where: { id: log.id },
        data: {
          status: 'SUCCESS',
          imageBytes: png.length,
          imageMd5: md5,
          sentAt: new Date()
        }
      });
      return {
        success: true,
        reportMonth: ranking.month,
        storeCount: items.length,
        imageBytes: png.length
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知错误';
      await this.prisma.v2WecomPushLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorMessage: detail }
      });
      throw new BadRequestException(`企微报表推送失败：${detail}`);
    }
  }

  private async runDueWecomSchedulesSafely() {
    if (this.wecomScheduleRunning) {
      this.logger.warn('Skipped overlapping WeCom schedule check');
      return;
    }
    this.wecomScheduleRunning = true;
    try {
      await this.runDueWecomSchedules();
    } catch (error) {
      this.logger.error(
        `WeCom schedule check failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      this.wecomScheduleRunning = false;
    }
  }

  private async runDueWecomSchedules() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(now)
      .reduce<Record<string, string>>((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
      }, {});
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}`;
    const day = Number(parts.day);
    const weekday = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const daysInMonth = new Date(
      Date.UTC(Number(parts.year), Number(parts.month), 0)
    ).getUTCDate();
    const configs = await this.prisma.v2WecomWebhookConfig.findMany({
      where: {
        enabled: true,
        scheduleEnabled: true,
        deletedAt: null,
        scheduleTime: time
      }
    });
    for (const config of configs) {
      const due =
        config.scheduleFrequency === 'DAILY' ||
        (config.scheduleFrequency === 'WEEKLY' &&
          config.scheduleWeekday === weekday) ||
        (config.scheduleFrequency === 'MONTHLY' &&
          day === Math.min(config.scheduleMonthDay ?? 1, daysInMonth));
      if (!due) continue;
      const scheduleKey = `${date}:${time}:${config.scheduleFrequency}`;
      const claimed = await this.prisma.v2WecomWebhookConfig.updateMany({
        where: {
          id: config.id,
          OR: [
            { lastScheduleKey: null },
            { lastScheduleKey: { not: scheduleKey } }
          ]
        },
        data: {
          lastScheduleKey: scheduleKey,
          lastScheduledAt: now,
          lastScheduleStatus: 'PROCESSING',
          lastScheduleError: null
        }
      });
      if (!claimed.count) continue;
      try {
        await this.pushWecomReport(config.id);
        await this.prisma.v2WecomWebhookConfig.update({
          where: { id: config.id },
          data: { lastScheduleStatus: 'SUCCESS' }
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : '未知错误';
        this.logger.error(`企微定时推送失败 (${config.name}): ${detail}`);
        await this.prisma.v2WecomWebhookConfig.update({
          where: { id: config.id },
          data: { lastScheduleStatus: 'FAILED', lastScheduleError: detail }
        });
      }
    }
  }

  async deleteWecomWebhook(id: string, user: CurrentUser) {
    const existing = await this.prisma.v2WecomWebhookConfig.findFirst({
      where: { id, deletedAt: null }
    });
    if (!existing) throw new NotFoundException('企微推送配置不存在');
    return this.prisma.v2WecomWebhookConfig.update({
      where: { id },
      data: { enabled: false, deletedAt: new Date(), updatedBy: user.id },
      select: { id: true }
    });
  }

  async ingestSettledRevenue(rows: unknown[]) {
    return this.ingestRevenueRows(
      rows as XManagerSettledRevenueRow[],
      'SETTLED_DAILY'
    );
  }

  async ingestLiveRevenue(rows: unknown[]) {
    return this.ingestRevenueRows(
      rows as XManagerLiveRevenueRow[],
      'LIVE_TODAY'
    );
  }

  async ingestOtaDaily(rows: unknown[]) {
    let upserted = 0;
    let unchanged = 0;
    const rejected: Array<{ externalStoreId?: string; reason: string }> = [];
    for (const source of rows as Array<Record<string, unknown>>) {
      const externalStoreId = String(source.snbid ?? '').trim();
      try {
        if (!externalStoreId) throw new Error('缺少门店账号');
        const connection = await this.prisma.v2DataSourceConnection.findFirst({
          where: {
            externalStoreId: { equals: externalStoreId },
            store: { status: { not: 'CLOSED' } }
          }
        });
        if (!connection) throw new Error('门店尚未建立 X 管家映射');
        const rawDate = String(source.startTime ?? source.queryBeginTime ?? '');
        if (!/^\d{4}-\d{2}-\d{2}/.test(rawDate))
          throw new Error('缺少营业日期');
        const businessDate = this.sourceDate(rawDate);
        const capturedAt = new Date();
        const data = {
          externalStoreId,
          externalStoreName: String(source.barName ?? '') || null,
          totalAmount: Number(source.sum ?? 0),
          meituanAmount: Number(source.meituanSum ?? 0),
          douyinAmount: Number(source.douyinSum ?? 0),
          amapAmount: Number(source.amapSum ?? 0),
          barAmount: Number(source.barSum ?? 0),
          xminiAmount: Number(source.xminiSum ?? 0),
          selfServiceAmount: Number(source.pbSelf ?? 0),
          officialAmount: Number(source.officialSum ?? 0),
          capturedAt,
          sourceHash: this.sourceHash(source),
          sourcePayload: source as object
        };
        const uniqueWhere = {
          storeId_businessDate: { storeId: connection.storeId, businessDate }
        };
        const existing = await this.prisma.v2OtaDailySnapshot.findUnique({
          where: uniqueWhere,
          select: { sourceHash: true, storeId: true }
        });
        if (
          existing?.sourceHash === data.sourceHash &&
          existing.storeId === connection.storeId
        ) {
          unchanged += 1;
          continue;
        }
        await this.prisma.v2OtaDailySnapshot.upsert({
          where: uniqueWhere,
          update: data,
          create: { storeId: connection.storeId, businessDate, ...data }
        });
        upserted += 1;
      } catch (error) {
        rejected.push({
          externalStoreId,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return { received: rows.length, upserted, unchanged, rejected };
  }

  async ingestOtaProducts(rows: unknown[]) {
    let upserted = 0;
    const rejected: Array<{ externalProductId?: string; reason: string }> = [];
    for (const source of rows as Array<Record<string, unknown>>) {
      const externalStoreId = String(source.__branch_snbid ?? '').trim();
      const platform = String(source.otaType ?? source.__platform ?? '')
        .trim()
        .toUpperCase();
      const externalProductId = String(
        source.groupId ?? source.id ?? ''
      ).trim();
      try {
        if (!externalStoreId || !platform || !externalProductId)
          throw new Error('团购商品缺少来源标识');
        const connection = await this.prisma.v2DataSourceConnection.findFirst({
          where: {
            externalStoreId: { equals: externalStoreId },
            store: { status: { not: 'CLOSED' } }
          }
        });
        if (!connection) throw new Error('门店尚未建立 X 管家映射');
        await this.prisma.v2OtaProduct.upsert({
          where: {
            storeId_platform_externalProductId: {
              storeId: connection.storeId,
              platform,
              externalProductId
            }
          },
          update: {
            name: String(source.groupName ?? source.name ?? externalProductId),
            amount: Number(source.amount ?? 0) / 100,
            status: String(source.groupStatus ?? source.status ?? '') || null,
            sourcePayload: source as object,
            capturedAt: new Date()
          },
          create: {
            storeId: connection.storeId,
            platform,
            externalProductId,
            name: String(source.groupName ?? source.name ?? externalProductId),
            amount: Number(source.amount ?? 0) / 100,
            status: String(source.groupStatus ?? source.status ?? '') || null,
            sourcePayload: source as object,
            capturedAt: new Date()
          }
        });
        upserted += 1;
      } catch (error) {
        rejected.push({
          externalProductId,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return { received: rows.length, upserted, rejected };
  }

  async ingestOtaRedemptions(rows: unknown[]) {
    let upserted = 0;
    let unchanged = 0;
    const rejected: Array<{ externalOrderId?: string; reason: string }> = [];
    const sourceRows = rows as Array<Record<string, unknown>>;
    const deduplicated = new Map<string, Record<string, unknown>>();
    sourceRows.forEach((source, index) => {
      const externalStoreId = String(source.__branch_snbid ?? '')
        .trim()
        .toUpperCase();
      const externalOrderId = String(
        source.orderId ?? source.otaOrderId ?? source.id ?? ''
      ).trim();
      deduplicated.set(
        externalStoreId && externalOrderId
          ? `${externalStoreId}\u0000${externalOrderId}`
          : `__invalid__${index}`,
        source
      );
    });
    const compactRows = [...deduplicated.values()];
    const externalStoreIds = [
      ...new Set(
        compactRows
          .map((source) =>
            String(source.__branch_snbid ?? '')
              .trim()
              .toUpperCase()
          )
          .filter(Boolean)
      )
    ];
    const orderIds = [
      ...new Set(
        compactRows
          .map((source) =>
            String(
              source.orderId ?? source.otaOrderId ?? source.id ?? ''
            ).trim()
          )
          .filter(Boolean)
      )
    ];
    const connections = await this.prisma.v2DataSourceConnection.findMany({
      where: {
        externalStoreId: { in: externalStoreIds },
        store: { status: { not: 'CLOSED' } }
      },
      select: { storeId: true, externalStoreId: true }
    });
    const connectionByExternalId = new Map(
      connections.map((item) => [item.externalStoreId.toUpperCase(), item])
    );
    const productExternalIds = [
      ...new Set(
        compactRows
          .map((source) => String(source.groupId ?? '').trim())
          .filter(Boolean)
      )
    ];
    const products = productExternalIds.length
      ? await this.prisma.v2OtaProduct.findMany({
          where: {
            storeId: { in: connections.map((item) => item.storeId) },
            externalProductId: { in: productExternalIds }
          },
          select: {
            id: true,
            storeId: true,
            platform: true,
            externalProductId: true
          }
        })
      : [];
    const productBySourceKey = new Map(
      products.map((item) => [
        `${item.storeId}\u0000${item.platform}\u0000${item.externalProductId}`,
        item
      ])
    );
    const existingRows =
      externalStoreIds.length && orderIds.length
        ? await this.prisma.v2OtaRedemption.findMany({
            where: {
              externalStoreId: { in: externalStoreIds },
              externalOrderId: { in: orderIds }
            },
            select: {
              externalStoreId: true,
              externalOrderId: true,
              sourceHash: true,
              storeId: true,
              productId: true,
              storeShiftId: true
            }
          })
        : [];
    const existingBySourceKey = new Map(
      existingRows.map((item) => [
        `${item.externalStoreId.toUpperCase()}\u0000${item.externalOrderId}`,
        item
      ])
    );
    const shiftCache = new Map<string, Promise<{ id: string }>>();
    for (const source of compactRows) {
      const externalStoreId = String(source.__branch_snbid ?? '')
        .trim()
        .toUpperCase();
      const externalOrderId = String(
        source.orderId ?? source.otaOrderId ?? source.id ?? ''
      ).trim();
      try {
        if (!externalStoreId || !externalOrderId)
          throw new Error('核销记录缺少来源标识');
        const connection = connectionByExternalId.get(externalStoreId);
        if (!connection) throw new Error('门店尚未建立 X 管家映射');
        const platform = String(source.otaType ?? '')
          .trim()
          .toUpperCase();
        const externalProductId = String(source.groupId ?? '').trim();
        const operatedText = String(source.useTime ?? '');
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(operatedText))
          throw new Error('核销记录缺少操作时间');
        const operatorLabel = String(source.useOpt ?? '').trim() || null;
        const explicitShift = operatorLabel?.includes('白班')
          ? '白班'
          : operatorLabel?.match(/晚班|夜班/)?.[0];
        const hour = Number(operatedText.slice(11, 13));
        const shiftLabel =
          explicitShift || (hour >= 9 && hour < 21 ? '白班' : '晚班');
        const shiftKey = `${connection.storeId}\u0000${shiftLabel}`;
        let shiftPromise = shiftCache.get(shiftKey);
        if (!shiftPromise) {
          shiftPromise = this.resolveSourceStoreShift(
            connection.storeId,
            shiftLabel,
            operatedText,
            operatedText
          );
          shiftCache.set(shiftKey, shiftPromise);
        }
        const storeShift = await shiftPromise;
        const product = externalProductId
          ? productBySourceKey.get(
              `${connection.storeId}\u0000${platform}\u0000${externalProductId}`
            )
          : null;
        const sourceHash =
          String(source.sourceHash ?? '').trim() || this.sourceHash(source);
        const data = {
          storeId: connection.storeId,
          productId: product?.id ?? null,
          storeShiftId: storeShift.id,
          externalProductId,
          platform,
          productName: String(
            source.groupName || externalProductId || '未知团购'
          ),
          businessDate: this.sourceDate(operatedText),
          operatedAt: this.sourceDateTime(operatedText),
          operatorLabel,
          useSource: String(source.useSource ?? '') || null,
          status: String(source.status ?? '') || null,
          amount: Number(source.groupMoney ?? 0) / 100,
          sourceHash,
          // Business fields are normalized above. Keep only a trace envelope
          // here; DATAN retains the append-only raw evidence.
          sourcePayload: {
            contractVersion: String(source.contractVersion ?? '1.0'),
            sourceRecordId: String(source.sourceRecordId ?? '') || null,
            sourceHash,
            capturedAt: String(source.__captured_at ?? '') || null
          },
          capturedAt: new Date()
        };
        const existing = existingBySourceKey.get(
          `${externalStoreId}\u0000${externalOrderId}`
        );
        if (
          existing?.sourceHash === data.sourceHash &&
          existing.storeId === data.storeId &&
          existing.productId === data.productId &&
          existing.storeShiftId === data.storeShiftId
        ) {
          unchanged += 1;
          continue;
        }
        await this.prisma.v2OtaRedemption.upsert({
          where: {
            externalStoreId_externalOrderId: {
              externalStoreId,
              externalOrderId
            }
          },
          update: data,
          create: { externalStoreId, externalOrderId, ...data }
        });
        existingBySourceKey.set(`${externalStoreId}\u0000${externalOrderId}`, {
          externalStoreId,
          externalOrderId,
          sourceHash: data.sourceHash,
          storeId: data.storeId,
          productId: data.productId,
          storeShiftId: data.storeShiftId
        });
        upserted += 1;
      } catch (error) {
        rejected.push({
          externalOrderId,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return {
      received: sourceRows.length,
      deduplicated: compactRows.length,
      duplicatesSkipped: sourceRows.length - compactRows.length,
      upserted,
      unchanged,
      rejected
    };
  }

  private async ingestRevenueRows(
    rows: Array<XManagerSettledRevenueRow | XManagerLiveRevenueRow>,
    kind: 'SETTLED_DAILY' | 'LIVE_TODAY'
  ) {
    let upserted = 0;
    let unchanged = 0;
    const rejected: Array<{ externalStoreId?: string; reason: string }> = [];
    for (const source of rows) {
      try {
        const item =
          kind === 'SETTLED_DAILY'
            ? normalizeSettledRevenue(source as XManagerSettledRevenueRow)
            : normalizeLiveRevenue(source as XManagerLiveRevenueRow);
        if (!revenueComponentsMatch(item))
          throw new Error('总额与分类合计不一致');
        const connection = await this.prisma.v2DataSourceConnection.findFirst({
          where: {
            externalStoreId: { equals: item.externalStoreId },
            store: { status: { not: 'CLOSED' } }
          }
        });
        if (!connection) throw new Error('门店尚未建立 X 管家映射');
        const businessDate = this.sourceDate(item.businessDate);
        const capturedAt = new Date();
        const data = {
          externalStoreId: item.externalStoreId,
          externalStoreName: item.externalStoreName,
          subtotal: item.subtotal,
          netFeeIncome: item.netFeeIncome,
          productSales: item.productSales,
          rental: item.rental,
          tips: item.tips,
          voucherSales: item.voucherSales,
          equitySales: item.equitySales,
          otherIncome: item.otherIncome,
          otherExpense: item.otherExpense,
          otherNet: item.otherNet,
          cashAmount: item.cashAmount,
          onlineAmount: item.onlineAmount,
          capturedAt,
          sourceHash: this.sourceHash(source),
          sourcePayload: source as object
        };
        const uniqueWhere = {
          storeId_businessDate_kind: {
            storeId: connection.storeId,
            businessDate,
            kind
          }
        };
        const existing = await this.prisma.v2RevenueSnapshot.findUnique({
          where: uniqueWhere,
          select: { sourceHash: true, storeId: true }
        });
        if (
          existing?.sourceHash === data.sourceHash &&
          existing.storeId === connection.storeId
        ) {
          unchanged += 1;
          continue;
        }
        try {
          await this.prisma.v2RevenueSnapshot.upsert({
            where: uniqueWhere,
            update: data,
            create: { storeId: connection.storeId, businessDate, kind, ...data }
          });
        } catch (error) {
          // MySQL upsert can still race when an automatic poll and a manual backfill
          // create the same daily key concurrently. The winner already created it,
          // so turn only that known unique-key race into an update.
          if ((error as { code?: string }).code !== 'P2002') throw error;
          await this.prisma.v2RevenueSnapshot.update({
            where: uniqueWhere,
            data
          });
        }
        upserted += 1;
      } catch (error) {
        rejected.push({
          externalStoreId: (source as { snbid?: string }).snbid,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return { kind, received: rows.length, upserted, unchanged, rejected };
  }

  async ingestShiftRevenue(rows: unknown[]) {
    let upserted = 0;
    let unchanged = 0;
    const rejected: Array<{ externalShiftId?: string; reason: string }> = [];
    for (const source of rows as XManagerShiftRow[]) {
      try {
        const item = normalizeShiftRevenue(source);
        if (!shiftComponentsMatch(item))
          throw new Error('班次总收入与分类合计不一致');
        const connection = await this.prisma.v2DataSourceConnection.findFirst({
          where: {
            externalStoreId: { equals: item.externalStoreId },
            store: { status: { not: 'CLOSED' } }
          }
        });
        if (!connection) throw new Error('门店尚未建立 X 管家映射');
        const storeShift = item.operatorLabel
          ? await this.resolveSourceStoreShift(
              connection.storeId,
              item.operatorLabel,
              item.shiftStartedAt,
              item.shiftEndedAt
            )
          : null;
        const capturedAt = new Date();
        const data = {
          storeId: connection.storeId,
          storeShiftId: storeShift?.id ?? null,
          externalStoreName: item.externalStoreName,
          businessDate: this.sourceDate(item.businessDate),
          shiftStartedAt: this.sourceDateTime(item.shiftStartedAt),
          shiftEndedAt: this.sourceDateTime(item.shiftEndedAt),
          handedOverAt: this.sourceDateTime(item.handedOverAt),
          operatorLabel: item.operatorLabel,
          terminalLabel: item.terminalLabel,
          totalIncome: item.totalIncome,
          netFeeIncome: item.netFeeIncome,
          productSales: item.productSales,
          rental: item.rental,
          otherNet: item.otherNet,
          capturedAt,
          sourceHash: this.sourceHash(source),
          sourcePayload: source as object
        };
        const uniqueWhere = {
          sourceSystem_externalStoreId_externalShiftId: {
            sourceSystem: 'X_MANAGER',
            externalStoreId: item.externalStoreId,
            externalShiftId: item.externalShiftId
          }
        };
        const existing = await this.prisma.v2ShiftRevenueSnapshot.findUnique({
          where: uniqueWhere,
          select: { sourceHash: true, storeId: true, storeShiftId: true }
        });
        if (
          existing?.sourceHash === data.sourceHash &&
          existing.storeId === data.storeId &&
          existing.storeShiftId === data.storeShiftId
        ) {
          unchanged += 1;
          continue;
        }
        await this.prisma.v2ShiftRevenueSnapshot.upsert({
          where: uniqueWhere,
          update: data,
          create: {
            sourceSystem: 'X_MANAGER',
            externalStoreId: item.externalStoreId,
            externalShiftId: item.externalShiftId,
            ...data
          }
        });
        if (storeShift)
          await this.refreshAllocationActual(
            connection.storeId,
            data.businessDate,
            storeShift.id
          );
        upserted += 1;
      } catch (error) {
        rejected.push({
          externalShiftId: source.shiftId,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return { received: rows.length, upserted, unchanged, rejected };
  }

  async storePerformance(storeId: string, monthValue?: string) {
    const monthText = /^\d{4}-\d{2}$/.test(monthValue ?? '')
      ? monthValue!
      : new Date().toISOString().slice(0, 7);
    const monthStart = this.sourceDate(`${monthText}-01`);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    const [
      store,
      revenue,
      otaDaily,
      otaRedemptions,
      shifts,
      productExclusions
    ] = await Promise.all([
      this.prisma.v2Store.findUnique({
        where: { id: storeId },
        select: {
          id: true,
          name: true,
          shortName: true,
          code: true,
          businessDayStartsAt: true
        }
      }),
      this.prisma.v2RevenueSnapshot.findMany({
        where: { storeId, businessDate: { gte: monthStart, lt: monthEnd } },
        select: {
          id: true,
          businessDate: true,
          kind: true,
          netFeeIncome: true,
          productSales: true,
          rental: true
        },
        orderBy: { businessDate: 'asc' }
      }),
      this.prisma.v2OtaDailySnapshot.findMany({
        where: { storeId, businessDate: { gte: monthStart, lt: monthEnd } },
        select: { businessDate: true, totalAmount: true },
        orderBy: { businessDate: 'asc' }
      }),
      this.prisma.v2OtaRedemption.findMany({
        where: {
          storeId,
          businessDate: { gte: monthStart, lt: monthEnd },
          OR: [{ productId: null }, { product: { is: { isBrush: false } } }]
        },
        select: {
          businessDate: true,
          storeShiftId: true,
          amount: true,
          product: {
            select: { isBrush: true, settlementRate: true, feeRate: true }
          }
        }
      }),
      this.prisma.v2ShiftRevenueSnapshot.findMany({
        where: { storeId, businessDate: { gte: monthStart, lt: monthEnd } },
        select: {
          id: true,
          businessDate: true,
          storeShiftId: true,
          shiftStartedAt: true,
          shiftEndedAt: true,
          handedOverAt: true,
          operatorLabel: true,
          totalIncome: true,
          netFeeIncome: true,
          productSales: true,
          rental: true,
          storeShift: { select: { id: true, name: true, code: true } }
        },
        orderBy: [{ businessDate: 'desc' }, { shiftStartedAt: 'desc' }]
      }),
      this.prisma.v2ProductExclusionSnapshot.findMany({
        where: { storeId, businessDate: { gte: monthStart, lt: monthEnd } },
        select: {
          businessDate: true,
          kind: true,
          shiftRevenueSnapshotId: true,
          excludedAmount: true
        }
      })
    ]);
    if (!store) throw new NotFoundException('门店不存在');
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
    const settled = revenue.filter(
      (item) =>
        item.kind === 'SETTLED_DAILY' &&
        item.businessDate.toISOString().slice(0, 10) !== today
    );
    const live = revenue.find(
      (item) =>
        item.kind === 'LIVE_TODAY' &&
        item.businessDate.toISOString().slice(0, 10) === today
    );
    const otaTotal = otaRedemptions.reduce(
      (sum, item) => sum + this.otaActualAmount(item),
      0
    );
    const otaReferenceTotal = otaDaily.reduce(
      (sum, item) => sum + Number(item.totalAmount ?? 0),
      0
    );
    const exclusionMap = new Map(
      productExclusions
        .filter(
          (item) => item.kind === 'SETTLED_DAILY' || item.kind === 'LIVE_TODAY'
        )
        .map((item) => [
          `${item.businessDate.toISOString().slice(0, 10)}:${item.kind}`,
          Number(item.excludedAmount)
        ])
    );
    const effective = (item: (typeof revenue)[number]) =>
      Number(item.netFeeIncome ?? 0) +
      Number(item.rental ?? 0) +
      Math.max(
        0,
        Number(item.productSales ?? 0) -
          (exclusionMap.get(
            `${item.businessDate.toISOString().slice(0, 10)}:${item.kind}`
          ) ?? 0)
      );
    const total =
      settled.reduce((sum, item) => sum + effective(item), 0) +
      (live ? effective(live) : 0) +
      otaTotal;
    const latestShift = shifts.reduce<(typeof shifts)[number] | null>(
      (latest, item) =>
        !latest || item.handedOverAt > latest.handedOverAt ? item : latest,
      null
    );
    const latestShiftExcluded = Number(
      productExclusions.find(
        (item) =>
          item.kind === 'SHIFT' &&
          item.shiftRevenueSnapshotId === latestShift?.id
      )?.excludedAmount ?? 0
    );
    const latestShiftOta = otaRedemptions
      .filter(
        (item) =>
          latestShift &&
          item.businessDate.getTime() === latestShift.businessDate.getTime() &&
          item.storeShiftId === latestShift.storeShiftId
      )
      .reduce((sum, item) => sum + this.otaActualAmount(item), 0);
    const latestShiftIncome =
      Number(latestShift?.netFeeIncome ?? 0) +
      Number(latestShift?.rental ?? 0) +
      Math.max(
        0,
        Number(latestShift?.productSales ?? 0) - latestShiftExcluded
      ) +
      latestShiftOta;
    const todayOta = otaRedemptions
      .filter((item) => item.businessDate.toISOString().slice(0, 10) === today)
      .reduce((sum, item) => sum + this.otaActualAmount(item), 0);
    return {
      store,
      month: monthText,
      currentShiftIncome: latestShiftIncome,
      currentShiftLabel:
        latestShift?.storeShift?.name || latestShift?.operatorLabel || null,
      currentShiftHandedOverAt: latestShift?.handedOverAt ?? null,
      todayIncome: (live ? effective(live) : 0) + todayOta,
      monthTotal: Math.round(total * 100) / 100,
      otaTotal: Math.round(otaTotal * 100) / 100,
      otaReferenceTotal: Math.round(otaReferenceTotal * 100) / 100,
      settledDays: settled.length,
      liveIncluded: Boolean(live),
      daily: revenue,
      otaDaily,
      shifts
    };
  }

  async storeCenterRanking(user: CurrentUser, month?: string) {
    const isAdmin = user.roles.includes('super_admin');
    const isStoreManager = user.roles.includes('store_manager');
    const seesAllStores = isAdmin || isStoreManager;
    if (
      user.mustChangePassword ||
      (!seesAllStores && !user.permissions.includes('performance:view'))
    )
      throw new ForbiddenException('无权查看门店经营排名');
    const storeFilter = seesAllStores
      ? {}
      : { id: { in: user.accessibleStoreIds } };
    const [ranking, stores] = await Promise.all([
      this.storePerformanceRanking(seesAllStores ? undefined : user, month),
      this.prisma.v2Store.findMany({
        where: { ...storeFilter, deletedAt: null, status: { not: 'CLOSED' } },
        select: { id: true, name: true, shortName: true, status: true }
      })
    ]);
    const storeMap = new Map(stores.map((store) => [store.id, store]));
    return {
      ...ranking,
      summaryScope: isAdmin ? 'all' : isStoreManager ? 'managed' : 'authorized',
      summaryStoreIds: stores
        .filter(
          (store) => isAdmin || user.accessibleStoreIds.includes(store.id)
        )
        .map((store) => store.id),
      items: ranking.items.flatMap((item) => {
        const store = storeMap.get(item.storeId);
        return store
          ? [
              {
                ...item,
                ...store,
                canOpenWorkspace:
                  isAdmin ||
                  (user.permissions.includes('store:view') &&
                    user.accessibleStoreIds.includes(store.id))
              }
            ]
          : [];
      })
    };
  }

  async storePerformanceRanking(user?: CurrentUser, monthValue?: string) {
    const todayText = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
    const currentMonth = todayText.slice(0, 7);
    const month = /^\d{4}-\d{2}$/.test(monthValue ?? '')
      ? monthValue!
      : currentMonth;
    const monthStart = this.sourceDate(`${month}-01`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    const today = this.sourceDate(todayText);
    const [year, monthNumber] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const forecastPeriod = projectMonthlyRevenue({
      month,
      currentMonth,
      todayDay: Number(todayText.slice(8, 10)),
      daysInMonth,
      actualRevenue: 0,
      completedRevenue: 0
    });
    const elapsedDays = forecastPeriod.elapsedDays;
    const storeIds =
      user && !user.roles.includes('super_admin')
        ? user.accessibleStoreIds
        : undefined;
    const scope = storeIds ? { storeId: { in: storeIds } } : {};
    const [
      stores,
      revenues,
      redemptionTotals,
      targets,
      exclusions,
      costs,
      costCorrections
    ] = await Promise.all([
      this.prisma.v2Store.findMany({
        where: {
          deletedAt: null,
          ...(storeIds ? { id: { in: storeIds } } : {})
        },
        select: { id: true }
      }),
      this.prisma.v2RevenueSnapshot.findMany({
        where: { ...scope, businessDate: { gte: monthStart, lt: monthEnd } },
        select: {
          storeId: true,
          businessDate: true,
          kind: true,
          netFeeIncome: true,
          productSales: true,
          rental: true
        }
      }),
      this.prisma.$queryRaw<
        Array<{
          storeId: string;
          completed: number | bigint;
          actualAmount: Prisma.Decimal | null;
        }>
      >(Prisma.sql`
        SELECT
          r.store_id AS storeId,
          r.business_date < ${today} AS completed,
          SUM(
            ROUND(
              r.amount * COALESCE(p.settlement_rate, 1) *
              (1 - COALESCE(p.fee_rate, 0)),
              2
            )
          ) AS actualAmount
        FROM v2_ota_redemptions r
        LEFT JOIN v2_ota_products p ON p.id = r.product_id
        WHERE r.business_date >= ${monthStart}
          AND r.business_date < ${monthEnd}
          AND (r.product_id IS NULL OR p.is_brush = FALSE)
          ${
            storeIds?.length
              ? Prisma.sql`AND r.store_id IN (${Prisma.join(storeIds)})`
              : Prisma.empty
          }
        GROUP BY r.store_id, completed
      `),
      this.prisma.v2OperatingTarget.findMany({
        where: { ...scope, targetMonth: monthStart },
        select: { storeId: true, revenueTarget: true, profitTarget: true }
      }),
      this.prisma.v2ProductExclusionSnapshot.findMany({
        where: {
          ...scope,
          businessDate: { gte: monthStart, lt: monthEnd },
          kind: { in: ['SETTLED_DAILY', 'LIVE_TODAY'] }
        },
        select: {
          storeId: true,
          businessDate: true,
          kind: true,
          excludedAmount: true
        }
      }),
      this.prisma.v2StoreCostConfig.findMany({
        where: {
          ...scope,
          enabled: true,
          deletedAt: null,
          effectiveFrom: { lt: monthEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }]
        },
        select: {
          storeId: true,
          code: true,
          method: true,
          frequency: true,
          fixedAmount: true,
          rate: true,
          effectiveFrom: true
        }
      }),
      this.prisma.v2StoreCostCorrection.findMany({
        where: { ...scope, costMonth: monthStart }
      })
    ]);
    const effectiveCosts = this.applyMonthlyCostCorrections(
      this.latestMonthlyCostVersions(costs),
      costCorrections
    );
    const exclusionMap = new Map(
      exclusions.map((item) => [
        `${item.storeId}:${item.businessDate.toISOString().slice(0, 10)}:${item.kind}`,
        Number(item.excludedAmount)
      ])
    );
    const revenueMap = new Map<string, number>();
    const completedRevenueMap = new Map<string, number>();
    const addRevenue = (
      storeId: string,
      amount: number,
      completed: boolean
    ) => {
      revenueMap.set(storeId, (revenueMap.get(storeId) ?? 0) + amount);
      if (completed)
        completedRevenueMap.set(
          storeId,
          (completedRevenueMap.get(storeId) ?? 0) + amount
        );
    };
    for (const item of revenues) {
      const include =
        item.kind === 'SETTLED_DAILY'
          ? item.businessDate.getTime() !== today.getTime()
          : item.kind === 'LIVE_TODAY' &&
            item.businessDate.getTime() === today.getTime();
      if (include) {
        const excluded =
          exclusionMap.get(
            `${item.storeId}:${item.businessDate.toISOString().slice(0, 10)}:${item.kind}`
          ) ?? 0;
        const effective =
          Number(item.netFeeIncome ?? 0) +
          Number(item.rental ?? 0) +
          Math.max(0, Number(item.productSales ?? 0) - excluded);
        addRevenue(item.storeId, effective, item.businessDate < today);
      }
    }
    for (const item of redemptionTotals)
      addRevenue(
        item.storeId,
        Number(item.actualAmount ?? 0),
        Boolean(item.completed)
      );
    const targetMap = new Map(
      targets.map((item) => [
        item.storeId,
        {
          revenue: Number(item.revenueTarget),
          profit: Number(item.profitTarget ?? 0)
        }
      ])
    );
    const monthlyCost = (storeId: string, revenue: number) =>
      effectiveCosts
        .filter((item) => item.storeId === storeId)
        .reduce((sum, item) => {
          let amount = 0;
          if (item.method === 'RATE') amount = revenue * Number(item.rate ?? 0);
          else {
            const fixed = Number(item.fixedAmount ?? 0);
            amount = fixed;
            if (item.frequency === 'QUARTERLY') amount = fixed / 3;
            if (item.frequency === 'YEARLY') amount = fixed / 12;
          }
          if (
            item.method === 'FIXED' &&
            item.frequency === 'ONE_TIME' &&
            (item.effectiveFrom < monthStart || item.effectiveFrom >= monthEnd)
          )
            return sum;
          return sum + roundMetric(amount);
        }, 0);
    const items = stores
      .map((store) => {
        const monthTotal =
          Math.round((revenueMap.get(store.id) ?? 0) * 100) / 100;
        const targets = targetMap.get(store.id) ?? { revenue: 0, profit: 0 };
        const estimatedRevenue = projectMonthlyRevenue({
          month,
          currentMonth,
          todayDay: Number(todayText.slice(8, 10)),
          daysInMonth,
          actualRevenue: monthTotal,
          completedRevenue: completedRevenueMap.get(store.id) ?? 0
        }).forecastRevenue;
        const actualProfit =
          Math.round((monthTotal - monthlyCost(store.id, monthTotal)) * 100) /
          100;
        const estimatedProfit = elapsedDays
          ? Math.round(
              (estimatedRevenue - monthlyCost(store.id, estimatedRevenue)) * 100
            ) / 100
          : 0;
        return {
          storeId: store.id,
          monthTotal,
          estimatedRevenue,
          target: targets.revenue,
          completionRate: targets.revenue ? monthTotal / targets.revenue : 0,
          estimatedCompletionRate: targets.revenue
            ? estimatedRevenue / targets.revenue
            : 0,
          profitTarget: targets.profit,
          actualProfit,
          profitCompletionRate: targets.profit
            ? actualProfit / targets.profit
            : 0,
          estimatedProfit,
          estimatedProfitCompletionRate: targets.profit
            ? estimatedProfit / targets.profit
            : 0
        };
      })
      .sort(
        (a, b) =>
          b.completionRate - a.completionRate || b.monthTotal - a.monthTotal
      );
    return {
      month,
      elapsedDays,
      daysInMonth,
      items: items.map((item, index) => ({ ...item, rank: index + 1 }))
    };
  }

  async operatingDashboard(storeId: string, monthValue?: string) {
    const month = /^\d{4}-\d{2}$/.test(monthValue ?? '')
      ? monthValue!
      : new Date()
          .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
          .slice(0, 7);
    const monthStart = this.sourceDate(`${month}-01`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    const [performance, costs, costCorrections, investments] =
      await Promise.all([
        this.storePerformance(storeId, month),
        this.prisma.v2StoreCostConfig.findMany({
          where: {
            storeId,
            enabled: true,
            deletedAt: null,
            effectiveFrom: { lt: monthEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }]
          },
          orderBy: [{ category: 'asc' }, { name: 'asc' }]
        }),
        this.prisma.v2StoreCostCorrection.findMany({
          where: { storeId, costMonth: monthStart }
        }),
        this.prisma.v2StoreInvestment.findMany({
          where: {
            storeId,
            deletedAt: null,
            occurredOn: { gte: monthStart, lt: monthEnd }
          },
          orderBy: { occurredOn: 'asc' }
        })
      ]);
    const effectiveCosts = this.applyMonthlyCostCorrections(
      this.latestMonthlyCostVersions(costs),
      costCorrections
    );
    const currentMonth = new Date()
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
      .slice(0, 7);
    const isCurrentMonth = month === currentMonth;
    const [year, monthNumber] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const todayText = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
    const actualRevenue = Number(performance.monthTotal);
    const completedRevenue = isCurrentMonth
      ? actualRevenue - Number(performance.todayIncome)
      : actualRevenue;
    const forecast = projectMonthlyRevenue({
      month,
      currentMonth,
      todayDay: Number(todayText.slice(8, 10)),
      daysInMonth,
      actualRevenue,
      completedRevenue
    });
    const { elapsedDays, forecastRevenue } = forecast;
    const costItems = effectiveCosts.map((item) => {
      const fixed = Number(item.fixedAmount ?? 0);
      const rate = Number(item.rate ?? 0);
      let amount = item.method === 'RATE' ? forecastRevenue * rate : fixed;
      if (item.method === 'FIXED' && item.frequency === 'QUARTERLY')
        amount = fixed / 3;
      if (item.method === 'FIXED' && item.frequency === 'YEARLY')
        amount = fixed / 12;
      if (
        item.method === 'FIXED' &&
        item.frequency === 'ONE_TIME' &&
        (item.effectiveFrom < monthStart || item.effectiveFrom >= monthEnd)
      )
        amount = 0;
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        method: item.method,
        frequency: item.frequency,
        fixedAmount: fixed,
        rate,
        amount: Math.round(amount * 100) / 100
      };
    });
    const operatingExpense = costItems.reduce(
      (sum, item) => sum + item.amount,
      0
    );
    const investmentOutflow = investments.reduce(
      (sum, item) => sum + Number(item.amount),
      0
    );
    const forecastAvailable =
      month < currentMonth || (month === currentMonth && elapsedDays > 0);
    const forecastProfit = forecastAvailable
      ? forecastRevenue - operatingExpense
      : 0;
    return {
      store: performance.store,
      month,
      isCurrentMonth,
      elapsedDays,
      daysInMonth,
      actualRevenue: Math.round(actualRevenue * 100) / 100,
      forecastRevenue: Math.round(forecastRevenue * 100) / 100,
      operatingExpense: Math.round(operatingExpense * 100) / 100,
      investmentOutflow: Math.round(investmentOutflow * 100) / 100,
      totalCashOutflow:
        Math.round((operatingExpense + investmentOutflow) * 100) / 100,
      forecastProfit: Math.round(forecastProfit * 100) / 100,
      forecastProfitRate: forecastRevenue
        ? forecastProfit / forecastRevenue
        : 0,
      settledDays: performance.settledDays,
      liveIncluded: performance.liveIncluded,
      costItems
    };
  }

  async generatePerformanceSplit(
    storeId: string,
    dto: GenerateV2TargetAllocationsDto,
    user: CurrentUser
  ) {
    const monthStart = this.sourceDate(`${dto.targetMonth}-01`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    const store = await this.prisma.v2Store.findUnique({
      where: { id: storeId }
    });
    if (!store) throw new NotFoundException('门店不存在');
    const snapshots = await this.prisma.v2ShiftRevenueSnapshot.findMany({
      where: { storeId, businessDate: { gte: monthStart, lt: monthEnd } },
      orderBy: { shiftStartedAt: 'asc' }
    });
    for (const item of snapshots) {
      if (!item.storeShiftId && item.operatorLabel) {
        const shift = await this.resolveSourceStoreShift(
          storeId,
          item.operatorLabel,
          item.shiftStartedAt.toISOString(),
          item.shiftEndedAt.toISOString()
        );
        await this.prisma.v2ShiftRevenueSnapshot.update({
          where: { id: item.id },
          data: { storeShiftId: shift.id }
        });
        item.storeShiftId = shift.id;
      }
    }
    const shifts = await this.prisma.v2StoreShift.findMany({
      where: { storeId, enabled: true, deletedAt: null },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }]
    });
    if (!shifts.length)
      throw new BadRequestException(
        '本店尚无班次，至少同步一条 X 管家交班数据后才能拆分'
      );
    const target = await this.prisma.v2OperatingTarget.upsert({
      where: { storeId_targetMonth: { storeId, targetMonth: monthStart } },
      update: {
        revenueTarget: dto.revenueTarget,
        profitTarget: dto.profitTarget,
        ruleVersion: 'rolling-remaining-weighted-v2',
        status: 'PUBLISHED',
        updatedBy: user.id
      },
      create: {
        storeId,
        targetMonth: monthStart,
        revenueTarget: dto.revenueTarget,
        profitTarget: dto.profitTarget,
        ruleVersion: 'rolling-remaining-weighted-v2',
        status: 'PUBLISHED',
        createdBy: user.id,
        updatedBy: user.id
      }
    });
    const actualMap = new Map<string, number>();
    for (const item of snapshots)
      if (item.storeShiftId) {
        const key = `${item.businessDate.toISOString().slice(0, 10)}:${item.storeShiftId}`;
        actualMap.set(
          key,
          (actualMap.get(key) ?? 0) + Number(item.totalIncome)
        );
      }
    const slots: Array<{
      businessDate: Date;
      shiftId: string;
      weight: number;
    }> = [];
    const weekendRate = dto.weekendIncreaseRate ?? 0.15;
    for (
      let day = new Date(monthStart);
      day < monthEnd;
      day = new Date(day.getTime() + 86400000)
    ) {
      const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
      for (const shift of shifts)
        slots.push({
          businessDate: day,
          shiftId: shift.id,
          weight: weekend ? 1 + weekendRate : 1
        });
    }
    const totalWeight = slots.reduce((sum, item) => sum + item.weight, 0);
    const targetCents = Math.round(dto.revenueTarget * 100);
    let allocatedCents = 0;
    const rows = slots.map((slot, index) => {
      const cents =
        index === slots.length - 1
          ? targetCents - allocatedCents
          : Math.round((targetCents * slot.weight) / totalWeight);
      allocatedCents += cents;
      const key = `${slot.businessDate.toISOString().slice(0, 10)}:${slot.shiftId}`;
      return {
        targetId: target.id,
        businessDate: slot.businessDate,
        shiftId: slot.shiftId,
        category: 'TOTAL',
        targetAmount: cents / 100,
        actualAmount: actualMap.get(key) ?? 0
      };
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.v2TargetAllocation.deleteMany({
        where: { targetId: target.id }
      });
      await tx.v2TargetAllocation.createMany({ data: rows });
    });
    return this.performanceSplit(storeId, dto.targetMonth);
  }

  async performanceSplit(
    storeId: string,
    monthValue?: string,
    dateValue?: string
  ) {
    const month = /^\d{4}-\d{2}$/.test(monthValue ?? '')
      ? monthValue!
      : new Date()
          .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
          .slice(0, 7);
    const monthStart = this.sourceDate(`${month}-01`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    const target = await this.prisma.v2OperatingTarget.findUnique({
      where: { storeId_targetMonth: { storeId, targetMonth: monthStart } }
    });
    const date =
      /^\d{4}-\d{2}-\d{2}$/.test(dateValue ?? '') &&
      dateValue!.startsWith(month)
        ? dateValue!
        : null;
    const allocations = target
      ? await this.prisma.v2TargetAllocation.findMany({
          where: { targetId: target.id, category: 'TOTAL' },
          include: {
            shift: { select: { id: true, name: true, code: true, sort: true } }
          },
          orderBy: [{ businessDate: 'asc' }, { shift: { sort: 'asc' } }]
        })
      : [];
    const todayText = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
    const [
      actualRows,
      otaRows,
      revenueRows,
      shiftExclusions,
      dailyExclusions,
      costs,
      costCorrections
    ] = await Promise.all([
      this.prisma.v2ShiftRevenueSnapshot.findMany({
        where: {
          storeId,
          businessDate: { gte: monthStart, lt: monthEnd },
          storeShiftId: { not: null }
        },
        select: {
          id: true,
          businessDate: true,
          storeShiftId: true,
          totalIncome: true,
          netFeeIncome: true,
          productSales: true,
          rental: true
        }
      }),
      this.prisma.v2OtaRedemption.findMany({
        where: {
          storeId,
          businessDate: { gte: monthStart, lt: monthEnd },
          OR: [{ productId: null }, { product: { is: { isBrush: false } } }]
        },
        select: {
          businessDate: true,
          storeShiftId: true,
          amount: true,
          product: { select: { settlementRate: true, feeRate: true } }
        }
      }),
      this.prisma.v2RevenueSnapshot.findMany({
        where: {
          storeId,
          businessDate: { gte: monthStart, lt: monthEnd },
          kind: { in: ['SETTLED_DAILY', 'LIVE_TODAY'] }
        },
        select: {
          businessDate: true,
          kind: true,
          netFeeIncome: true,
          productSales: true,
          rental: true
        }
      }),
      this.prisma.v2ProductExclusionSnapshot.findMany({
        where: {
          storeId,
          businessDate: { gte: monthStart, lt: monthEnd },
          kind: 'SHIFT',
          shiftRevenueSnapshotId: { not: null }
        },
        select: { shiftRevenueSnapshotId: true, excludedAmount: true }
      }),
      this.prisma.v2ProductExclusionSnapshot.findMany({
        where: {
          storeId,
          businessDate: { gte: monthStart, lt: monthEnd },
          kind: { in: ['SETTLED_DAILY', 'LIVE_TODAY'] },
          sourceKey: 'DAY'
        },
        select: { businessDate: true, kind: true, excludedAmount: true }
      }),
      this.prisma.v2StoreCostConfig.findMany({
        where: {
          storeId,
          enabled: true,
          deletedAt: null,
          effectiveFrom: { lt: monthEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }]
        }
      }),
      this.prisma.v2StoreCostCorrection.findMany({
        where: { storeId, costMonth: monthStart }
      })
    ]);
    const effectiveCosts = this.applyMonthlyCostCorrections(
      this.latestMonthlyCostVersions(costs),
      costCorrections
    );
    const shiftExclusionMap = new Map(
      shiftExclusions.map((item) => [
        item.shiftRevenueSnapshotId!,
        Number(item.excludedAmount)
      ])
    );
    const componentMap = new Map<
      string,
      {
        total: number;
        netFee: number;
        product: number;
        productGross: number;
        productExcluded: number;
        rental: number;
        ota: number;
      }
    >();
    for (const item of actualRows) {
      const key = `${item.businessDate.toISOString().slice(0, 10)}:${item.storeShiftId}`;
      const value = componentMap.get(key) ?? {
        total: 0,
        netFee: 0,
        product: 0,
        productGross: 0,
        productExcluded: 0,
        rental: 0,
        ota: 0
      };
      const gross = Number(item.productSales);
      const excluded = shiftExclusionMap.get(item.id) ?? 0;
      const product = Math.max(0, gross - excluded);
      value.total +=
        Number(item.netFeeIncome) + product + Number(item.rental ?? 0);
      value.netFee += Number(item.netFeeIncome);
      value.product += product;
      value.productGross += gross;
      value.productExcluded += excluded;
      value.rental += Number(item.rental ?? 0);
      componentMap.set(key, value);
    }
    for (const item of otaRows) {
      if (!item.storeShiftId) continue;
      const key = `${item.businessDate.toISOString().slice(0, 10)}:${item.storeShiftId}`;
      const value = componentMap.get(key) ?? {
        total: 0,
        netFee: 0,
        product: 0,
        productGross: 0,
        productExcluded: 0,
        rental: 0,
        ota: 0
      };
      const actualAmount = this.otaActualAmount(item);
      value.total += actualAmount;
      value.ota += actualAmount;
      componentMap.set(key, value);
    }
    type SplitRow = Omit<
      (typeof allocations)[number],
      'targetAmount' | 'actualAmount'
    > & {
      targetAmount: number;
      actualAmount: number;
      actualNetFee: number;
      actualProductSales: number;
      actualProductGross: number;
      actualProductExcluded: number;
      actualRental: number;
      actualOta: number;
    };
    const otaDailyMap = new Map<string, number>();
    for (const item of otaRows) {
      const day = item.businessDate.toISOString().slice(0, 10);
      otaDailyMap.set(
        day,
        (otaDailyMap.get(day) ?? 0) + this.otaActualAmount(item)
      );
    }
    const dailyExclusionMap = new Map(
      dailyExclusions.map((item) => [
        `${item.businessDate.toISOString().slice(0, 10)}:${item.kind}`,
        Number(item.excludedAmount)
      ])
    );
    const authoritativeMap = new Map<
      string,
      {
        total: number;
        netFee: number;
        productGross: number;
        productExcluded: number;
        product: number;
        rental: number;
        ota: number;
        kind: string;
      }
    >();
    for (const item of revenueRows) {
      const day = item.businessDate.toISOString().slice(0, 10);
      const expectedKind =
        day === todayText && month === todayText.slice(0, 7)
          ? 'LIVE_TODAY'
          : 'SETTLED_DAILY';
      if (item.kind !== expectedKind) continue;
      const netFee = Number(item.netFeeIncome);
      const productGross = Number(item.productSales);
      const productExcluded = dailyExclusionMap.get(`${day}:${item.kind}`) ?? 0;
      const product = Math.max(0, productGross - productExcluded);
      const rental = Number(item.rental ?? 0);
      const ota = otaDailyMap.get(day) ?? 0;
      authoritativeMap.set(day, {
        total: netFee + product + rental + ota,
        netFee,
        productGross,
        productExcluded,
        product,
        rental,
        ota,
        kind: item.kind
      });
    }
    const dailyMap = new Map<
      string,
      {
        date: string;
        target: number;
        actual: number;
        shiftActual: number;
        reconciliation: number;
        sourceKind: string | null;
        shifts: SplitRow[];
      }
    >();
    for (const item of allocations) {
      const day = item.businessDate.toISOString().slice(0, 10);
      const authoritative = authoritativeMap.get(day);
      const entry = dailyMap.get(day) ?? {
        date: day,
        target: 0,
        actual: authoritative?.total ?? 0,
        shiftActual: 0,
        reconciliation: 0,
        sourceKind: authoritative?.kind ?? null,
        shifts: []
      };
      const components = componentMap.get(`${day}:${item.shiftId}`) ?? {
        total: Number(item.actualAmount ?? 0),
        netFee: 0,
        product: 0,
        productGross: 0,
        productExcluded: 0,
        rental: 0,
        ota: 0
      };
      entry.target += Number(item.targetAmount);
      entry.shiftActual += components.total;
      entry.shifts.push({
        ...item,
        targetAmount: Number(item.targetAmount),
        actualAmount: components.total,
        actualNetFee: components.netFee,
        actualProductSales: components.product,
        actualProductGross: components.productGross,
        actualProductExcluded: components.productExcluded,
        actualRental: components.rental,
        actualOta: components.ota
      });
      dailyMap.set(day, entry);
    }
    const baseDaily = [...dailyMap.values()];
    for (const item of baseDaily)
      item.reconciliation = item.actual - item.shiftActual;
    let remainingTarget = Number(target?.revenueTarget ?? 0);
    let remainingWeight = baseDaily.reduce(
      (sum, item) => sum + Math.max(0, item.target),
      0
    );
    for (const item of baseDaily) {
      const baseWeight = Math.max(0, item.target);
      const dynamicTarget =
        remainingWeight > 0
          ? (Math.max(0, remainingTarget) * baseWeight) / remainingWeight
          : 0;
      const shiftBaseTotal = item.shifts.reduce(
        (sum, shift) => sum + Math.max(0, shift.targetAmount),
        0
      );
      let allocated = 0;
      item.shifts.forEach((shift, index) => {
        const amount =
          index === item.shifts.length - 1
            ? dynamicTarget - allocated
            : (dynamicTarget * Math.max(0, shift.targetAmount)) /
              Math.max(1, shiftBaseTotal);
        shift.targetAmount = Math.round(amount * 100) / 100;
        allocated += shift.targetAmount;
      });
      item.target = Math.round(dynamicTarget * 100) / 100;
      remainingWeight -= baseWeight;
      remainingTarget -= item.date < todayText ? item.actual : dynamicTarget;
    }
    const allDaily = baseDaily.map((item) => ({
      ...item,
      difference: item.actual - item.target,
      completionRate: item.target ? item.actual / item.target : 0
    }));
    const daily = date
      ? allDaily.filter((item) => item.date === date)
      : allDaily;
    const visibleAuthoritative = [...authoritativeMap.entries()]
      .filter(([day]) => !date || day === date)
      .map(([, value]) => value);
    const summaryTarget = date
      ? Number(daily[0]?.target ?? 0)
      : Number(target?.revenueTarget ?? 0);
    const netFeeActual = visibleAuthoritative.reduce(
      (sum, item) => sum + item.netFee,
      0
    );
    const productGross = visibleAuthoritative.reduce(
      (sum, item) => sum + item.productGross,
      0
    );
    const productExcluded = visibleAuthoritative.reduce(
      (sum, item) => sum + item.productExcluded,
      0
    );
    const productActual = visibleAuthoritative.reduce(
      (sum, item) => sum + item.product,
      0
    );
    const otaActual = visibleAuthoritative.reduce(
      (sum, item) => sum + item.ota,
      0
    );
    const rentalActual = visibleAuthoritative.reduce(
      (sum, item) => sum + item.rental,
      0
    );
    const todayRealtime = authoritativeMap.get(todayText)?.total ?? 0;
    const totalActual = visibleAuthoritative.reduce(
      (sum, item) => sum + item.total,
      0
    );
    const daysInMonth = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
    ).getUTCDate();
    const fixedFactor = date ? 1 / daysInMonth : 1;
    const operatingCost = effectiveCosts.reduce((sum, item) => {
      if (item.method === 'RATE')
        return sum + totalActual * Number(item.rate ?? 0);
      let fixed = Number(item.fixedAmount ?? 0);
      if (item.frequency === 'QUARTERLY') fixed /= 3;
      if (item.frequency === 'YEARLY') fixed /= 12;
      if (
        item.frequency === 'ONE_TIME' &&
        (item.effectiveFrom < monthStart || item.effectiveFrom >= monthEnd)
      )
        fixed = 0;
      return sum + fixed * fixedFactor;
    }, 0);
    const profitTarget =
      Number(target?.profitTarget ?? 0) *
      (date && Number(target?.revenueTarget ?? 0)
        ? summaryTarget / Number(target!.revenueTarget)
        : 1);
    const actualProfit = totalActual - operatingCost;
    return {
      month,
      date,
      configured: Boolean(target),
      target,
      summary: {
        target: summaryTarget,
        actual: totalActual,
        netFeeActual,
        productGross,
        productExcluded,
        productActual,
        rentalActual,
        otaActual,
        todayRealtime,
        difference: totalActual - summaryTarget,
        completionRate: summaryTarget ? totalActual / summaryTarget : 0,
        operatingCost: Math.round(operatingCost * 100) / 100,
        profitTarget: Math.round(profitTarget * 100) / 100,
        actualProfit: Math.round(actualProfit * 100) / 100,
        profitDifference: Math.round((actualProfit - profitTarget) * 100) / 100,
        profitCompletionRate: profitTarget ? actualProfit / profitTarget : 0
      },
      daily
    };
  }

  private async resolveSourceStoreShift(
    storeId: string,
    label: string,
    startedAt: string,
    endedAt: string
  ) {
    const canonicalLabels = ['白班', '晚班', '夜班', '中班'];
    if (!canonicalLabels.includes(label)) {
      const shifts = await this.prisma.v2StoreShift.findMany({
        where: {
          storeId,
          name: { in: canonicalLabels },
          enabled: true,
          deletedAt: null
        }
      });
      const sourceMinutes = this.clockMinutes(this.sourceClock(startedAt));
      const nearest = shifts.reduce<(typeof shifts)[number] | null>(
        (best, item) => {
          if (!best) return item;
          const distance = (clock: string) => {
            const delta = Math.abs(this.clockMinutes(clock) - sourceMinutes);
            return Math.min(delta, 1440 - delta);
          };
          return distance(item.startsAt) < distance(best.startsAt)
            ? item
            : best;
        },
        null
      );
      if (nearest) return nearest;
      label =
        sourceMinutes >= 6 * 60 && sourceMinutes < 16 * 60 ? '白班' : '晚班';
    }
    const existing = await this.prisma.v2StoreShift.findFirst({
      where: { storeId, name: label, enabled: true, deletedAt: null }
    });
    if (existing) return existing;
    const code = `XM_${createHash('sha1').update(label).digest('hex').slice(0, 10).toUpperCase()}`;
    const start = this.sourceClock(startedAt);
    const end = this.sourceClock(endedAt);
    return this.prisma.v2StoreShift.upsert({
      where: { storeId_code: { storeId, code } },
      update: { name: label, enabled: true, deletedAt: null },
      create: {
        storeId,
        name: label,
        code,
        startsAt: start,
        endsAt: end,
        spansNextDay: end <= start,
        sort: 100
      }
    });
  }

  private sourceClock(value: string) {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value))
      return value.slice(11, 16);
    return new Date(value).toLocaleTimeString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private clockMinutes(value: string) {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  private async refreshAllocationActual(
    storeId: string,
    businessDate: Date,
    shiftId: string
  ) {
    const month = new Date(
      Date.UTC(businessDate.getUTCFullYear(), businessDate.getUTCMonth(), 1)
    );
    const target = await this.prisma.v2OperatingTarget.findUnique({
      where: { storeId_targetMonth: { storeId, targetMonth: month } }
    });
    if (!target) return;
    const actual = await this.prisma.v2ShiftRevenueSnapshot.aggregate({
      where: { storeId, businessDate, storeShiftId: shiftId },
      _sum: { totalIncome: true }
    });
    await this.prisma.v2TargetAllocation.updateMany({
      where: { targetId: target.id, businessDate, shiftId, category: 'TOTAL' },
      data: { actualAmount: Number(actual._sum.totalIncome ?? 0) }
    });
  }

  private assertWecomWebhook(value: string) {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'qyapi.weixin.qq.com' ||
      url.pathname !== '/cgi-bin/webhook/send' ||
      !url.searchParams.get('key')
    ) {
      throw new BadRequestException(
        '请输入有效的企业微信群机器人 Webhook 地址'
      );
    }
  }

  private webhookKey() {
    const secret =
      this.config.get<string>('WECOM_WEBHOOK_SECRET') ||
      this.config.get<string>('jwt.secret');
    if (!secret) throw new Error('缺少企微 Webhook 加密密钥');
    return createHash('sha256').update(secret).digest();
  }

  private encryptSecret(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.webhookKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final()
    ]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
  }

  private decryptSecret(value: string) {
    const [iv, tag, encrypted] = value.split('.');
    if (!iv || !tag || !encrypted) throw new Error('Webhook 密文格式无效');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.webhookKey(),
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final()
    ]).toString('utf8');
  }

  private maskWebhook(value: string) {
    const key = new URL(value).searchParams.get('key') ?? '';
    return `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=******${key.slice(-6)}`;
  }

  private wecomReportSvg(
    name: string,
    month: string,
    items: Array<{
      storeName: string;
      storeCode: string;
      monthTotal: number;
      target: number;
      completionRate: number;
      estimatedCompletionRate: number;
      actualProfit: number;
      profitTarget: number;
      profitCompletionRate: number;
      estimatedRevenue: number;
      estimatedProfit: number;
      estimatedProfitCompletionRate: number;
      rank: number;
    }>,
    summary: {
      totalTarget: number;
      totalRevenue: number;
      estimatedRevenue: number;
      estimatedCompletionRate: number;
      averageCompletionRate: number;
      totalProfitTarget: number;
      totalProfit: number;
      positiveEstimatedProfit: number;
      estimatedLossAbsolute: number;
      netEstimatedProfit: number;
      estimatedProfitCompletionRate: number;
      averageProfitCompletionRate: number;
    }
  ) {
    const esc = (value: unknown) =>
      String(value).replace(
        /[&<>"']/g,
        (char) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&apos;'
          })[char]!
      );
    const money = (value: number) =>
      `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const percent = (value: number) =>
      `${(Number(value || 0) * 100).toFixed(1)}%`;
    const compact = (value: string, length = 12) =>
      value.length > length ? `${value.slice(0, length - 1)}…` : value;
    const rowHeight = 126;
    const detailStart = 374;
    const height = 456 + items.length * rowHeight;
    const cards = [
      ['本月总目标', money(summary.totalTarget), '全部门店目标合计'],
      ['本月总收入', money(summary.totalRevenue)],
      [
        '本月预计收入',
        money(summary.estimatedRevenue),
        '按截至昨日的日均收入推算'
      ],
      [
        '预计完成率',
        summary.totalTarget
          ? percent(summary.estimatedCompletionRate)
          : '未设目标'
      ],
      ['当前平均完成率', percent(summary.averageCompletionRate)],
      ['本月利润目标', money(summary.totalProfitTarget)],
      ['本月总利润', money(summary.totalProfit)],
      [
        '本月预计利润总和',
        money(summary.positiveEstimatedProfit),
        `不含 -${money(summary.estimatedLossAbsolute)} 预计亏损`
      ],
      [
        '本月利润预计完成率',
        summary.totalProfitTarget
          ? percent(summary.estimatedProfitCompletionRate)
          : '未设目标'
      ],
      ['利润平均完成率', percent(summary.averageProfitCompletionRate)]
    ]
      .map(
        (item, index) =>
          `<g transform="translate(${40 + (index % 5) * 240},${118 + Math.floor(index / 5) * 104})"><rect width="224" height="90" rx="14" fill="#ffffff" stroke="#dbe7f5"/><text x="14" y="25" font-size="13" fill="#667085">${item[0]}</text><text x="14" y="55" font-size="19" font-weight="700" fill="${index === 6 && summary.totalProfit < 0 ? '#d03050' : '#172b4d'}">${esc(item[1])}</text>${item[2] ? `<text x="14" y="76" font-size="10" fill="${index === 7 ? '#d03050' : '#98a2b3'}">${esc(item[2])}</text>` : ''}</g>`
      )
      .join('');
    const rows = items
      .map((item, index) => {
        const y = detailStart + index * rowHeight;
        const rankColors = ['#ffd666', '#d9e0e8', '#dca67a'];
        const rankFill = rankColors[item.rank - 1] ?? '#edf2f7';
        const profitColor = item.actualProfit >= 0 ? '#18a058' : '#d03050';
        const estimatedProfitColor =
          item.estimatedProfit >= 0 ? '#18a058' : '#d03050';
        return `<g transform="translate(40,${y})"><rect width="1200" height="110" rx="14" fill="${item.rank === 1 ? '#fffaf0' : item.rank === 2 ? '#f8fafc' : item.rank === 3 ? '#fff8f3' : '#ffffff'}"/><circle cx="32" cy="34" r="18" fill="${rankFill}"/><text x="32" y="40" text-anchor="middle" font-size="14" font-weight="700" fill="#344054">${item.rank}</text><text x="62" y="31" font-size="17" font-weight="700" fill="#172b4d">${esc(compact(item.storeName, 11))}</text><text x="62" y="56" font-size="11" fill="#98a2b3">预计利润排名</text><text x="260" y="29" font-size="12" fill="#98a2b3">本月收入</text><text x="260" y="53" font-size="15" font-weight="700" fill="#2878d0">${esc(money(item.monthTotal))}</text><text x="260" y="79" font-size="12" fill="#667085">目标 ${esc(money(item.target))}</text><text x="455" y="29" font-size="12" fill="#98a2b3">营收完成率</text><text x="455" y="53" font-size="14" font-weight="700" fill="#344054">当前 ${item.target ? esc(percent(item.completionRate)) : '—'}</text><text x="455" y="79" font-size="14" font-weight="700" fill="#2878d0">预计 ${item.target ? esc(percent(item.estimatedCompletionRate)) : '—'}</text><text x="640" y="29" font-size="12" fill="#98a2b3">本月总利润</text><text x="640" y="57" font-size="16" font-weight="700" fill="${profitColor}">${esc(money(item.actualProfit))}</text><text x="790" y="29" font-size="12" fill="#98a2b3">预计利润 / 目标</text><text x="790" y="53" font-size="15" font-weight="700" fill="${estimatedProfitColor}">${esc(money(item.estimatedProfit))}</text><text x="790" y="79" font-size="12" fill="#667085">目标 ${item.profitTarget ? esc(money(item.profitTarget)) : '未设置'}</text><text x="1010" y="29" font-size="12" fill="#98a2b3">利润完成率</text><text x="1010" y="53" font-size="14" font-weight="700" fill="#344054">当前 ${item.profitTarget ? esc(percent(item.profitCompletionRate)) : '—'}</text><text x="1010" y="79" font-size="14" font-weight="700" fill="${item.estimatedProfitCompletionRate >= 1 ? '#18a058' : '#2878d0'}">预计 ${item.profitTarget ? esc(percent(item.estimatedProfitCompletionRate)) : '—'}</text></g>`;
      })
      .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="${height}" viewBox="0 0 1280 ${height}"><rect width="1280" height="${height}" fill="#f3f7fc"/><rect width="1280" height="336" fill="#eaf3ff"/><text x="40" y="50" font-size="16" fill="#2878d0">蓝猫门店运营系统</text><text x="40" y="86" font-size="27" font-weight="700" fill="#172b4d">${esc(name)}</text><text x="1240" y="52" text-anchor="end" font-size="16" fill="#667085">${esc(month.replace('-', '年'))}月经营进度</text>${cards}<text x="40" y="354" font-size="16" font-weight="700" fill="#344054">门店业绩明细 · 按预计利润完成率排名</text>${rows}<text x="640" y="${height - 20}" text-anchor="middle" font-size="12" fill="#98a2b3">生成时间 ${esc(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }))}</text></svg>`;
  }

  // Prisma serializes MySQL DATE values from the UTC calendar date. Using a
  // +08:00 instant here moves midnight to the previous UTC day and causes
  // adjacent business dates to collide. DATE-only fields must use UTC midnight.
  private sourceDate(value: string) {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  }
  private latestMonthlyCostVersions<
    T extends { storeId: string; code: string; effectiveFrom: Date }
  >(costs: T[]) {
    const versions = new Map<string, T>();
    for (const item of costs) {
      const key = `${item.storeId}:${item.code}`;
      const current = versions.get(key);
      if (!current || item.effectiveFrom > current.effectiveFrom)
        versions.set(key, item);
    }
    return [...versions.values()];
  }
  private applyMonthlyCostCorrections<
    T extends { storeId: string; code: string },
    C extends {
      storeId: string;
      code: string;
      name: string;
      category: string;
      method: T extends { method: infer M } ? M : unknown;
      frequency: T extends { frequency: infer F } ? F : unknown;
      fixedAmount: T extends { fixedAmount: infer A } ? A : unknown;
      rate: T extends { rate: infer R } ? R : unknown;
      formula: T extends { formula: infer O } ? O : unknown;
      id: string;
      costMonth: Date;
    }
  >(costs: T[], corrections: C[]): T[] {
    const correctionMap = new Map(
      corrections.map((item) => [`${item.storeId}:${item.code}`, item])
    );
    const result = costs.map((item) => {
      const correction = correctionMap.get(`${item.storeId}:${item.code}`);
      if (!correction) return item;
      return {
        ...item,
        name: correction.name,
        category: correction.category,
        method: correction.method,
        frequency: correction.frequency,
        fixedAmount: correction.fixedAmount,
        rate: correction.rate,
        formula: correction.formula
      } as T;
    });
    const existingKeys = new Set(
      costs.map((item) => `${item.storeId}:${item.code}`)
    );
    for (const correction of corrections) {
      if (existingKeys.has(`${correction.storeId}:${correction.code}`))
        continue;
      result.push({
        ...correction,
        effectiveFrom: correction.costMonth,
        effectiveTo: null
      } as unknown as T);
    }
    return result;
  }
  private sourceDateTime(value: string) {
    return new Date(`${value.replace(' ', 'T')}+08:00`);
  }
  private sourceHash(value: unknown) {
    return businessSourceHash(value);
  }
  private otaActualAmount(item: {
    amount: unknown;
    product?: { settlementRate?: unknown; feeRate?: unknown } | null;
  }) {
    const settlementRate = Number(item.product?.settlementRate ?? 1);
    const feeRate = Number(item.product?.feeRate ?? 0);
    return (
      Math.round(
        Number(item.amount ?? 0) * settlementRate * (1 - feeRate) * 100
      ) / 100
    );
  }

  async inheritShifts(storeId: string) {
    const templates = await this.prisma.v2ShiftTemplate.findMany({
      where: { enabled: true, deletedAt: null }
    });
    await this.prisma.$transaction(
      templates.map((item) =>
        this.prisma.v2StoreShift.upsert({
          where: { storeId_templateId: { storeId, templateId: item.id } },
          update: {
            name: item.name,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            spansNextDay: item.spansNextDay,
            enabled: true,
            deletedAt: null
          },
          create: {
            storeId,
            templateId: item.id,
            name: item.name,
            code: item.code,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            spansNextDay: item.spansNextDay,
            sort: item.sort
          }
        })
      )
    );
    return this.prisma.v2StoreShift.findMany({
      where: { storeId, deletedAt: null },
      orderBy: { sort: 'asc' }
    });
  }

  async listStoreSchedules(
    storeId: string,
    month: string | undefined,
    user: CurrentUser
  ) {
    this.assertScheduleStore(user, storeId);
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new BadRequestException('月份格式无效');
    const monthStart = month
      ? new Date(`${month}-01T00:00:00.000Z`)
      : undefined;
    const monthEnd = monthStart
      ? new Date(
          Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)
        )
      : undefined;
    return this.prisma.v2SchedulePeriod.findMany({
      where: {
        storeId,
        ...(monthStart && monthEnd
          ? { startsOn: { lt: monthEnd }, endsOn: { gte: monthStart } }
          : {})
      },
      include: { _count: { select: { assignments: true } } },
      orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
      take: 24
    });
  }

  async saveStoreShift(
    storeId: string,
    dto: SaveV2StoreShiftDto,
    user: CurrentUser
  ) {
    this.assertScheduleStore(user, storeId);
    if (dto.startsAt === dto.endsAt)
      throw new BadRequestException('班次开始和结束时间不能相同');
    const data = {
      name: dto.name.trim(),
      code: dto.code.trim().toUpperCase(),
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      spansNextDay: Boolean(dto.spansNextDay),
      sort: dto.sort ?? 0,
      enabled: true,
      deletedAt: null
    };
    if (!dto.id)
      return this.prisma.v2StoreShift.create({ data: { storeId, ...data } });
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.v2StoreShift.findFirst({
        where: { id: dto.id, storeId, deletedAt: null },
        include: { _count: { select: { assignments: true } } }
      });
      if (!current) throw new NotFoundException('门店班次不存在');
      if (!current._count.assignments)
        return tx.v2StoreShift.update({ where: { id: current.id }, data });
      await tx.v2StoreShift.update({
        where: { id: current.id },
        data: {
          code: `${current.code}_ARCHIVED_${current.id.slice(-6)}`,
          enabled: false
        }
      });
      return tx.v2StoreShift.create({
        data: { storeId, ...data, templateId: null }
      });
    });
  }

  async disableStoreShift(storeId: string, shiftId: string, user: CurrentUser) {
    this.assertScheduleStore(user, storeId);
    const shift = await this.prisma.v2StoreShift.findFirst({
      where: { id: shiftId, storeId, deletedAt: null },
      select: { id: true }
    });
    if (!shift) throw new NotFoundException('门店班次不存在');
    return this.prisma.v2StoreShift.update({
      where: { id: shiftId },
      data: { enabled: false, deletedAt: new Date() }
    });
  }

  async createSchedulePeriod(
    dto: CreateV2SchedulePeriodDto,
    user: CurrentUser
  ) {
    this.assertScheduleStore(user, dto.storeId);
    const startsOn = new Date(dto.startsOn);
    const endsOn = new Date(dto.endsOn);
    if (endsOn < startsOn)
      throw new BadRequestException('排班结束日期不能早于开始日期');
    if ((endsOn.getTime() - startsOn.getTime()) / 86_400_000 + 1 > 31)
      throw new BadRequestException('单个排班周期最长 31 天');
    const overlap = await this.prisma.v2SchedulePeriod.count({
      where: {
        storeId: dto.storeId,
        startsOn: { lte: endsOn },
        endsOn: { gte: startsOn }
      }
    });
    if (overlap) throw new BadRequestException('所选日期与已有排班周期重叠');
    return this.prisma.v2SchedulePeriod.create({
      data: {
        storeId: dto.storeId,
        startsOn,
        endsOn,
        createdBy: user.id,
        updatedBy: user.id
      }
    });
  }

  async scheduleDetail(id: string, user: CurrentUser) {
    const period = await this.prisma.v2SchedulePeriod.findUnique({
      where: { id },
      include: {
        store: {
          select: { id: true, name: true, shortName: true, code: true }
        },
        assignments: {
          include: {
            shift: true,
            employee: { select: { id: true, name: true, employeeNo: true } },
            position: { select: { id: true, name: true, code: true } }
          },
          orderBy: [{ workDate: 'asc' }, { shift: { sort: 'asc' } }]
        }
      }
    });
    if (!period) throw new NotFoundException('排班周期不存在');
    this.assertScheduleStore(user, period.storeId);
    return period;
  }

  async storeScheduleOptions(storeId: string, user: CurrentUser) {
    this.assertScheduleStore(user, storeId);
    const [shifts, employments, positions, formerRows, successions] =
      await Promise.all([
        this.prisma.v2StoreShift.findMany({
          where: { storeId, enabled: true, deletedAt: null },
          orderBy: [{ sort: 'asc' }, { name: 'asc' }]
        }),
        this.prisma.v2Employment.findMany({
          where: { storeId, endedOn: null, deletedAt: null },
          include: {
            employee: {
              select: { id: true, name: true, employeeNo: true, status: true }
            },
            position: { select: { id: true, name: true, code: true } }
          },
          orderBy: { employee: { name: 'asc' } }
        }),
        this.prisma.v2StorePosition.findMany({
          where: { storeId, enabled: true, deletedAt: null },
          select: { id: true, name: true, code: true },
          orderBy: [{ name: 'asc' }, { code: 'asc' }]
        }),
        this.prisma.v2ScheduleAssignment.findMany({
          where: { period: { storeId } },
          distinct: ['employeeId'],
          select: {
            employee: { select: { id: true, name: true, employeeNo: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 200
        }),
        this.prisma.v2ScheduleSuccession.findMany({
          where: { storeId },
          orderBy: { updatedAt: 'desc' }
        })
      ]);
    const employmentById = new Map(employments.map((item) => [item.id, item]));
    return {
      shifts,
      employments,
      positions,
      formerEmployees: formerRows.map((item) => item.employee),
      successions: successions.map((item) => ({
        ...item,
        successorEmployment:
          employmentById.get(item.successorEmploymentId) ?? null
      }))
    };
  }

  async saveScheduleSuccession(
    storeId: string,
    dto: SaveV2ScheduleSuccessionDto,
    user: CurrentUser
  ) {
    this.assertScheduleStore(user, storeId);
    const successor = await this.prisma.v2Employment.findFirst({
      where: {
        id: dto.successorEmploymentId,
        storeId,
        endedOn: null,
        deletedAt: null
      },
      select: { id: true, employeeId: true }
    });
    if (!successor)
      throw new BadRequestException('接班员工不在本店当前在岗名单中');
    if (successor.employeeId === dto.predecessorEmployeeId)
      throw new BadRequestException('交接前后不能是同一名员工');
    const predecessorExists = await this.prisma.v2ScheduleAssignment.count({
      where: { employeeId: dto.predecessorEmployeeId, period: { storeId } }
    });
    if (!predecessorExists)
      throw new BadRequestException('原员工在本店没有可继承的历史排班');
    const effectiveFrom = new Date(dto.effectiveFrom);
    return this.prisma.v2ScheduleSuccession.upsert({
      where: {
        storeId_predecessorEmployeeId: {
          storeId,
          predecessorEmployeeId: dto.predecessorEmployeeId
        }
      },
      create: {
        storeId,
        predecessorEmployeeId: dto.predecessorEmployeeId,
        successorEmploymentId: dto.successorEmploymentId,
        effectiveFrom,
        createdBy: user.id,
        updatedBy: user.id
      },
      update: {
        successorEmploymentId: dto.successorEmploymentId,
        effectiveFrom,
        updatedBy: user.id
      }
    });
  }

  async deleteScheduleSuccession(
    storeId: string,
    id: string,
    user: CurrentUser
  ) {
    this.assertScheduleStore(user, storeId);
    const item = await this.prisma.v2ScheduleSuccession.findFirst({
      where: { id, storeId },
      select: { id: true }
    });
    if (!item) throw new NotFoundException('排班工作继承记录不存在');
    return this.prisma.v2ScheduleSuccession.delete({ where: { id } });
  }

  async createAssignment(
    dto: CreateV2ScheduleAssignmentDto,
    user: CurrentUser
  ) {
    const period = await this.prisma.v2SchedulePeriod.findUnique({
      where: { id: dto.periodId }
    });
    if (!period || period.status === 'LOCKED')
      throw new BadRequestException('排班周期不存在或已锁定');
    this.assertScheduleStore(user, period.storeId);
    const workDate = new Date(dto.workDate);
    if (workDate < period.startsOn || workDate > period.endsOn)
      throw new BadRequestException('排班日期不在周期范围内');
    if (dto.isRest && (dto.shiftId || dto.overtime))
      throw new BadRequestException('休息日不能同时设置班次或加班');
    if (!dto.isRest && !dto.shiftId)
      throw new BadRequestException('上班请选择班次');
    const [shift, employment, overtimePosition, existing] = await Promise.all([
      dto.shiftId
        ? this.prisma.v2StoreShift.findFirst({
            where: {
              id: dto.shiftId,
              storeId: period.storeId,
              enabled: true,
              deletedAt: null
            }
          })
        : Promise.resolve(null),
      this.prisma.v2Employment.findFirst({
        where: {
          employeeId: dto.employeeId,
          positionId: dto.overtime ? undefined : dto.positionId,
          storeId: period.storeId,
          startedOn: { lte: workDate },
          OR: [{ endedOn: null }, { endedOn: { gte: workDate } }],
          deletedAt: null
        }
      }),
      dto.overtime
        ? this.prisma.v2StorePosition.findFirst({
            where: {
              id: dto.positionId,
              storeId: period.storeId,
              enabled: true,
              deletedAt: null
            },
            select: { id: true }
          })
        : Promise.resolve(null),
      this.prisma.v2ScheduleAssignment.findMany({
        where: { periodId: dto.periodId, workDate, employeeId: dto.employeeId },
        select: { id: true, isRest: true, overtime: true }
      })
    ]);
    if (
      (!dto.isRest && !shift) ||
      !employment ||
      (dto.overtime && !overtimePosition)
    )
      throw new BadRequestException('班次或员工岗位不属于排班门店');
    if (existing.some((item) => item.overtime === Boolean(dto.overtime)))
      throw new BadRequestException(
        dto.overtime ? '该员工当日已有加班安排' : '该员工当日已排班或休息'
      );
    if (dto.overtime && existing.some((item) => !item.overtime && !item.isRest))
      throw new BadRequestException('当日在班员工不能再安排加班');
    if (!dto.overtime && !dto.isRest && existing.some((item) => item.overtime))
      throw new BadRequestException('该员工当日已有加班安排');
    return this.prisma.v2ScheduleAssignment.create({
      data: {
        periodId: dto.periodId,
        workDate,
        shiftId: dto.isRest ? null : dto.shiftId,
        employeeId: dto.employeeId,
        positionId: dto.positionId,
        isRest: Boolean(dto.isRest),
        overtime: Boolean(dto.overtime),
        note: dto.note,
        createdBy: user.id,
        updatedBy: user.id
      }
    });
  }

  async applyScheduleCycle(
    id: string,
    dto: ApplyV2ScheduleCycleDto,
    user: CurrentUser
  ) {
    if (!dto.employmentIds.length || dto.employmentIds.length > 30)
      throw new BadRequestException('请选择 1 至 30 名员工');
    if (!dto.cycle.length || dto.cycle.length > 31)
      throw new BadRequestException('排班循环必须包含 1 至 31 天');
    if (dto.cycle.some((value) => value !== null && typeof value !== 'string'))
      throw new BadRequestException('排班循环只能包含班次或休息');
    return this.prisma.$transaction(
      async (tx) => {
        const period = await tx.v2SchedulePeriod.findUnique({ where: { id } });
        if (!period || period.status !== 'DRAFT')
          throw new BadRequestException('仅草稿排班可批量套用循环');
        this.assertScheduleStore(user, period.storeId);
        const employments = await tx.v2Employment.findMany({
          where: {
            id: { in: dto.employmentIds },
            storeId: period.storeId,
            endedOn: null,
            deletedAt: null
          },
          select: {
            id: true,
            employeeId: true,
            positionId: true,
            startedOn: true,
            endedOn: true
          }
        });
        if (employments.length !== new Set(dto.employmentIds).size)
          throw new BadRequestException('部分员工岗位已失效或不属于本店');
        const shiftIds = [
          ...new Set(
            dto.cycle.filter((value): value is string => Boolean(value))
          )
        ];
        const shifts = shiftIds.length
          ? await tx.v2StoreShift.findMany({
              where: {
                id: { in: shiftIds },
                storeId: period.storeId,
                enabled: true,
                deletedAt: null
              },
              select: { id: true }
            })
          : [];
        if (shifts.length !== shiftIds.length)
          throw new BadRequestException('循环中包含无效班次');
        const protectedCount = await tx.v2ScheduleAssignment.count({
          where: {
            periodId: id,
            employeeId: { in: employments.map((item) => item.employeeId) },
            overtime: false,
            OR: [
              { lockedAt: { not: null } },
              { attendancePunches: { some: {} } },
              { attendanceCorrections: { some: {} } }
            ]
          }
        });
        if (protectedCount)
          throw new BadRequestException(
            '选中员工已有锁定排班或考勤记录，不能批量覆盖'
          );
        await tx.v2ScheduleAssignment.deleteMany({
          where: {
            periodId: id,
            employeeId: { in: employments.map((item) => item.employeeId) },
            overtime: false
          }
        });
        const starts = period.startsOn.getTime();
        const days =
          Math.floor((period.endsOn.getTime() - starts) / 86_400_000) + 1;
        const ordered = dto.employmentIds.map((employmentId) =>
          employments.find((item) => item.id === employmentId)!
        );
        const rows = ordered.flatMap((employment, employeeIndex) => {
          return Array.from({ length: days }, (_, dayIndex) => {
            const workDate = new Date(starts + dayIndex * 86_400_000);
            if (
              workDate < employment.startedOn ||
              (employment.endedOn && workDate > employment.endedOn)
            )
              return null;
            const shiftId = scheduleCycleValue(
              dto.cycle,
              dayIndex,
              employeeIndex,
              ordered.length,
              Boolean(dto.stagger)
            );
            return {
              periodId: id,
              workDate,
              shiftId,
              employeeId: employment.employeeId,
              positionId: employment.positionId,
              isRest: !shiftId,
              overtime: false,
              createdBy: user.id,
              updatedBy: user.id
            };
          }).filter((row): row is NonNullable<typeof row> => Boolean(row));
        });
        await tx.v2ScheduleAssignment.createMany({ data: rows });
        return { created: rows.length, employees: ordered.length, days };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async copyPreviousSchedule(id: string, user: CurrentUser) {
    return this.prisma.$transaction(
      async (tx) => {
        const target = await tx.v2SchedulePeriod.findUnique({ where: { id } });
        if (!target || target.status !== 'DRAFT')
          throw new BadRequestException('仅草稿排班可复制上月安排');
        this.assertScheduleStore(user, target.storeId);
        const source = await tx.v2SchedulePeriod.findFirst({
          where: {
            storeId: target.storeId,
            endsOn: { lt: target.startsOn },
            status: { in: ['PUBLISHED', 'LOCKED'] }
          },
          orderBy: { endsOn: 'desc' },
          include: {
            assignments: {
              where: { overtime: false },
              include: { employee: { select: { name: true } } },
              orderBy: [{ workDate: 'asc' }, { employeeId: 'asc' }]
            }
          }
        });
        if (!source?.assignments.length)
          throw new BadRequestException('未找到可沿用的已发布历史排班');
        const [employments, successions] = await Promise.all([
          tx.v2Employment.findMany({
            where: {
              storeId: target.storeId,
              deletedAt: null,
              startedOn: { lte: target.endsOn },
              OR: [{ endedOn: null }, { endedOn: { gte: target.startsOn } }]
            },
            select: {
              id: true,
              employeeId: true,
              positionId: true,
              startedOn: true,
              endedOn: true
            }
          }),
          tx.v2ScheduleSuccession.findMany({
            where: {
              storeId: target.storeId,
              effectiveFrom: { lte: target.endsOn }
            }
          })
        ]);
        const employmentById = new Map(
          employments.map((item) => [item.id, item])
        );
        const successionByEmployee = new Map(
          successions.map((item) => [item.predecessorEmployeeId, item])
        );
        const sourceDays =
          Math.floor(
            (source.endsOn.getTime() - source.startsOn.getTime()) / 86_400_000
          ) + 1;
        const targetDays =
          Math.floor(
            (target.endsOn.getTime() - target.startsOn.getTime()) / 86_400_000
          ) + 1;
        const byOffset = new Map<number, typeof source.assignments>();
        for (const item of source.assignments) {
          const offset = Math.floor(
            (item.workDate.getTime() - source.startsOn.getTime()) / 86_400_000
          );
          const rows = byOffset.get(offset) ?? [];
          rows.push(item);
          byOffset.set(offset, rows);
        }
        const missing = new Set<string>();
        const targetKeys = new Set<string>();
        const rows = Array.from({ length: targetDays }).flatMap(
          (_, dayIndex) => {
            const sourceRows =
              byOffset.get(sourceOffsetForTargetDay(dayIndex, sourceDays)) ??
              [];
            return sourceRows.flatMap((item) => {
              const workDate = new Date(
                target.startsOn.getTime() + dayIndex * 86_400_000
              );
              const directEmployment = employments.find(
                (employment) =>
                  employment.employeeId === item.employeeId &&
                  employment.positionId === item.positionId &&
                  employment.startedOn <= workDate &&
                  (!employment.endedOn || employment.endedOn >= workDate)
              );
              const succession = successionByEmployee.get(item.employeeId);
              const successor =
                succession && succession.effectiveFrom <= workDate
                  ? employmentById.get(succession.successorEmploymentId)
                  : undefined;
              const employment =
                directEmployment ??
                (successor &&
                successor.startedOn <= workDate &&
                (!successor.endedOn || successor.endedOn >= workDate)
                  ? successor
                  : undefined);
              if (!employment) {
                missing.add(item.employee.name);
                return [];
              }
              const key = `${employment.employeeId}:${workDate.toISOString().slice(0, 10)}`;
              if (targetKeys.has(key))
                throw new BadRequestException(
                  '多个历史岗位被继承给同一员工，请先调整工作继承'
                );
              targetKeys.add(key);
              return [
                {
                  periodId: target.id,
                  workDate,
                  shiftId: item.shiftId,
                  employeeId: employment.employeeId,
                  positionId: employment.positionId,
                  isRest: item.isRest,
                  overtime: false,
                  note: item.note,
                  createdBy: user.id,
                  updatedBy: user.id
                }
              ];
            });
          }
        );
        if (missing.size)
          throw new BadRequestException(
            `请先为离职员工设置工作继承：${[...missing].join('、')}`
          );
        const protectedCount = await tx.v2ScheduleAssignment.count({
          where: {
            periodId: target.id,
            overtime: false,
            OR: [
              { lockedAt: { not: null } },
              { attendancePunches: { some: {} } },
              { attendanceCorrections: { some: {} } }
            ]
          }
        });
        if (protectedCount)
          throw new BadRequestException(
            '当前排班已有锁定或考勤记录，不能整月覆盖'
          );
        await tx.v2ScheduleAssignment.deleteMany({
          where: { periodId: target.id, overtime: false }
        });
        await tx.v2ScheduleAssignment.createMany({ data: rows });
        return { sourcePeriodId: source.id, created: rows.length };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async updateAssignment(
    id: string,
    dto: UpdateV2ScheduleAssignmentDto,
    user: CurrentUser
  ) {
    const assignment = await this.prisma.v2ScheduleAssignment.findUnique({
      where: { id },
      include: {
        period: true,
        _count: {
          select: { attendancePunches: true, attendanceCorrections: true }
        }
      }
    });
    if (
      !assignment ||
      assignment.period.status === 'LOCKED' ||
      assignment.lockedAt
    )
      throw new BadRequestException('排班不存在或已锁定');
    this.assertScheduleStore(user, assignment.period.storeId);
    if (
      assignment._count.attendancePunches ||
      assignment._count.attendanceCorrections
    )
      throw new BadRequestException('已有打卡或补卡记录的排班不可修改');
    if (dto.isRest && dto.shiftId)
      throw new BadRequestException('休息日不能同时设置班次');
    if (assignment.overtime && dto.isRest)
      throw new BadRequestException('加班安排不能改为休息日');
    if (!dto.isRest && !dto.shiftId)
      throw new BadRequestException('上班请选择班次');
    if (dto.shiftId) {
      const shift = await this.prisma.v2StoreShift.findFirst({
        where: {
          id: dto.shiftId,
          storeId: assignment.period.storeId,
          enabled: true,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!shift) throw new BadRequestException('班次不属于排班门店');
    }
    if (assignment.overtime && dto.positionId) {
      const position = await this.prisma.v2StorePosition.findFirst({
        where: {
          id: dto.positionId,
          storeId: assignment.period.storeId,
          enabled: true,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!position) throw new BadRequestException('加班岗位不属于排班门店');
    }
    return this.prisma.v2ScheduleAssignment.update({
      where: { id },
      data: {
        shiftId: dto.isRest ? null : dto.shiftId,
        positionId: assignment.overtime
          ? (dto.positionId ?? assignment.positionId)
          : assignment.positionId,
        isRest: Boolean(dto.isRest),
        note: dto.note?.trim() || null,
        updatedBy: user.id
      }
    });
  }

  async deleteAssignment(id: string, user: CurrentUser) {
    const assignment = await this.prisma.v2ScheduleAssignment.findUnique({
      where: { id },
      include: {
        period: true,
        _count: {
          select: { attendancePunches: true, attendanceCorrections: true }
        }
      }
    });
    if (
      !assignment ||
      assignment.period.status === 'LOCKED' ||
      assignment.lockedAt
    )
      throw new BadRequestException('排班不存在或已锁定');
    this.assertScheduleStore(user, assignment.period.storeId);
    if (
      assignment._count.attendancePunches ||
      assignment._count.attendanceCorrections
    )
      throw new BadRequestException('已有打卡或补卡记录的排班不可删除');
    try {
      return await this.prisma.v2ScheduleAssignment.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException('已有打卡或补卡记录的排班不可删除');
      }
      throw error;
    }
  }

  async publishSchedule(id: string, user: CurrentUser) {
    const period = await this.prisma.v2SchedulePeriod.findUnique({
      where: { id },
      select: { storeId: true }
    });
    if (!period) throw new NotFoundException('排班周期不存在');
    this.assertScheduleStore(user, period.storeId);
    const empty = await this.prisma.v2ScheduleAssignment.count({
      where: { periodId: id }
    });
    if (!empty) throw new BadRequestException('请先完成排班再发布');
    return this.prisma.v2SchedulePeriod.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() }
    });
  }

  async lockSchedule(id: string, user: CurrentUser) {
    const period = await this.prisma.v2SchedulePeriod.findUnique({
      where: { id },
      select: { storeId: true }
    });
    if (!period) throw new NotFoundException('排班周期不存在');
    this.assertScheduleStore(user, period.storeId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.v2ScheduleAssignment.updateMany({
        where: { periodId: id },
        data: { lockedAt: now }
      });
      return tx.v2SchedulePeriod.update({
        where: { id },
        data: { status: 'LOCKED', lockedAt: now }
      });
    });
  }

  private assertScheduleStore(user: CurrentUser, storeId: string) {
    if (
      !user.roles.includes('super_admin') &&
      !user.accessibleStoreIds.includes(storeId)
    )
      throw new ForbiddenException('无权管理该门店排班');
  }

  createTarget(dto: CreateV2OperatingTargetDto, user: CurrentUser) {
    return this.generatePerformanceSplit(
      dto.storeId,
      {
        targetMonth: dto.targetMonth,
        revenueTarget: dto.revenueTarget,
        profitTarget: dto.profitTarget
      },
      user
    );
  }

  async createScorePlan(dto: CreateV2ScorePlanDto) {
    const latest = await this.prisma.v2ScorePlan.aggregate({
      where: { code: dto.code },
      _max: { version: true }
    });
    return this.prisma.v2ScorePlan.create({
      data: { ...dto, version: (latest._max.version ?? 0) + 1 }
    });
  }

  async upsertDataSource(dto: UpsertV2DataSourceDto, user: CurrentUser) {
    const store = await this.prisma.v2Store.findFirst({
      where: { id: dto.storeId, deletedAt: null, status: { not: 'CLOSED' } },
      select: { id: true }
    });
    if (!store)
      throw new BadRequestException(
        '只能为已确认且未关闭的正式门店建立数据源映射'
      );
    const externalStoreId = dto.externalStoreId.trim().toUpperCase();
    const conflict = await this.prisma.v2DataSourceConnection.findUnique({
      where: {
        sourceSystem_externalStoreId: {
          sourceSystem: 'X_MANAGER',
          externalStoreId
        }
      },
      select: { storeId: true }
    });
    if (conflict && conflict.storeId !== dto.storeId)
      throw new BadRequestException('该外部门店已绑定其他正式门店');
    const data = {
      externalStoreId,
      externalStoreName: dto.externalStoreName,
      enabledModules: dto.enabledModules,
      updatedBy: user.id
    };
    return this.prisma.$transaction(async (tx) => {
      const connection = await tx.v2DataSourceConnection.upsert({
        where: { storeId: dto.storeId },
        update: data,
        create: { storeId: dto.storeId, ...data, createdBy: user.id }
      });
      await tx.v2ExternalStoreCandidate.updateMany({
        where: { sourceSystem: 'X_MANAGER', externalStoreId },
        data: {
          status: 'MATCHED',
          reviewedAt: new Date(),
          reviewedBy: user.id
        }
      });
      return connection;
    });
  }

  async matchExternalStoreCandidate(
    candidateId: string,
    dto: MatchV2ExternalStoreCandidateDto,
    user: CurrentUser
  ) {
    const candidate = await this.prisma.v2ExternalStoreCandidate.findUnique({
      where: { id: candidateId }
    });
    if (!candidate) throw new NotFoundException('待匹配门店不存在');
    if (candidate.status !== 'PENDING')
      throw new BadRequestException('该外部门店已完成审核，不能重复绑定');
    const storeConnection = await this.prisma.v2DataSourceConnection.findUnique(
      { where: { storeId: dto.storeId } }
    );
    if (
      storeConnection &&
      storeConnection.externalStoreId.trim().toUpperCase() !==
        candidate.externalStoreId.trim().toUpperCase()
    )
      throw new BadRequestException('该正式门店已绑定其他外部门店');
    return this.upsertDataSource(
      {
        storeId: dto.storeId,
        externalStoreId: candidate.externalStoreId,
        externalStoreName: candidate.externalStoreName ?? undefined,
        enabledModules: dto.enabledModules ?? [...CAPTURE_MODULES]
      },
      user
    );
  }

  async checkSession(connectionId: string) {
    const connection = await this.prisma.v2DataSourceConnection.findUnique({
      where: { id: connectionId }
    });
    if (!connection) throw new NotFoundException('X 管家连接不存在');
    try {
      const result = await this.fetchCollector(
        '/bridge/bluecat/v1/session/status'
      );
      const valid = Boolean((result as { loggedIn?: boolean }).loggedIn);
      return this.prisma.v2DataSourceConnection.update({
        where: { id: connectionId },
        data: {
          sessionStatus: valid ? 'VALID' : 'EXPIRED',
          lastCheckedAt: new Date(),
          lastError: valid ? null : '采集服务登录态无效'
        }
      });
    } catch (error) {
      return this.prisma.v2DataSourceConnection.update({
        where: { id: connectionId },
        data: {
          sessionStatus: 'ERROR',
          lastCheckedAt: new Date(),
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  async triggerCapture(dto: TriggerV2CaptureDto, user: CurrentUser) {
    const connection = await this.prisma.v2DataSourceConnection.findUnique({
      where: { id: dto.connectionId }
    });
    if (!connection) throw new NotFoundException('X 管家连接不存在');
    const invalid = dto.modules.filter(
      (module) => !CAPTURE_MODULES.has(module)
    );
    if (invalid.length)
      throw new BadRequestException(`不支持的采集模块：${invalid.join(', ')}`);
    const results: Array<{
      module: string;
      status: string;
      result?: unknown;
      error?: string;
    }> = [];
    for (const module of dto.modules) {
      const start = new Date(`${dto.reportDate}T00:00:00+08:00`);
      const end = new Date(`${dto.reportDate}T23:59:59+08:00`);
      const job = await this.prisma.v2SyncJob.create({
        data: {
          connectionId: connection.id,
          module,
          businessStartAt: start,
          businessEndAt: end,
          status: 'RUNNING',
          attemptCount: 1,
          startedAt: new Date(),
          createdBy: user.id
        }
      });
      try {
        const requestId = randomUUID();
        const token = this.config.get<string>(
          'app.bluecatBridgeTaskControlToken'
        );
        if (!token) throw new BadRequestException('未配置采集任务控制凭据');
        const result = await this.fetchCollector(
          '/bridge/bluecat/v1/tasks/sync',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              'X-Request-Id': requestId,
              'Idempotency-Key': `${job.id}:${module}:${dto.reportDate}`,
              'X-Operator-Id': user.id
            },
            body: JSON.stringify({
              module,
              businessDate: dto.reportDate,
              externalStoreId: connection.externalStoreId
            })
          }
        );
        await this.prisma.v2SyncJob.update({
          where: { id: job.id },
          data: { status: 'SUCCEEDED', finishedAt: new Date() }
        });
        results.push({ module, status: 'SUCCEEDED', result });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await this.prisma.v2SyncJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorReason: reason,
            finishedAt: new Date()
          }
        });
        results.push({ module, status: 'FAILED', error: reason });
      }
    }
    if (results.some((item) => item.status === 'SUCCEEDED'))
      await this.prisma.v2DataSourceConnection.update({
        where: { id: connection.id },
        data: { lastSucceededAt: new Date() }
      });
    return { connectionId: connection.id, reportDate: dto.reportDate, results };
  }

  async runCollectorTask(
    module: string,
    businessDate: string,
    idempotencyKey: string,
    externalStoreId = '',
    operatorId = 'system:v2-snapshot-sync'
  ) {
    if (!CAPTURE_MODULES.has(module))
      throw new BadRequestException(`不支持的采集模块：${module}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate))
      throw new BadRequestException('采集日期格式无效');
    const token = this.config.get<string>('app.bluecatBridgeTaskControlToken');
    if (!token) throw new BadRequestException('未配置采集任务控制凭据');
    const result = (await this.fetchCollector('/bridge/bluecat/v1/tasks/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Request-Id': randomUUID(),
        'Idempotency-Key': idempotencyKey,
        'X-Operator-Id': operatorId
      },
      body: JSON.stringify({ module, businessDate, externalStoreId })
    })) as { ok?: boolean; errorReason?: string; status?: string };
    if (!result.ok) {
      if (result.errorReason === 'login_expired')
        throw new BadRequestException('X 管家登录已失效，请扫码重新登录');
      throw new BadRequestException(
        `采集任务失败：${result.errorReason || result.status || 'unknown_error'}`
      );
    }
    return result;
  }

  async createCollectorLoginQr(user: CurrentUser) {
    const token = this.config.get<string>('app.bluecatBridgeTaskControlToken');
    if (!token) throw new BadRequestException('未配置采集任务控制凭据');
    return this.fetchCollector('/bridge/bluecat/v1/auth/qr/create', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Operator-Id': user.id
      }
    });
  }

  async checkCollectorLoginQr(xmId: string, user: CurrentUser) {
    if (!xmId.trim()) throw new BadRequestException('扫码会话标识不能为空');
    const token = this.config.get<string>('app.bluecatBridgeTaskControlToken');
    if (!token) throw new BadRequestException('未配置采集任务控制凭据');
    return this.fetchCollector(
      `/bridge/bluecat/v1/auth/qr/check?xmId=${encodeURIComponent(xmId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Operator-Id': user.id
        }
      }
    );
  }

  async discoverStores(user: CurrentUser) {
    const token = this.config.get<string>('app.bluecatBridgeTaskControlToken');
    if (!token) throw new BadRequestException('未配置采集任务控制凭据');
    const requestId = randomUUID();
    const businessDate = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
    const sync = (await this.fetchCollector('/bridge/bluecat/v1/tasks/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Request-Id': requestId,
        'Idempotency-Key': `discover-stores:${businessDate}:${requestId}`,
        'X-Operator-Id': user.id
      },
      body: JSON.stringify({
        module: 'branches',
        businessDate,
        externalStoreId: ''
      })
    })) as { ok?: boolean; errorReason?: string };
    if (!sync.ok)
      throw new BadRequestException(
        `门店资料同步失败：${sync.errorReason || '采集任务未成功'}`
      );
    return this.discoverStoresForActor(user.id);
  }

  async discoverStoresForActor(actorId: string | null = null) {
    const response = (await this.fetchCollector(
      '/bridge/bluecat/v1/stores'
    )) as {
      contractVersion?: string;
      items?: Array<{
        externalStoreId: string;
        externalBranchId?: string;
        externalName?: string;
        latestReportDate?: string;
        qualityWarnings?: string[];
      }>;
    };
    const items = response.items ?? [];
    if (!items.length)
      throw new BadRequestException(
        '门店资料采集已执行，但采集系统未返回任何门店。请检查采集系统登录态及门店主数据采集日志'
      );
    const existingConnections =
      await this.prisma.v2DataSourceConnection.findMany({
        where: { sourceSystem: 'X_MANAGER' },
        select: { externalStoreId: true }
      });
    const mappedIds = new Set(
      existingConnections.map((item) =>
        item.externalStoreId.trim().toUpperCase()
      )
    );
    let createdCandidates = 0;
    let updatedCandidates = 0;
    for (const item of items) {
      const externalStoreId = item.externalStoreId.trim().toUpperCase();
      if (!externalStoreId) continue;
      const existing = await this.prisma.v2ExternalStoreCandidate.findUnique({
        where: {
          sourceSystem_externalStoreId: {
            sourceSystem: 'X_MANAGER',
            externalStoreId
          }
        },
        select: { id: true, status: true }
      });
      const mapped = mappedIds.has(externalStoreId);
      await this.prisma.v2ExternalStoreCandidate.upsert({
        where: {
          sourceSystem_externalStoreId: {
            sourceSystem: 'X_MANAGER',
            externalStoreId
          }
        },
        update: {
          externalBranchId: item.externalBranchId || null,
          externalStoreName: item.externalName,
          contractVersion: response.contractVersion || null,
          qualityWarnings: item.qualityWarnings ?? undefined,
          lastSeenAt: new Date(),
          ...(mapped
            ? {
                status: 'MATCHED' as const,
                reviewedAt: new Date(),
                reviewedBy: actorId
              }
            : {})
        },
        create: {
          sourceSystem: 'X_MANAGER',
          externalStoreId,
          externalBranchId: item.externalBranchId || null,
          externalStoreName: item.externalName,
          status: mapped ? 'MATCHED' : 'PENDING',
          contractVersion: response.contractVersion || null,
          qualityWarnings: item.qualityWarnings ?? undefined,
          reviewedAt: mapped ? new Date() : null,
          reviewedBy: mapped ? actorId : null
        }
      });
      if (existing) updatedCandidates += 1;
      else createdCandidates += 1;
    }
    const pending = await this.prisma.v2ExternalStoreCandidate.count({
      where: { status: 'PENDING' }
    });
    return {
      discovered: items.length,
      createdCandidates,
      updatedCandidates,
      pending,
      mapped: mappedIds.size
    };
  }

  async syncAllStoreMachineCounts(user: CurrentUser) {
    const businessDate = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
    const task = await this.runCollectorTask(
      'machines',
      businessDate,
      `machine-base:${businessDate}:${randomUUID()}`,
      '',
      user.id
    );
    const response = (await this.fetchCollector(
      '/bridge/bluecat/v1/stores/machines'
    )) as {
      items?: Array<{ externalStoreId: string; machineCount: number }>;
    };
    const facts = new Map(
      (response.items ?? [])
        .filter(
          (item) => Number.isInteger(item.machineCount) && item.machineCount > 0
        )
        .map((item) => [
          item.externalStoreId.trim().toUpperCase(),
          item.machineCount
        ])
    );
    const connections = await this.prisma.v2DataSourceConnection.findMany({
      where: {
        sourceSystem: 'X_MANAGER',
        store: { deletedAt: null, status: { not: 'CLOSED' } }
      },
      select: {
        externalStoreId: true,
        store: {
          select: { id: true, name: true, shortName: true, machineCount: true }
        }
      }
    });
    const updated: Array<{
      storeId: string;
      storeName: string;
      previousMachineCount: number;
      machineCount: number;
    }> = [];
    const skipped: Array<{
      externalStoreId: string;
      storeName: string;
      reason: string;
    }> = [];
    for (const connection of connections) {
      const externalStoreId = connection.externalStoreId.trim().toUpperCase();
      const machineCount = facts.get(externalStoreId);
      const storeName = connection.store.shortName || connection.store.name;
      if (!machineCount) {
        skipped.push({
          externalStoreId,
          storeName,
          reason: '采集未返回有效机器清单，已保留原值'
        });
        continue;
      }
      await this.prisma.v2Store.update({
        where: { id: connection.store.id },
        data: { machineCount, updatedBy: user.id }
      });
      updated.push({
        storeId: connection.store.id,
        storeName,
        previousMachineCount: connection.store.machineCount,
        machineCount
      });
    }
    return {
      businessDate,
      mappedStoreCount: connections.length,
      updatedStoreCount: updated.length,
      skippedStoreCount: skipped.length,
      updated,
      skipped,
      task
    };
  }

  async syncCollectorSettled(reportDate: string) {
    const response = (await this.fetchCollector(
      `/bridge/bluecat/v1/revenue/settled?date=${encodeURIComponent(reportDate)}`
    )) as { rows?: unknown[] };
    return this.ingestSettledRevenue(response.rows ?? []);
  }

  async syncCollectorLive(reportDate: string) {
    const response = (await this.fetchCollector(
      `/bridge/bluecat/v1/revenue/live?date=${encodeURIComponent(reportDate)}`
    )) as { rows?: unknown[] };
    return this.ingestLiveRevenue(response.rows ?? []);
  }

  async syncCollectorShifts(start: string, end: string) {
    const response = (await this.fetchCollector(
      `/bridge/bluecat/v1/shifts?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    )) as { rows?: unknown[] };
    return this.ingestShiftRevenue(response.rows ?? []);
  }

  async syncCollectorOtaDaily(reportDate: string) {
    const response = (await this.fetchCollector(
      `/bridge/bluecat/v1/ota/daily?date=${encodeURIComponent(reportDate)}`
    )) as { rows?: unknown[] };
    return this.ingestOtaDaily(response.rows ?? []);
  }

  async syncCollectorOtaProducts() {
    const response = (await this.fetchCollector(
      '/bridge/bluecat/v1/ota/products'
    )) as { rows?: unknown[] };
    return this.ingestOtaProducts(response.rows ?? []);
  }

  async syncStoreOtaProducts(storeId: string) {
    const connection = await this.prisma.v2DataSourceConnection.findUnique({
      where: { storeId }
    });
    if (!connection) throw new NotFoundException('本店尚未建立 X 管家映射');
    const response = (await this.fetchCollector(
      `/bridge/bluecat/v1/ota/products?snbid=${encodeURIComponent(connection.externalStoreId)}`
    )) as { rows?: unknown[]; errors?: unknown[] };
    const result = await this.ingestOtaProducts(response.rows ?? []);
    return { ...result, sourceErrors: response.errors ?? [] };
  }

  async syncCollectorOtaRedemptions(reportDate: string) {
    const response = (await this.fetchCollector(
      `/bridge/bluecat/v1/ota/redemptions?date=${encodeURIComponent(reportDate)}`
    )) as { rows?: unknown[] };
    return this.ingestOtaRedemptions(response.rows ?? []);
  }

  async backfillCollector(start: string, end: string) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      start > end
    ) {
      throw new BadRequestException('回填日期范围无效');
    }
    await this.discoverStoresForActor();
    const otaProducts = await this.syncCollectorOtaProducts();
    const days: Array<{
      date: string;
      settled: unknown;
      ota: unknown;
      otaRedemptions: unknown;
    }> = [];
    for (
      let cursor = this.sourceDate(start);
      cursor <= this.sourceDate(end);
      cursor = new Date(cursor.getTime() + 86400000)
    ) {
      const reportDate = cursor.toLocaleDateString('en-CA', {
        timeZone: 'Asia/Shanghai'
      });
      const safeSync = async (task: () => Promise<unknown>) => {
        try {
          return await task();
        } catch (error) {
          return {
            failed: true,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      };
      days.push({
        date: reportDate,
        settled: await safeSync(() => this.syncCollectorSettled(reportDate)),
        ota: await safeSync(() => this.syncCollectorOtaDaily(reportDate)),
        otaRedemptions: await safeSync(() =>
          this.syncCollectorOtaRedemptions(reportDate)
        )
      });
    }
    const shifts = await this.syncCollectorShifts(start, end).catch(
      (error) => ({
        failed: true,
        error: error instanceof Error ? error.message : String(error)
      })
    );
    return { start, end, otaProducts, days, shifts };
  }

  async otaCenter(
    storeId: string,
    monthValue?: string,
    productPageValue = 1,
    productPageSizeValue = 20,
    redemptionPageValue = 1,
    redemptionPageSizeValue = 30,
    redemptionStatus = 'ALL',
    redemptionKeywordValue?: string,
    productStatus = 'ALL'
  ) {
    const month = /^\d{4}-\d{2}$/.test(monthValue ?? '')
      ? monthValue!
      : new Date()
          .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
          .slice(0, 7);
    const start = this.sourceDate(`${month}-01`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const productPage =
      Number.isFinite(productPageValue) && productPageValue > 0
        ? Math.floor(productPageValue)
        : 1;
    const productPageSize = Number.isFinite(productPageSizeValue)
      ? Math.min(100, Math.max(10, Math.floor(productPageSizeValue)))
      : 20;
    const redemptionPage =
      Number.isFinite(redemptionPageValue) && redemptionPageValue > 0
        ? Math.floor(redemptionPageValue)
        : 1;
    const redemptionPageSize = Number.isFinite(redemptionPageSizeValue)
      ? Math.min(100, Math.max(10, Math.floor(redemptionPageSizeValue)))
      : 30;
    const statusFilter =
      redemptionStatus === 'EXCLUDED'
        ? { product: { is: { isBrush: true } } }
        : redemptionStatus === 'VALID'
          ? {
              OR: [{ productId: null }, { product: { is: { isBrush: false } } }]
            }
          : {};
    const redemptionKeyword = String(redemptionKeywordValue ?? '')
      .trim()
      .slice(0, 100);
    const onlineStatuses = ['meituan_on_sale', 'douyin_online'];
    const productWhere =
      productStatus === 'ON_SALE'
        ? { storeId, status: { in: onlineStatuses } }
        : productStatus === 'OFF_SALE'
          ? {
              storeId,
              OR: [{ status: null }, { status: { notIn: onlineStatuses } }]
            }
          : { storeId };
    const redemptionWhere = {
      storeId,
      businessDate: { gte: start, lt: end },
      ...(redemptionKeyword
        ? { productName: { contains: redemptionKeyword } }
        : {}),
      ...statusFilter
    };
    const summaryWhere = { storeId, businessDate: { gte: start, lt: end } };
    const [products, productTotal, redemptionRows, summaryRows] =
      await Promise.all([
        this.prisma.v2OtaProduct.findMany({
          where: productWhere,
          orderBy: [{ isBrush: 'desc' }, { platform: 'asc' }, { name: 'asc' }],
          skip: (productPage - 1) * productPageSize,
          take: productPageSize
        }),
        this.prisma.v2OtaProduct.count({ where: productWhere }),
        this.prisma.v2OtaRedemption.findMany({
          where: redemptionWhere,
          include: {
            product: {
              select: {
                id: true,
                isBrush: true,
                settlementRate: true,
                feeRate: true
              }
            },
            storeShift: { select: { id: true, name: true } }
          },
          orderBy: { operatedAt: 'desc' },
          skip: (redemptionPage - 1) * redemptionPageSize,
          take: redemptionPageSize
        }),
        this.prisma.v2OtaRedemption.findMany({
          where: summaryWhere,
          select: {
            amount: true,
            product: {
              select: { isBrush: true, settlementRate: true, feeRate: true }
            }
          }
        })
      ]);
    const filteredTotal = await this.prisma.v2OtaRedemption.count({
      where: redemptionWhere
    });
    const gross = summaryRows.reduce(
      (sum, item) => sum + Number(item.amount),
      0
    );
    const excluded = summaryRows
      .filter((item) => item.product?.isBrush)
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const actual = summaryRows
      .filter((item) => !item.product?.isBrush)
      .reduce((sum, item) => sum + this.otaActualAmount(item), 0);
    const redemptions = redemptionRows.map((item) => ({
      ...item,
      actualAmount: item.product?.isBrush ? 0 : this.otaActualAmount(item)
    }));
    return {
      month,
      products,
      redemptions,
      redemptionKeyword,
      productPagination: {
        page: productPage,
        pageSize: productPageSize,
        total: productTotal
      },
      redemptionPagination: {
        page: redemptionPage,
        pageSize: redemptionPageSize,
        total: filteredTotal
      },
      summary: {
        gross,
        excluded,
        actual,
        feeAndSettlementDifference: gross - excluded - actual,
        count: summaryRows.length
      }
    };
  }

  async updateOtaProductSettlement(
    id: string,
    settlementRateValue?: number,
    feeRateValue?: number
  ) {
    const product = await this.prisma.v2OtaProduct.findUnique({
      where: { id }
    });
    if (!product) throw new NotFoundException('团购商品不存在');
    const settlementRate = Number(settlementRateValue);
    const feeRate = Number(feeRateValue);
    if (
      !Number.isFinite(settlementRate) ||
      settlementRate < 0 ||
      settlementRate > 1 ||
      !Number.isFinite(feeRate) ||
      feeRate < 0 ||
      feeRate > 1
    )
      throw new BadRequestException('到账比例和手续费率必须在 0% 至 100% 之间');
    const result = await this.prisma.v2OtaProduct.updateMany({
      where: {
        storeId: product.storeId,
        platform: product.platform,
        name: product.name
      },
      data: { settlementRate, feeRate }
    });
    return {
      productId: id,
      settlementRate,
      feeRate,
      matchedProducts: result.count
    };
  }

  async updateOtaProductBrush(id: string, isBrush: boolean) {
    const product = await this.prisma.v2OtaProduct.findUnique({
      where: { id }
    });
    if (!product) throw new NotFoundException('团购商品不存在');
    const products = await this.prisma.v2OtaProduct.findMany({
      where: {
        storeId: product.storeId,
        platform: product.platform,
        name: product.name
      },
      select: { id: true }
    });
    await this.prisma.$transaction([
      this.prisma.v2OtaProduct.updateMany({
        where: { id: { in: products.map((item) => item.id) } },
        data: { isBrush }
      }),
      this.prisma.v2OtaRedemption.updateMany({
        where: {
          storeId: product.storeId,
          platform: product.platform,
          productName: product.name,
          productId: null
        },
        data: { productId: product.id }
      })
    ]);
    return { productId: id, isBrush, matchedProducts: products.length };
  }

  async markRedemptionProductBrush(id: string) {
    const redemption = await this.prisma.v2OtaRedemption.findUnique({
      where: { id }
    });
    if (!redemption) throw new NotFoundException('核销记录不存在');
    const externalProductId =
      redemption.externalProductId ||
      `HISTORY_${createHash('sha1').update(`${redemption.platform}:${redemption.productName}`).digest('hex').slice(0, 16).toUpperCase()}`;
    const product = await this.prisma.v2OtaProduct.upsert({
      where: {
        storeId_platform_externalProductId: {
          storeId: redemption.storeId,
          platform: redemption.platform,
          externalProductId
        }
      },
      update: { isBrush: true },
      create: {
        storeId: redemption.storeId,
        platform: redemption.platform,
        externalProductId,
        name: redemption.productName,
        amount: redemption.amount,
        status: 'HISTORICAL',
        isBrush: true,
        capturedAt: new Date()
      }
    });
    await this.prisma.v2OtaProduct.updateMany({
      where: {
        storeId: redemption.storeId,
        platform: redemption.platform,
        name: redemption.productName
      },
      data: { isBrush: true }
    });
    const where = redemption.externalProductId
      ? {
          storeId: redemption.storeId,
          platform: redemption.platform,
          OR: [
            { externalProductId: redemption.externalProductId },
            { productName: redemption.productName }
          ]
        }
      : {
          storeId: redemption.storeId,
          platform: redemption.platform,
          productName: redemption.productName
        };
    const linked = await this.prisma.v2OtaRedemption.updateMany({
      where,
      data: { productId: product.id }
    });
    return { product, linked: linked.count };
  }

  async syncStoreProductCategories(storeId: string, user: CurrentUser) {
    const connection = await this.prisma.v2DataSourceConnection.findUnique({
      where: { storeId }
    });
    if (!connection) throw new NotFoundException('本店尚未建立 X 管家映射');
    const businessDate = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
    await this.runCollectorTask(
      'products',
      businessDate,
      `product-categories:${connection.externalStoreId}:${businessDate}:${randomUUID()}`,
      connection.externalStoreId,
      user.id
    );
    const response = (await this.fetchCollector(
      `/bridge/bluecat/v1/products/categories?externalStoreId=${encodeURIComponent(connection.externalStoreId)}`
    )) as {
      rows?: Array<{ externalCategoryId: string; name: string }>;
      items?: Array<{ externalCategoryId: string; name: string }>;
      warnings?: string[];
    };
    const sourceItems = response.rows ?? response.items ?? [];
    const categories = Array.from(
      new Map(
        sourceItems
          .map((item) => ({
            externalCategoryId: String(item.externalCategoryId ?? '').trim(),
            name: String(item.name ?? '').trim()
          }))
          .filter((item) => item.externalCategoryId && item.name)
          .map((item) => [item.externalCategoryId, item])
      ).values()
    );
    if (!categories.length) {
      const warning = response.warnings?.filter(Boolean).join(', ');
      throw new BadRequestException(
        warning
          ? `商品分类来源暂不可用：${warning}`
          : '商品分类来源返回空结果，已保留现有分类'
      );
    }
    const month = businessDate.slice(0, 7);
    const salesResponse = (await this.fetchCollector(
      `/bridge/bluecat/v1/products/sales?externalStoreId=${encodeURIComponent(connection.externalStoreId)}&start=${encodeURIComponent(`${month}-01`)}&end=${encodeURIComponent(businessDate)}`
    )) as { rows?: Array<Record<string, unknown>> };
    const observedCategories = Array.from(
      new Map(
        (salesResponse.rows ?? [])
          .map((item) => ({
            externalCategoryId: String(item.externalCategoryId ?? '').trim(),
            name: String(item.categoryName ?? '').trim()
          }))
          .filter((item) => item.externalCategoryId && item.name)
          .map((item) => [item.externalCategoryId, item])
      ).values()
    );
    const capturedAt = new Date();
    const sourceIds = categories.map((item) => item.externalCategoryId);
    const normalizeCategoryName = (value: string) =>
      value
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*([/|｜])\s*/g, '$1');
    const existingCategories =
      await this.prisma.v2ProductDisplayCategory.findMany({
        where: { storeId },
        orderBy: { updatedAt: 'desc' },
        select: {
          externalCategoryId: true,
          name: true,
          excluded: true,
          excludedFrom: true
        }
      });
    const previousSettingById = new Map(
      existingCategories.map((item) => [
        item.externalCategoryId,
        { excluded: item.excluded, excludedFrom: item.excludedFrom }
      ])
    );
    const previousSettingByName = new Map<
      string,
      { excluded: boolean; excludedFrom: Date | null }
    >();
    for (const item of existingCategories) {
      const key = normalizeCategoryName(item.name);
      if (!previousSettingByName.has(key)) {
        previousSettingByName.set(key, {
          excluded: item.excluded,
          excludedFrom: item.excludedFrom
        });
      }
    }
    const deactivated = await this.prisma.$transaction(async (tx) => {
      const stale = await tx.v2ProductDisplayCategory.updateMany({
        where: {
          storeId,
          active: true,
          externalCategoryId: { notIn: sourceIds }
        },
        data: {
          active: false,
          inactiveAt: capturedAt
        }
      });
      for (const item of categories) {
        const previousSetting =
          previousSettingById.get(item.externalCategoryId) ??
          previousSettingByName.get(normalizeCategoryName(item.name));
        await tx.v2ProductDisplayCategory.upsert({
          where: {
            storeId_externalCategoryId: {
              storeId,
              externalCategoryId: item.externalCategoryId
            }
          },
          update: {
            name: item.name,
            active: true,
            inactiveAt: null,
            excluded: previousSetting?.excluded ?? false,
            excludedFrom: previousSetting?.excludedFrom ?? null,
            capturedAt
          },
          create: {
            storeId,
            externalCategoryId: item.externalCategoryId,
            name: item.name,
            active: true,
            excluded: previousSetting?.excluded ?? false,
            excludedFrom: previousSetting?.excludedFrom ?? null,
            capturedAt
          }
        });
      }
      for (const item of observedCategories) {
        if (sourceIds.includes(item.externalCategoryId)) continue;
        const previousSetting =
          previousSettingById.get(item.externalCategoryId) ??
          previousSettingByName.get(normalizeCategoryName(item.name));
        await tx.v2ProductDisplayCategory.upsert({
          where: {
            storeId_externalCategoryId: {
              storeId,
              externalCategoryId: item.externalCategoryId
            }
          },
          update: {
            name: item.name,
            active: false,
            inactiveAt: capturedAt,
            capturedAt
          },
          create: {
            storeId,
            externalCategoryId: item.externalCategoryId,
            name: item.name,
            active: false,
            inactiveAt: capturedAt,
            excluded: previousSetting?.excluded ?? false,
            excludedFrom: previousSetting?.excludedFrom ?? null,
            capturedAt
          }
        });
      }
      return stale.count;
    });
    return {
      count: categories.length,
      historicalCount: observedCategories.filter(
        (item) => !sourceIds.includes(item.externalCategoryId)
      ).length,
      deactivated,
      categories: await this.prisma.v2ProductDisplayCategory.findMany({
        where: { storeId, active: true },
        orderBy: { name: 'asc' }
      })
    };
  }

  async productExclusionCenter(storeId: string, monthValue?: string) {
    const month = /^\d{4}-\d{2}$/.test(monthValue ?? '')
      ? monthValue!
      : new Date()
          .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
          .slice(0, 7);
    const start = this.sourceDate(`${month}-01`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const connection = await this.prisma.v2DataSourceConnection.findUnique({
      where: { storeId }
    });
    let salesRows: Array<Record<string, unknown>> = [];
    if (connection) {
      const last = new Date(end.getTime() - 86400000)
        .toISOString()
        .slice(0, 10);
      const response = (await this.fetchCollector(
        `/bridge/bluecat/v1/products/sales?externalStoreId=${encodeURIComponent(connection.externalStoreId)}&start=${encodeURIComponent(`${month}-01`)}&end=${encodeURIComponent(last)}`
      ).catch(() => ({ rows: [] }))) as {
        rows?: Array<Record<string, unknown>>;
      };
      salesRows = response.rows ?? [];
    }
    const monthSalesByCategory = new Map<string, number>();
    for (const row of salesRows) {
      const categoryId = String(row.externalCategoryId ?? '').trim();
      if (!categoryId || row.isAllRefund === true) continue;
      const status = String(row.orderStatus ?? '')
        .trim()
        .toUpperCase();
      if (status && !['2', 'COMPLETED', 'FINISHED'].includes(status)) continue;
      const amount = Number(row.amount ?? 0);
      monthSalesByCategory.set(
        categoryId,
        (monthSalesByCategory.get(categoryId) ?? 0) +
          (Number.isFinite(amount) ? amount : 0)
      );
    }
    const observedIds = [...monthSalesByCategory.keys()];
    const selectedCategoryIds = await this.productExclusionCategoryIdsForMonth(
      storeId,
      month
    );
    const [categories, aggregate] = await Promise.all([
      this.prisma.v2ProductDisplayCategory.findMany({
        where: {
          storeId,
          OR: [
            { active: true },
            { excluded: true },
            ...(selectedCategoryIds.length
              ? [{ externalCategoryId: { in: selectedCategoryIds } }]
              : []),
            ...(observedIds.length
              ? [{ externalCategoryId: { in: observedIds } }]
              : [])
          ]
        },
        orderBy: [{ excluded: 'desc' }, { name: 'asc' }]
      }),
      this.prisma.v2ProductExclusionSnapshot.aggregate({
        where: {
          storeId,
          businessDate: { gte: start, lt: end },
          kind: { in: ['SETTLED_DAILY', 'LIVE_TODAY'] }
        },
        _sum: { excludedAmount: true },
        _count: true
      })
    ]);
    return {
      month,
      selectedCategoryIds,
      historicalEditable: month < this.currentShanghaiMonth(),
      categories: categories.map((item) => ({
        ...item,
        historical: !item.active,
        monthSalesAmount:
          Math.round(
            (monthSalesByCategory.get(item.externalCategoryId) ?? 0) * 100
          ) / 100
      })),
      summary: {
        excludedAmount: Number(aggregate._sum.excludedAmount ?? 0),
        snapshotCount: aggregate._count
      }
    };
  }

  async updateProductCategoryExclusion(
    id: string,
    excluded: boolean,
    month?: string,
    user?: CurrentUser
  ) {
    const category = await this.prisma.v2ProductDisplayCategory.findUnique({
      where: { id }
    });
    if (!category) throw new NotFoundException('商品分类不存在');
    const currentMonth = this.currentShanghaiMonth();
    const targetMonth = /^\d{4}-\d{2}$/.test(month ?? '')
      ? month!
      : currentMonth;
    if (targetMonth > currentMonth)
      throw new BadRequestException('未来月份商品分类不可修改');
    if (targetMonth < currentMonth) {
      const ids = new Set(
        await this.productExclusionCategoryIdsForMonth(
          category.storeId,
          targetMonth
        )
      );
      if (excluded) ids.add(category.externalCategoryId);
      else ids.delete(category.externalCategoryId);
      return this.syncStoreProductExclusionMonth(
        category.storeId,
        targetMonth,
        [...ids],
        this.historicalProductCorrection(user)
      );
    }
    const currentMonthStart = this.sourceDate(`${currentMonth}-01`);
    await this.prisma.v2ProductDisplayCategory.update({
      where: { id },
      data: { excluded, excludedFrom: excluded ? currentMonthStart : null }
    });
    return this.syncStoreProductExclusionMonth(category.storeId);
  }

  async updateProductCategoryExclusions(
    storeId: string,
    excludedIds: string[],
    month?: string,
    user?: CurrentUser
  ) {
    const selectedCategories =
      await this.prisma.v2ProductDisplayCategory.findMany({
        where: { storeId, id: { in: excludedIds } },
        select: { externalCategoryId: true }
      });
    if (selectedCategories.length !== new Set(excludedIds).size)
      throw new BadRequestException('包含不属于本门店的商品分类');
    const currentMonth = this.currentShanghaiMonth();
    const targetMonth = /^\d{4}-\d{2}$/.test(month ?? '')
      ? month!
      : currentMonth;
    if (targetMonth > currentMonth)
      throw new BadRequestException('未来月份商品分类不可修改');
    if (targetMonth < currentMonth) {
      const result = await this.syncStoreProductExclusionMonth(
        storeId,
        targetMonth,
        selectedCategories.map((item) => item.externalCategoryId),
        this.historicalProductCorrection(user)
      );
      return { ...result, excludedCount: excludedIds.length };
    }
    const currentMonthStart = this.sourceDate(`${currentMonth}-01`);
    await this.prisma.$transaction([
      this.prisma.v2ProductDisplayCategory.updateMany({
        where: { storeId, excluded: true },
        data: { excluded: false, excludedFrom: null }
      }),
      this.prisma.v2ProductDisplayCategory.updateMany({
        where: { storeId, id: { in: excludedIds } },
        data: { excluded: true, excludedFrom: currentMonthStart }
      })
    ]);
    const result = await this.syncStoreProductExclusionMonth(storeId);
    return { ...result, excludedCount: excludedIds.length };
  }

  async syncStoreProductExclusionMonth(
    storeId: string,
    monthValue?: string,
    categoryIdsOverride?: string[],
    correction?: Prisma.InputJsonObject
  ) {
    const month = /^\d{4}-\d{2}$/.test(monthValue ?? '')
      ? monthValue!
      : new Date()
          .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
          .slice(0, 7);
    const start = this.sourceDate(`${month}-01`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const todayText = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
    const effectiveCategoryIds =
      categoryIdsOverride ??
      (month < todayText.slice(0, 7)
        ? await this.productExclusionCategoryIdsForMonth(storeId, month)
        : undefined);
    const last =
      month === todayText.slice(0, 7)
        ? this.sourceDate(todayText)
        : new Date(end.getTime() - 86400000);
    let synced = 0;
    for (
      let day = start;
      day <= last;
      day = new Date(day.getTime() + 86400000)
    ) {
      await this.syncStoreProductExclusionDay(
        storeId,
        day.toISOString().slice(0, 10),
        day.toISOString().slice(0, 10) === todayText,
        effectiveCategoryIds,
        correction
      );
      synced += 1;
    }
    return { storeId, month, synced };
  }

  async syncAllLiveProductExclusions(reportDate: string) {
    const stores = await this.prisma.v2ProductDisplayCategory.findMany({
      where: { excluded: true },
      distinct: ['storeId'],
      select: { storeId: true }
    });
    const results = [];
    for (const item of stores)
      results.push(
        await this.syncStoreProductExclusionDay(
          item.storeId,
          reportDate,
          true
        ).catch((error) => ({
          failed: true,
          error: error instanceof Error ? error.message : String(error)
        }))
      );
    return results;
  }

  async productExclusionStoreIds() {
    const stores = await this.prisma.v2ProductDisplayCategory.findMany({
      where: { excluded: true },
      distinct: ['storeId'],
      select: { storeId: true }
    });
    return stores.map((item) => item.storeId);
  }

  async syncStoreProductExclusionDay(
    storeId: string,
    reportDate: string,
    live = false,
    categoryIdsOverride?: string[],
    correction?: Prisma.InputJsonObject
  ) {
    const [connection, categories] = await Promise.all([
      this.prisma.v2DataSourceConnection.findUnique({ where: { storeId } }),
      this.prisma.v2ProductDisplayCategory.findMany({
        where: {
          storeId,
          excluded: true,
          OR: [
            { excludedFrom: null },
            { excludedFrom: { lte: this.sourceDate(reportDate) } }
          ]
        },
        select: { externalCategoryId: true }
      })
    ]);
    if (!connection) throw new NotFoundException('本店尚未建立 X 管家映射');
    const ids = categoryIdsOverride
      ? [...new Set(categoryIdsOverride.map(String))]
      : categories.map((item) => item.externalCategoryId);
    let amount = 0;
    let payload: object = {
      contractVersion: '1.0',
      externalStoreId: connection.externalStoreId,
      reportDate,
      rowCount: 0,
      sourceReferences: []
    };
    if (correction) payload = { ...payload, correction };
    let productRows: Array<Record<string, unknown>> = [];
    if (ids.length) {
      const response = (await this.fetchCollector(
        `/bridge/bluecat/v1/products/sales?externalStoreId=${encodeURIComponent(connection.externalStoreId)}&start=${encodeURIComponent(reportDate)}&end=${encodeURIComponent(reportDate)}`
      )) as {
        contractVersion?: string;
        rows?: Array<Record<string, unknown>>;
        warnings?: string[];
      };
      productRows = response.rows ?? [];
      amount = this.excludedProductAmount(productRows, ids);
      payload = {
        contractVersion: response.contractVersion ?? '1.0',
        externalStoreId: connection.externalStoreId,
        reportDate,
        rowCount: productRows.length,
        warnings: response.warnings ?? [],
        sourceReferences: productRows.map((row) => ({
          sourceRecordId: String(row.sourceRecordId ?? '') || null,
          sourceHash: String(row.sourceHash ?? '') || null,
          capturedAt: String(row.capturedAt ?? '') || null
        })),
        ...(correction ? { correction } : {})
      };
    }
    const sourceBatchHash = this.sourceHash(payload);
    const businessDate = this.sourceDate(reportDate);
    const kind = live ? 'LIVE_TODAY' : 'SETTLED_DAILY';
    const dayWhere = {
      storeId_businessDate_kind_sourceKey: {
        storeId,
        businessDate,
        kind,
        sourceKey: 'DAY'
      }
    };
    const existingDay = await this.prisma.v2ProductExclusionSnapshot.findUnique(
      {
        where: dayWhere,
        select: { excludedAmount: true, categoryIds: true }
      }
    );
    const dayChanged =
      !existingDay ||
      Number(existingDay.excludedAmount) !== amount ||
      !this.sameStringValues(existingDay.categoryIds, ids);
    if (dayChanged) {
      await this.prisma.v2ProductExclusionSnapshot.upsert({
        where: dayWhere,
        update: {
          excludedAmount: amount,
          categoryIds: ids,
          sourcePayload: payload,
          capturedAt: new Date()
        },
        create: {
          storeId,
          businessDate,
          kind,
          sourceKey: 'DAY',
          excludedAmount: amount,
          categoryIds: ids,
          sourcePayload: payload,
          capturedAt: new Date()
        }
      });
    }
    let shiftCount = 0;
    if (!live) {
      const shifts = await this.prisma.v2ShiftRevenueSnapshot.findMany({
        where: { storeId, businessDate },
        select: {
          id: true,
          externalShiftId: true,
          shiftStartedAt: true,
          shiftEndedAt: true
        }
      });
      for (const shift of shifts) {
        const shiftStart = this.sourceDateTimeText(shift.shiftStartedAt);
        const shiftEnd = this.sourceDateTimeText(shift.shiftEndedAt);
        const shiftAmount = this.excludedProductAmount(
          productRows,
          ids,
          shiftStart,
          shiftEnd
        );
        const shiftWhere = {
          storeId_businessDate_kind_sourceKey: {
            storeId,
            businessDate,
            kind: 'SHIFT',
            sourceKey: shift.externalShiftId
          }
        };
        const existingShift =
          await this.prisma.v2ProductExclusionSnapshot.findUnique({
            where: shiftWhere,
            select: {
              shiftRevenueSnapshotId: true,
              excludedAmount: true,
              categoryIds: true
            }
          });
        if (
          !existingShift ||
          existingShift.shiftRevenueSnapshotId !== shift.id ||
          Number(existingShift.excludedAmount) !== shiftAmount ||
          !this.sameStringValues(existingShift.categoryIds, ids)
        ) {
          await this.prisma.v2ProductExclusionSnapshot.upsert({
            where: shiftWhere,
            update: {
              shiftRevenueSnapshotId: shift.id,
              excludedAmount: shiftAmount,
              categoryIds: ids,
              sourcePayload: {
                contractVersion: '1.0',
                externalStoreId: connection.externalStoreId,
                reportDate,
                daySourceKey: 'DAY',
                rowCount: productRows.length,
                sourceBatchHash,
                ...(correction ? { correction } : {})
              },
              capturedAt: new Date()
            },
            create: {
              storeId,
              businessDate,
              kind: 'SHIFT',
              sourceKey: shift.externalShiftId,
              shiftRevenueSnapshotId: shift.id,
              excludedAmount: shiftAmount,
              categoryIds: ids,
              sourcePayload: {
                contractVersion: '1.0',
                externalStoreId: connection.externalStoreId,
                reportDate,
                daySourceKey: 'DAY',
                rowCount: productRows.length,
                sourceBatchHash,
                ...(correction ? { correction } : {})
              },
              capturedAt: new Date()
            }
          });
        }
        shiftCount += 1;
      }
    }
    return {
      storeId,
      reportDate,
      kind,
      excludedAmount: amount,
      changed: dayChanged,
      shiftCount
    };
  }

  private sameStringValues(value: Prisma.JsonValue, expected: string[]) {
    if (!Array.isArray(value)) return false;
    const actual = value.map(String).sort();
    const normalizedExpected = [...expected].map(String).sort();
    return (
      actual.length === normalizedExpected.length &&
      actual.every((item, index) => item === normalizedExpected[index])
    );
  }

  private currentShanghaiMonth() {
    return new Date()
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
      .slice(0, 7);
  }

  private historicalProductCorrection(
    user?: CurrentUser
  ): Prisma.InputJsonObject {
    return {
      type: 'HISTORICAL_PRODUCT_CATEGORY_EXCLUSION',
      operatorId: user?.id ?? 'unknown',
      correctedAt: new Date().toISOString()
    };
  }

  private async productExclusionCategoryIdsForMonth(
    storeId: string,
    month: string
  ) {
    const start = this.sourceDate(`${month}-01`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    if (month >= this.currentShanghaiMonth()) {
      const currentCategories =
        await this.prisma.v2ProductDisplayCategory.findMany({
          where: {
            storeId,
            excluded: true,
            OR: [{ excludedFrom: null }, { excludedFrom: { lte: start } }]
          },
          select: { externalCategoryId: true }
        });
      return currentCategories.map((item) => item.externalCategoryId);
    }
    const snapshot = await this.prisma.v2ProductExclusionSnapshot.findFirst({
      where: {
        storeId,
        businessDate: { gte: start, lt: end },
        kind: 'SETTLED_DAILY',
        sourceKey: 'DAY'
      },
      orderBy: [{ businessDate: 'desc' }, { updatedAt: 'desc' }],
      select: { categoryIds: true }
    });
    if (snapshot && Array.isArray(snapshot.categoryIds))
      return [...new Set(snapshot.categoryIds.map(String))];
    const categories = await this.prisma.v2ProductDisplayCategory.findMany({
      where: {
        storeId,
        excluded: true,
        OR: [{ excludedFrom: null }, { excludedFrom: { lte: start } }]
      },
      select: { externalCategoryId: true }
    });
    return categories.map((item) => item.externalCategoryId);
  }

  private sourceDateTimeText(value: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(value);
    const get = (type: string) =>
      parts.find((item) => item.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
  }

  private excludedProductAmount(
    rows: Array<Record<string, unknown>>,
    categoryIds: string[],
    start?: string,
    end?: string
  ) {
    const selected = new Set(categoryIds.map(String));
    const startAt = start ? this.sourceDateTime(start).getTime() : null;
    const endAt = end ? this.sourceDateTime(end).getTime() : null;
    return (
      Math.round(
        rows.reduce((sum, row) => {
          if (!selected.has(String(row.externalCategoryId ?? ''))) return sum;
          if (row.isAllRefund === true) return sum;
          const status = String(row.orderStatus ?? '')
            .trim()
            .toUpperCase();
          if (status && !['2', 'COMPLETED', 'FINISHED'].includes(status))
            return sum;
          if (startAt !== null && endAt !== null) {
            const occurredAt = String(row.occurredAt ?? '').trim();
            if (!occurredAt) return sum;
            const eventAt = this.sourceDateTime(occurredAt).getTime();
            if (
              !Number.isFinite(eventAt) ||
              eventAt < startAt ||
              eventAt >= endAt
            )
              return sum;
          }
          const amount = Number(row.amount ?? 0);
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0) * 100
      ) / 100
    );
  }

  private async fetchCollector(path: string, init?: RequestInit) {
    const bridge = this.config
      .get<string>('app.bluecatBridgeBaseUrl')
      ?.replace(/\/bridge\/bluecat\/?$/, '');
    if (!bridge) throw new BadRequestException('未配置采集服务地址');
    const headers = new Headers(init?.headers);
    if (
      path.startsWith('/bridge/bluecat/v1/') &&
      !headers.has('Authorization')
    ) {
      const token = this.config.get<string>('app.bluecatBridgeReadToken');
      if (!token) throw new BadRequestException('未配置 Bridge 读取凭据');
      headers.set('Authorization', `Bearer ${token}`);
    }
    const response = await fetch(`${bridge}${path}`, { ...init, headers });
    if (!response.ok)
      throw new BadRequestException(
        `采集服务请求失败：HTTP ${response.status}`
      );
    const body = (await response.json()) as Record<string, unknown>;
    if (
      path.startsWith('/bridge/bluecat/v1/') &&
      body.contractVersion !== '1.0'
    )
      throw new BadRequestException(
        `采集服务契约版本不兼容：${String(body.contractVersion ?? 'missing')}`
      );
    return body;
  }
}
