import { chinaCsvTime, csvRow } from '../../common/csv';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type V2OperationalTaskCadence,
  type V2OperationalTaskStatus
} from '@prisma/client';
import { resolveScopedPermission } from '../../common/scoped-permission';
import {
  emptyTaskCounts,
  taskStatusLabel,
  type TaskReportQuery
} from './task-report';
import { nextTaskRun } from './task-schedule';
import { encodeTaskEvidence } from './task-evidence';
import { PrismaService } from '../../database/prisma.service';

const operating = { status: 'OPERATING', deletedAt: null } as const;
const activePosition = { enabled: true, deletedAt: null } as const;
const activeEmployee = { status: 'ACTIVE', deletedAt: null } as const;

const currentEvidence = {
  where: { reopenId: null },
  select: { id: true },
  orderBy: { id: 'asc' }
} satisfies Prisma.V2OperationalTask$evidenceArgs;

export interface Target {
  storeId: string;
  storeName: string;
  targetKey: string;
  targetName: string;
}

export interface TaskListFilters {
  assignedMode?: 'ACTIVE' | 'HISTORY';
  assignedPage: number;
  page: number;
  storeId?: string;
  status?: V2OperationalTaskStatus | 'EXPIRED';
  kind?: 'TASK' | 'RECTIFICATION';
  keyword?: string;
}

const managementPageSize = 20;

interface DispatchInput {
  batchId: string;
  title: string;
  description: string;
  checklist?: string[];
  ccUsernames?: string[];
  dueAt: string;
  sourceTaskId?: string;
  sourceItemIndex?: number;
  sourceSubmittedAt?: string;
  targets: Array<Pick<Target, 'storeId' | 'targetKey'>>;
}

interface ScheduleInput extends Pick<
  DispatchInput,
  'title' | 'description' | 'checklist' | 'ccUsernames'
> {
  requestId: string;
  target: Pick<Target, 'storeId' | 'targetKey'>;
  cadence: V2OperationalTaskCadence;
  firstRunAt: string;
  dueHours: number;
}

function normalizeChecklist(items?: string[] | null) {
  const checklist = (items ?? []).map((item) => item.trim());
  if (
    checklist.some((item) => !item) ||
    new Set(checklist).size !== checklist.length
  ) {
    throw new BadRequestException('检查项不能为空或重复');
  }
  return checklist;
}

function ccNames(names?: string[] | null) {
  return [
    ...new Set(
      (names ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean)
    )
  ].sort();
}

function savedCc(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    entry &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    typeof entry.accountId === 'string' &&
    typeof entry.username === 'string'
      ? [{ accountId: entry.accountId, username: entry.username }]
      : []
  );
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function parseChecklistIssues(value: string | undefined, itemCount: number) {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error();
    const entries = Object.entries(parsed);
    if (
      entries.some(
        ([key, text]) =>
          !/^(0|[1-9]\d?)$/.test(key) ||
          Number(key) >= itemCount ||
          typeof text !== 'string' ||
          !text.trim() ||
          text.trim().length > 500
      )
    )
      throw new Error();
    return Object.fromEntries(
      entries.map(([key, text]) => [key, (text as string).trim()])
    );
  } catch {
    throw new BadRequestException('检查项异常说明无效，每项最多 500 字');
  }
}

@Injectable()
export class V2OperationalTasksService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(V2OperationalTasksService.name);
  private scheduleTimer?: ReturnType<typeof setInterval>;
  private processingSchedules = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  onModuleInit() {
    if (!this.config.get<boolean>('app.backgroundJobsEnabled')) return;
    this.scheduleTimer = setInterval(
      () => void this.processSchedules(),
      30_000
    );
    this.scheduleTimer.unref();
    void this.processSchedules();
  }

  onModuleDestroy() {
    clearInterval(this.scheduleTimer);
  }

  async inbox(accountId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const where = await this.inboxScope(accountId, tx);
        const unread = await tx.v2OperationalTaskNotification.count({
          where: { ...where, readAt: null }
        });
        const rows = await tx.v2OperationalTaskNotification.findMany({
          where,
          select: {
            id: true,
            kind: true,
            reason: true,
            readAt: true,
            createdAt: true,
            task: { select: { title: true, store: { select: { name: true } } } }
          },
          orderBy: [
            { readAt: { sort: 'desc', nulls: 'first' } },
            { createdAt: 'desc' },
            { id: 'desc' }
          ],
          take: 30
        });
        return { unread, rows };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }

  async readNotification(accountId: string, id: string) {
    return this.write(async (tx) => {
      const where = await this.inboxScope(accountId, tx);
      await tx.v2OperationalTaskNotification.updateMany({
        where: { ...where, id, readAt: null },
        data: { readAt: new Date() }
      });
      return { read: true };
    });
  }

  private async inboxScope(
    accountId: string,
    tx: Prisma.TransactionClient
  ): Promise<Prisma.V2OperationalTaskNotificationWhereInput> {
    const account = await this.account(accountId, tx);
    const access = await resolveScopedPermission(
      accountId,
      'operational-task:manage',
      tx
    );
    const targets = account.employeeId
      ? await this.targets(account.employeeId, tx)
      : [];
    const or: Prisma.V2OperationalTaskNotificationWhereInput[] = [];
    if (access) {
      or.push({
        kind: { in: ['SUBMITTED', 'CC'] },
        task: {
          store: { deletedAt: null },
          storeId: access.storeIds ? { in: access.storeIds } : undefined
        }
      });
    }
    if (targets.length) {
      or.push({
        kind: { in: ['COMPLETED', 'RETURNED', 'RELEASED'] },
        task: {
          store: operating,
          OR: targets.map(({ storeId, targetKey }) => ({ storeId, targetKey }))
        }
      });
    }
    return { recipientId: accountId, OR: or };
  }

  private async notifyExecutor(
    tx: Prisma.TransactionClient,
    taskId: string,
    employeeId: string | null,
    kind: 'COMPLETED' | 'RETURNED' | 'RELEASED',
    reason?: string
  ) {
    if (!employeeId) return;
    const recipient = await tx.v2Account.findUnique({
      where: { employeeId },
      select: { id: true }
    });
    if (recipient)
      await tx.v2OperationalTaskNotification.create({
        data: { taskId, recipientId: recipient.id, kind, reason }
      });
  }

  async list(accountId: string, filters: TaskListFilters) {
    const account = await this.account(accountId);
    const canReviewExtensions = account.superAdmin;
    const [access, reportAccess] = await Promise.all([
      resolveScopedPermission(
        accountId,
        'operational-task:manage',
        this.prisma
      ),
      resolveScopedPermission(accountId, 'operational-task:report', this.prisma)
    ]);
    const canReport = Boolean(reportAccess);
    const targets = account.employeeId
      ? await this.targets(account.employeeId)
      : [];
    const available = targets.map(({ storeId, targetKey }) => ({
      storeId,
      targetKey
    }));
    const now = new Date();
    const actionable: Prisma.V2OperationalTaskWhereInput = {
      status: { in: ['PENDING', 'CLAIMED'] },
      dueAt: { gt: now }
    };
    const assignedStatus: Prisma.V2OperationalTaskWhereInput =
      filters.assignedMode === 'ACTIVE'
        ? actionable
        : filters.assignedMode === 'HISTORY'
          ? { NOT: actionable }
          : {};
    const assignedRows = available.length
      ? await this.prisma.v2OperationalTask.findMany({
          where: {
            store: operating,
            AND: [
              { OR: available },
              {
                OR: [{ status: 'PENDING' }, { claimerId: account.employeeId }]
              },
              assignedStatus
            ]
          },
          omit: { ccRecipients: true },
          include: {
            store: { select: { name: true } },
            evidence: currentEvidence,
            reopenHistory: {
              select: { action: true, reason: true, createdAt: true },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1
            }
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (filters.assignedPage - 1) * managementPageSize,
          take: managementPageSize + 1
        })
      : [];
    const assigned = assignedRows.slice(0, managementPageSize);
    const hasNextAssigned =
      filters.assignedPage < 10000 && assignedRows.length > managementPageSize;
    const reminders = await this.upcoming(available, account.employeeId);
    if (!access) {
      return {
        canManage: false,
        canReport,
        canReviewExtensions,
        assigned,
        hasNextAssigned,
        reminders,
        managed: [],
        managementStores: [],
        hasNext: false
      };
    }
    if (
      filters.storeId &&
      access.storeIds &&
      !access.storeIds.includes(filters.storeId)
    ) {
      throw new ForbiddenException('无权查看该门店的任务');
    }

    const status: Prisma.V2OperationalTaskWhereInput =
      filters.status === 'EXPIRED'
        ? { status: { in: ['PENDING', 'CLAIMED'] }, dueAt: { lte: now } }
        : {
            status: filters.status,
            dueAt:
              filters.status === 'PENDING' || filters.status === 'CLAIMED'
                ? { gt: now }
                : undefined
          };
    const keyword = filters.keyword?.trim();
    const [rows, managementStores] = await Promise.all([
      this.prisma.v2OperationalTask.findMany({
        where: {
          ...status,
          store: { deletedAt: null },
          storeId:
            filters.storeId ??
            (access.storeIds ? { in: access.storeIds } : undefined),
          sourceTaskId:
            filters.kind === 'TASK'
              ? null
              : filters.kind === 'RECTIFICATION'
                ? { not: null }
                : undefined,
          title: keyword
            ? { contains: keyword.replace(/[\\%_]/g, '\\$&') }
            : undefined
        },
        include: {
          store: { select: { name: true } },
          evidence: currentEvidence,
          extensions: {
            select: {
              id: true,
              status: true,
              reason: true,
              reviewNote: true,
              previousDueAt: true,
              newDueAt: true,
              createdAt: true,
              reviewedAt: true
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
          },
          sourceTask: { select: { title: true } },
          _count: { select: { rectifications: true } },
          reopenHistory: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: {
              evidence: { select: { id: true }, orderBy: { id: 'asc' } }
            }
          }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (filters.page - 1) * managementPageSize,
        take: managementPageSize + 1
      }),
      this.prisma.v2Store.findMany({
        where: {
          deletedAt: null,
          id: access.storeIds ? { in: access.storeIds } : undefined
        },
        select: { id: true, name: true, status: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }]
      })
    ]);
    return {
      canManage: true,
      canReport,
      canReviewExtensions,
      assigned,
      hasNextAssigned,
      reminders,
      managed: rows.slice(0, managementPageSize),
      managementStores,
      hasNext: filters.page < 10000 && rows.length > managementPageSize
    };
  }

  async requestExtension(accountId: string, taskId: string, note: string) {
    const reason = note.trim();
    if (!reason) throw new BadRequestException('请填写补交申请原因');
    return this.write(async (tx) => {
      const access = await this.manageAccess(accountId, tx);
      const task = await tx.v2OperationalTask.findFirst({
        where: {
          id: taskId,
          store: operating,
          storeId: access.storeIds ? { in: access.storeIds } : undefined
        }
      });
      if (!task) throw new ForbiddenException('无权为该任务申请补交');
      if (
        !['PENDING', 'CLAIMED'].includes(task.status) ||
        task.dueAt.getTime() > Date.now()
      ) {
        throw new ConflictException('仅已逾期且未提交的任务可以申请补交');
      }
      const pending = await tx.v2OperationalTaskExtension.findUnique({
        where: { pendingKey: taskId }
      });
      if (pending) {
        if (pending.requestedBy !== accountId || pending.reason !== reason)
          throw new ConflictException('该任务已有待审核的补交申请');
        return { id: pending.id };
      }
      return tx.v2OperationalTaskExtension.create({
        data: {
          taskId,
          pendingKey: taskId,
          reason,
          requestedBy: accountId,
          previousDueAt: task.dueAt,
          previousClaimerId: task.claimerId,
          previousClaimerName: task.claimerName
        },
        select: { id: true }
      });
    });
  }

  async pendingExtensions(accountId: string) {
    const account = await this.account(accountId);
    if (!account.superAdmin)
      throw new ForbiddenException('仅总部超级管理员可审批任务补交');
    const rows = await this.prisma.v2OperationalTaskExtension.findMany({
      where: { status: 'PENDING', task: { store: { deletedAt: null } } },
      select: {
        id: true,
        reason: true,
        previousDueAt: true,
        createdAt: true,
        requestedBy: true,
        task: {
          select: {
            title: true,
            targetName: true,
            store: { select: { name: true, status: true } }
          }
        }
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50
    });
    return rows.map(({ requestedBy, ...row }) => ({
      ...row,
      canReview: requestedBy !== accountId
    }));
  }

  async reviewExtension(
    accountId: string,
    id: string,
    approved: boolean,
    note: string,
    deadline?: string
  ) {
    const reviewNote = note.trim();
    const newDueAt = approved && deadline ? new Date(deadline) : null;
    if (
      !reviewNote ||
      (approved && !(newDueAt && newDueAt.getTime() > Date.now()))
    ) {
      throw new BadRequestException(
        '请填写审核说明，通过时须指定未来的截止时间'
      );
    }
    return this.write(async (tx) => {
      const account = await this.account(accountId, tx);
      if (!account.superAdmin)
        throw new ForbiddenException('仅总部超级管理员可审批任务补交');
      const extension = await tx.v2OperationalTaskExtension.findFirst({
        where: { id, task: { store: { deletedAt: null } } }
      });
      if (!extension || extension.status !== 'PENDING')
        throw new ConflictException('补交申请不存在或已处理');
      if (extension.requestedBy === accountId)
        throw new ForbiddenException('不能审批自己提交的申请');

      const now = new Date();
      if (newDueAt) {
        if (newDueAt <= now) throw new BadRequestException('新截止时间已过');
        const change = await tx.v2OperationalTask.updateMany({
          where: {
            id: extension.taskId,
            dueAt: extension.previousDueAt,
            status: { in: ['PENDING', 'CLAIMED'] },
            store: operating
          },
          data: {
            status: 'PENDING',
            dueAt: newDueAt,
            claimerId: null,
            claimerName: null,
            claimedAt: null
          }
        });
        if (!change.count)
          throw new ConflictException('任务或门店状态已变化，无法开放补交');
        await tx.v2OperationalTask.updateMany({
          where: { id: extension.taskId, originalDueAt: null },
          data: { originalDueAt: extension.previousDueAt }
        });
      }
      return tx.v2OperationalTaskExtension.update({
        where: { id },
        data: {
          status: approved ? 'APPROVED' : 'REJECTED',
          pendingKey: null,
          newDueAt,
          reviewedBy: accountId,
          reviewedAt: now,
          reviewNote
        },
        select: { status: true }
      });
    });
  }

  async report(accountId: string, query: TaskReportQuery) {
    const now = new Date();
    return this.prisma.$transaction(
      async (tx) => {
        const { where, storeWhere, canExport } = await this.reportScope(
          accountId,
          query,
          tx
        );
        const stores = await tx.v2Store.findMany({
          where: storeWhere,
          select: { id: true, name: true, status: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }]
        });
        const counts = await tx.v2OperationalTask.groupBy({
          by: ['storeId', 'status'],
          where,
          _count: { _all: true }
        });
        const overdue = await tx.v2OperationalTask.groupBy({
          by: ['storeId', 'status'],
          where: {
            AND: [
              where,
              { status: { in: ['PENDING', 'CLAIMED'] }, dueAt: { lte: now } }
            ]
          },
          _count: { _all: true }
        });
        const byStore = new Map(
          stores.map((store) => [store.id, emptyTaskCounts()])
        );
        const statusField = {
          PENDING: 'pending',
          CLAIMED: 'claimed',
          SUBMITTED: 'submitted',
          DONE: 'done'
        } as const;
        for (const group of counts) {
          const row = byStore.get(group.storeId);
          if (row) {
            row.total += group._count._all;
            row[statusField[group.status]] += group._count._all;
          }
        }
        for (const group of overdue) {
          const row = byStore.get(group.storeId);
          if (row) {
            row.overdue += group._count._all;
            row[statusField[group.status]] -= group._count._all;
          }
        }
        const total = emptyTaskCounts();
        for (const row of byStore.values()) {
          for (const key of Object.keys(total) as Array<keyof typeof total>)
            total[key] += row[key];
        }
        return {
          asOf: now,
          canExport,
          stores,
          total,
          rows: stores.flatMap((store) => {
            const row = byStore.get(store.id);
            return row?.total
              ? [{ storeId: store.id, storeName: store.name, ...row }]
              : [];
          })
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }

  async exportReport(accountId: string, query: TaskReportQuery) {
    const now = new Date();
    const tasks = await this.prisma.$transaction(
      async (tx) => {
        const { where, canExport } = await this.reportScope(
          accountId,
          query,
          tx
        );
        if (!canExport)
          throw new ForbiddenException('缺少所选门店的任务导出权限');
        return tx.v2OperationalTask.findMany({
          where,
          select: {
            id: true,
            title: true,
            store: { select: { name: true } },
            targetName: true,
            sourceTask: { select: { title: true } },
            scheduleId: true,
            status: true,
            createdAt: true,
            dueAt: true,
            claimerName: true,
            claimedAt: true,
            submittedAt: true,
            reviewedAt: true,
            _count: {
              select: { reopenHistory: { where: { action: 'RETURN' } } }
            }
          },
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          take: 5001
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
    if (tasks.length > 5000)
      throw new BadRequestException(
        '单次最多导出 5000 条任务，请缩小日期或门店范围'
      );
    const header = csvRow([
      '任务编号',
      '任务名称',
      '类型',
      '来源任务',
      '门店',
      '执行岗位',
      '状态',
      '派发时间（北京时间）',
      '截止时间（北京时间）',
      '认领人',
      '认领时间（北京时间）',
      '提交时间（北京时间）',
      '确认时间（北京时间）',
      '打回次数'
    ]);
    const rows = tasks.map((task) =>
      csvRow([
        task.id,
        task.title,
        task.sourceTask ? '整改' : task.scheduleId ? '循环任务' : '普通任务',
        task.sourceTask?.title ?? null,
        task.store.name,
        task.targetName,
        taskStatusLabel(task.status, task.dueAt, now),
        chinaCsvTime(task.createdAt),
        chinaCsvTime(task.dueAt),
        task.claimerName,
        chinaCsvTime(task.claimedAt),
        chinaCsvTime(task.submittedAt),
        chinaCsvTime(task.reviewedAt),
        task._count.reopenHistory
      ])
    );
    return '\uFEFF' + [header, ...rows].join('\r\n') + '\r\n';
  }

  private async reportScope(
    accountId: string,
    query: TaskReportQuery,
    tx: Prisma.TransactionClient
  ) {
    const access = await resolveScopedPermission(
      accountId,
      'operational-task:report',
      tx
    );
    if (!access) throw new ForbiddenException('缺少任务统计权限或门店授权');
    if (
      query.storeId &&
      access.storeIds &&
      !access.storeIds.includes(query.storeId)
    ) {
      throw new ForbiddenException('无权查看该门店的任务统计');
    }
    const exportAccess = await resolveScopedPermission(
      accountId,
      'operational-task:export',
      tx
    );
    const requestedStores = query.storeId ? [query.storeId] : access.storeIds;
    const exportStores = exportAccess?.storeIds;
    const canExport =
      exportStores === null ||
      Boolean(
        exportStores &&
        requestedStores &&
        requestedStores.every((storeId) => exportStores.includes(storeId))
      );
    const start = new Date(`${query.from}T00:00:00+08:00`);
    const end = new Date(
      new Date(`${query.to}T00:00:00+08:00`).getTime() + 86_400_000
    );
    const duration = end.getTime() - start.getTime();
    if (!(duration > 0 && duration <= 93 * 86_400_000)) {
      throw new BadRequestException('请选择有效的日期范围，最多 93 天');
    }
    const storeWhere: Prisma.V2StoreWhereInput = {
      deletedAt: null,
      id: access.storeIds ? { in: access.storeIds } : undefined
    };
    const where: Prisma.V2OperationalTaskWhereInput = {
      store: storeWhere,
      storeId: query.storeId,
      dueAt: { gte: start, lt: end },
      sourceTaskId:
        query.kind === 'TASK'
          ? null
          : query.kind === 'RECTIFICATION'
            ? { not: null }
            : undefined
    };
    return { where, storeWhere, canExport };
  }

  async reminders(accountId: string) {
    const account = await this.account(accountId);
    const targets = account.employeeId
      ? await this.targets(account.employeeId)
      : [];
    return this.upcoming(
      targets.map(({ storeId, targetKey }) => ({ storeId, targetKey })),
      account.employeeId
    );
  }

  private async upcoming(
    available: Array<Pick<Target, 'storeId' | 'targetKey'>>,
    employeeId: string | null
  ) {
    const reminderTime = new Date();
    return available.length
      ? await this.prisma.v2OperationalTask.findMany({
          where: {
            store: operating,
            AND: [
              { OR: available },
              {
                OR: [
                  { status: 'PENDING' },
                  { status: 'CLAIMED', claimerId: employeeId }
                ]
              }
            ],
            dueAt: {
              gt: reminderTime,
              lte: new Date(reminderTime.getTime() + 2 * 3_600_000)
            }
          },
          select: {
            id: true,
            title: true,
            dueAt: true,
            store: { select: { name: true } }
          },
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          take: 10
        })
      : [];
  }

  async schedules(accountId: string) {
    const access = await this.manageAccess(accountId, this.prisma);
    return this.prisma.v2OperationalTaskSchedule.findMany({
      where: {
        store: { deletedAt: null },
        storeId: access.storeIds ? { in: access.storeIds } : undefined
      },
      select: {
        id: true,
        title: true,
        targetName: true,
        cadence: true,
        dueHours: true,
        enabled: true,
        nextRunAt: true,
        pauseReason: true,
        store: { select: { name: true } }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 100
    });
  }

  async createSchedule(accountId: string, input: ScheduleInput) {
    const title = input.title.trim();
    const description = input.description.trim();
    const checklist = normalizeChecklist(input.checklist);
    const ccUsernames = ccNames(input.ccUsernames);
    const firstRunAt = new Date(input.firstRunAt);
    if (!title || !description || !Number.isFinite(firstRunAt.getTime())) {
      throw new BadRequestException('请填写任务名称、说明和未来的首次派发时间');
    }
    return this.write(async (tx) => {
      const access = await this.manageAccess(accountId, tx);
      if (access.storeIds && !access.storeIds.includes(input.target.storeId))
        throw new ForbiddenException('无权向该门店派发任务');
      const existing = await tx.v2OperationalTaskSchedule.findUnique({
        where: { id: input.requestId }
      });
      if (existing) {
        if (
          existing.createdBy !== accountId ||
          existing.storeId !== input.target.storeId ||
          existing.targetKey !== input.target.targetKey ||
          existing.title !== title ||
          existing.description !== description ||
          JSON.stringify(existing.checklist ?? []) !==
            JSON.stringify(checklist) ||
          JSON.stringify(
            savedCc(existing.ccRecipients).map((item) => item.username)
          ) !== JSON.stringify(ccUsernames) ||
          existing.cadence !== input.cadence ||
          existing.firstRunAt.getTime() !== firstRunAt.getTime() ||
          existing.dueHours !== input.dueHours
        ) {
          throw new ConflictException('循环模板请求已使用，请重新发起');
        }
        return { id: existing.id };
      }
      if (firstRunAt.getTime() <= Date.now())
        throw new BadRequestException('首次派发时间必须晚于当前时间');
      const target = (
        await this.targets(undefined, tx, input.target.storeId)
      ).find((item) => item.targetKey === input.target.targetKey);
      if (!target) throw new BadRequestException('派发岗位已失效，请刷新');
      const ccRecipients = await this.resolveCc(tx, ccUsernames, [
        target.storeId
      ]);
      return tx.v2OperationalTaskSchedule.create({
        data: {
          id: input.requestId,
          storeId: target.storeId,
          targetKey: target.targetKey,
          targetName: target.targetName,
          title,
          description,
          checklist,
          ccRecipients,
          cadence: input.cadence,
          dueHours: input.dueHours,
          firstRunAt,
          nextRunAt: firstRunAt,
          createdBy: accountId,
          scheduledBy: accountId
        },
        select: { id: true }
      });
    });
  }

  async setScheduleEnabled(accountId: string, id: string, enabled: boolean) {
    return this.write(async (tx) => {
      const access = await this.manageAccess(accountId, tx);
      const schedule = await tx.v2OperationalTaskSchedule.findFirst({
        where: {
          id,
          store: { deletedAt: null },
          storeId: access.storeIds ? { in: access.storeIds } : undefined
        }
      });
      if (!schedule) throw new ForbiddenException('无权操作该循环模板');
      if (schedule.enabled === enabled) return { enabled };
      let nextRunAt = schedule.nextRunAt;
      if (enabled) {
        const target = (
          await this.targets(undefined, tx, schedule.storeId)
        ).find((item) => item.targetKey === schedule.targetKey);
        if (!target)
          throw new BadRequestException('门店或岗位已失效，无法恢复循环');
        const now = Date.now();
        while (nextRunAt.getTime() <= now) {
          nextRunAt = nextTaskRun(
            schedule.cadence,
            schedule.firstRunAt,
            nextRunAt
          );
        }
      }
      await tx.v2OperationalTaskSchedule.update({
        where: { id },
        data: {
          enabled,
          nextRunAt,
          pauseReason: null,
          ...(enabled ? { scheduledBy: accountId } : {})
        }
      });
      return { enabled };
    });
  }

  private async processSchedules() {
    if (this.processingSchedules) return;
    this.processingSchedules = true;
    try {
      const candidates = await this.prisma.v2OperationalTaskSchedule.findMany({
        where: { enabled: true, nextRunAt: { lte: new Date() } },
        orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
        take: 50
      });
      for (const { id } of candidates) {
        try {
          await this.runSchedule(id);
        } catch {
          this.logger.warn(`循环任务 ${id} 派发失败，稍后重试`);
        }
      }
    } catch {
      this.logger.warn('循环任务扫描失败，稍后重试');
    } finally {
      this.processingSchedules = false;
    }
  }

  private async runSchedule(id: string) {
    return this.write(async (tx) => {
      const now = new Date();
      const schedule = await tx.v2OperationalTaskSchedule.findFirst({
        where: { id, enabled: true, nextRunAt: { lte: now } }
      });
      if (!schedule) return;
      const access = await resolveScopedPermission(
        schedule.scheduledBy,
        'operational-task:manage',
        tx
      );
      const target =
        access &&
        (!access.storeIds || access.storeIds.includes(schedule.storeId))
          ? (await this.targets(undefined, tx, schedule.storeId)).find(
              (item) => item.targetKey === schedule.targetKey
            )
          : undefined;
      if (!target) {
        await tx.v2OperationalTaskSchedule.update({
          where: { id },
          data: {
            enabled: false,
            pauseReason: '派发账号授权、门店或岗位已失效'
          }
        });
        return;
      }
      const duration = schedule.dueHours * 3_600_000;
      let slot = schedule.nextRunAt;
      while (slot.getTime() + duration <= now.getTime()) {
        slot = nextTaskRun(schedule.cadence, schedule.firstRunAt, slot);
      }
      const nextRunAt =
        slot > now
          ? slot
          : nextTaskRun(schedule.cadence, schedule.firstRunAt, slot);
      const update = await tx.v2OperationalTaskSchedule.updateMany({
        where: { id, enabled: true, nextRunAt: schedule.nextRunAt },
        data: { nextRunAt }
      });
      if (!update.count || slot > now) return;
      await tx.v2OperationalTask.create({
        data: {
          scheduleId: id,
          scheduledFor: slot,
          batchId: `schedule:${id}:${slot.getTime()}`,
          storeId: target.storeId,
          targetKey: target.targetKey,
          targetName: target.targetName,
          title: schedule.title,
          description: schedule.description,
          ccRecipients: savedCc(schedule.ccRecipients),
          checklist: Array.isArray(schedule.checklist)
            ? schedule.checklist
            : [],
          createdBy: schedule.scheduledBy,
          dueAt: new Date(slot.getTime() + duration)
        }
      });
    });
  }

  async dispatchTargets(accountId: string) {
    const access = await this.manageAccess(accountId, this.prisma);
    return (await this.targets()).filter(
      (target) => !access.storeIds || access.storeIds.includes(target.storeId)
    );
  }

  async dispatch(accountId: string, input: DispatchInput) {
    const title = input.title.trim();
    const description = input.description.trim();
    const checklist = normalizeChecklist(input.checklist);
    const ccUsernames = ccNames(input.ccUsernames);
    const dueAt = new Date(input.dueAt);
    if (!title || !description || !Number.isFinite(dueAt.getTime())) {
      throw new BadRequestException('请填写任务名称、说明和未来的截止时间');
    }
    return this.write(async (tx) => {
      const access = await this.manageAccess(accountId, tx);
      const sourceTaskId = input.sourceTaskId ?? null;
      const sourceItemIndex = input.sourceItemIndex ?? null;
      const revision = input.sourceSubmittedAt
        ? new Date(input.sourceSubmittedAt)
        : null;
      if (revision && !Number.isFinite(revision.getTime())) {
        throw new BadRequestException('提交轮次时间无效');
      }
      const sourceSubmittedAt = revision?.toISOString() ?? null;
      if (
        sourceItemIndex !== null
          ? !sourceTaskId || !sourceSubmittedAt
          : sourceSubmittedAt !== null
      ) {
        throw new BadRequestException('检查项整改必须指定原任务和提交轮次');
      }
      if (
        access.storeIds &&
        input.targets.some(
          (target) => !access.storeIds?.includes(target.storeId)
        )
      ) {
        throw new ForbiddenException('无权向该门店派发任务');
      }
      const requested = new Set(
        input.targets.map((target) => this.targetId(target))
      );
      const previous = await tx.v2OperationalTask.findMany({
        where: { createdBy: accountId, batchId: input.batchId },
        select: {
          storeId: true,
          targetKey: true,
          title: true,
          description: true,
          checklist: true,
          ccRecipients: true,
          dueAt: true,
          originalDueAt: true,
          sourceTaskId: true,
          sourceIssue: true
        }
      });
      if (previous.length) {
        const sameBatch =
          previous.length === requested.size &&
          previous.every(
            (task) =>
              requested.has(this.targetId(task)) &&
              task.title === title &&
              task.description === description &&
              JSON.stringify(task.checklist ?? []) ===
                JSON.stringify(checklist) &&
              (task.originalDueAt ?? task.dueAt).getTime() ===
                dueAt.getTime() &&
              task.sourceTaskId === sourceTaskId &&
              (jsonObject(task.sourceIssue).index ?? null) ===
                sourceItemIndex &&
              (jsonObject(task.sourceIssue).submittedAt ?? null) ===
                sourceSubmittedAt &&
              JSON.stringify(
                savedCc(task.ccRecipients).map((item) => item.username)
              ) === JSON.stringify(ccUsernames)
          );
        if (!sameBatch)
          throw new ConflictException('此派发批次已使用，请重新发起');
        return { count: previous.length };
      }
      let sourceIssue:
        | { index: number; label: string; reason: string; submittedAt: string }
        | undefined;
      if (sourceTaskId) {
        const source = await tx.v2OperationalTask.findFirst({
          where: {
            id: sourceTaskId,
            sourceTaskId: null,
            store: operating,
            status: { in: ['SUBMITTED', 'DONE'] }
          },
          select: {
            storeId: true,
            checklist: true,
            checklistIssues: true,
            submittedAt: true
          }
        });
        if (
          !source ||
          input.targets.some((target) => target.storeId !== source.storeId)
        ) {
          throw new BadRequestException('整改须来自本门店已提交的原任务');
        }
        if (sourceItemIndex !== null) {
          const label = Array.isArray(source.checklist)
            ? source.checklist[sourceItemIndex]
            : null;
          const reason = jsonObject(source.checklistIssues)[
            String(sourceItemIndex)
          ];
          if (
            !sourceSubmittedAt ||
            source.submittedAt?.toISOString() !== sourceSubmittedAt ||
            typeof label !== 'string' ||
            typeof reason !== 'string'
          ) {
            throw new ConflictException(
              '原检查项或提交轮次已变化，请刷新后重新发起'
            );
          }
          sourceIssue = {
            index: sourceItemIndex,
            label,
            reason,
            submittedAt: sourceSubmittedAt
          };
        }
      }
      const candidates = new Map(
        (await this.targets(undefined, tx)).map((target) => [
          this.targetId(target),
          target
        ])
      );
      const targets = [...requested].map((key) => {
        const target = candidates.get(key);
        if (!target)
          throw new BadRequestException('派发目标已失效，请刷新门店岗位');
        return target;
      });

      if (dueAt.getTime() <= Date.now())
        throw new BadRequestException('截止时间必须晚于当前时间');
      const ccRecipients = await this.resolveCc(tx, ccUsernames, [
        ...new Set(targets.map((target) => target.storeId))
      ]);
      await tx.v2OperationalTask.createMany({
        data: targets.map(({ storeId, targetKey, targetName }) => ({
          storeId,
          targetKey,
          targetName,
          sourceTaskId,
          sourceIssue,
          title,
          description,
          checklist,
          ccRecipients,
          dueAt,
          batchId: input.batchId,
          createdBy: accountId
        }))
      });
      return { count: targets.length };
    });
  }

  async claim(accountId: string, id: string) {
    return this.write(async (tx) => {
      const { employeeId, employeeName, task } = await this.employeeTask(
        tx,
        accountId,
        id
      );
      if (task.status === 'CLAIMED' && task.claimerId === employeeId)
        return { status: 'CLAIMED' };
      const now = new Date();
      const result = await tx.v2OperationalTask.updateMany({
        where: { id, status: 'PENDING', claimerId: null, dueAt: { gt: now } },
        data: {
          status: 'CLAIMED',
          claimerId: employeeId,
          claimerName: employeeName,
          claimedAt: now
        }
      });
      if (!result.count)
        throw new ConflictException('任务已被认领或已截止，请刷新待办');
      return { status: 'CLAIMED' };
    });
  }

  async evidence(accountId: string, taskId: string, evidenceId: string) {
    const access = await resolveScopedPermission(
      accountId,
      'operational-task:manage',
      this.prisma
    );
    const manager =
      access &&
      (await this.prisma.v2OperationalTask.findFirst({
        where: {
          id: taskId,
          store: { deletedAt: null },
          storeId: access.storeIds ? { in: access.storeIds } : undefined
        },
        select: { id: true }
      }));
    if (!manager) {
      const { employeeId, task } = await this.employeeTask(
        this.prisma,
        accountId,
        taskId
      );
      if (task.claimerId !== employeeId)
        throw new ForbiddenException('无权查看任务照片');
    }
    const photo = await this.prisma.v2OperationalTaskEvidence.findFirst({
      where: { id: evidenceId, taskId, ...(manager ? {} : { reopenId: null }) },
      select: { image: true }
    });
    if (!photo) throw new ForbiddenException('照片不存在或无权查看');
    return photo.image;
  }

  async submit(
    accountId: string,
    id: string,
    text: string,
    photos: Buffer[],
    checkedItems?: string,
    issueText?: string
  ) {
    const submission = text.trim();
    if (!submission) throw new BadRequestException('请填写完成说明');
    const before = await this.employeeTask(this.prisma, accountId, id);
    if (before.task.claimerId !== before.employeeId)
      throw new ForbiddenException('只有任务认领人可提交');
    if (before.task.status === 'SUBMITTED') return { status: 'SUBMITTED' };
    if (
      before.task.status !== 'CLAIMED' ||
      before.task.dueAt.getTime() <= Date.now()
    )
      throw new ConflictException('任务状态已变更或已截止，请刷新待办');
    if (before.task.sourceTaskId && !photos.length)
      throw new BadRequestException('请至少上传一张整改照片');
    const checklist = Array.isArray(before.task.checklist)
      ? before.task.checklist
      : [];
    const expected = checklist.map((_, index) => String(index)).join(',');
    if (expected && checkedItems !== expected) {
      throw new BadRequestException('请逐项确认检查清单后再提交');
    }
    const checklistIssues = parseChecklistIssues(issueText, checklist.length);
    const images: Array<Awaited<ReturnType<typeof encodeTaskEvidence>>> = [];
    for (const photo of photos) images.push(await encodeTaskEvidence(photo));
    return this.write(async (tx) => {
      const { employeeId, task } = await this.employeeTask(tx, accountId, id);
      if (task.status === 'SUBMITTED' && task.claimerId === employeeId)
        return { status: 'SUBMITTED' };
      const now = new Date();
      const result = await tx.v2OperationalTask.updateMany({
        where: {
          id,
          claimerId: employeeId,
          status: 'CLAIMED',
          claimedAt: before.task.claimedAt,
          dueAt: { gt: now }
        },
        data: {
          status: 'SUBMITTED',
          submission,
          submittedAt: now,
          checklistConfirmed: checklist.length > 0,
          checklistIssues
        }
      });
      if (!result.count)
        throw new ConflictException('任务状态已变更或已截止，请刷新待办');
      for (const image of images) {
        await tx.v2OperationalTaskEvidence.create({
          data: { taskId: id, image }
        });
      }
      const recipients = [
        ...new Set(savedCc(task.ccRecipients).map((item) => item.accountId))
      ];
      await tx.v2OperationalTaskNotification.createMany({
        data: [
          { taskId: id, recipientId: task.createdBy, kind: 'SUBMITTED' },
          ...recipients
            .filter((recipientId) => recipientId !== task.createdBy)
            .map((recipientId) => ({
              taskId: id,
              recipientId,
              kind: 'CC' as const
            }))
        ]
      });
      return { status: 'SUBMITTED' };
    });
  }

  async complete(accountId: string, id: string, submittedAt: string) {
    return this.write(async (tx) => {
      const access = await this.manageAccess(accountId, tx);
      const result = await tx.v2OperationalTask.updateMany({
        where: {
          id,
          status: 'SUBMITTED',
          submittedAt: new Date(submittedAt),
          store: { deletedAt: null },
          storeId: access.storeIds ? { in: access.storeIds } : undefined
        },
        data: { status: 'DONE', reviewedBy: accountId, reviewedAt: new Date() }
      });
      if (!result.count)
        throw new ConflictException('任务不存在或已处理，请刷新列表');
      const task = await tx.v2OperationalTask.findUniqueOrThrow({
        where: { id },
        select: { claimerId: true }
      });
      await this.notifyExecutor(tx, id, task.claimerId, 'COMPLETED');
      return { status: 'DONE' };
    });
  }

  async release(
    accountId: string,
    id: string,
    note: string,
    claimedAt: string
  ) {
    const reason = note.trim();
    if (!reason) throw new BadRequestException('请填写释放认领的原因');
    return this.write(async (tx) => {
      const access = await this.manageAccess(accountId, tx);
      const task = await tx.v2OperationalTask.findFirst({
        where: {
          id,
          store: operating,
          storeId: access.storeIds ? { in: access.storeIds } : undefined
        }
      });
      if (!task) throw new ForbiddenException('无权处理该任务');
      const now = new Date();
      if (
        task.status !== 'CLAIMED' ||
        !task.claimerId ||
        task.claimedAt?.getTime() !== new Date(claimedAt).getTime() ||
        task.dueAt <= now
      ) {
        throw new ConflictException('认领状态已变化或任务已逾期，请刷新');
      }
      const change = await tx.v2OperationalTask.updateMany({
        where: {
          id,
          status: 'CLAIMED',
          claimerId: task.claimerId,
          claimedAt: task.claimedAt,
          dueAt: { gt: now }
        },
        data: {
          status: 'PENDING',
          claimerId: null,
          claimerName: null,
          claimedAt: null
        }
      });
      if (!change.count) throw new ConflictException('任务状态已变化，请刷新');
      await tx.v2OperationalTaskReopen.create({
        data: {
          taskId: id,
          action: 'RELEASE',
          actorId: accountId,
          reason,
          previousClaimerId: task.claimerId,
          previousClaimerName: task.claimerName,
          previousClaimedAt: task.claimedAt,
          previousDueAt: task.dueAt,
          newDueAt: task.dueAt
        }
      });
      await this.notifyExecutor(tx, id, task.claimerId, 'RELEASED', reason);
      return { status: 'PENDING' };
    });
  }

  async reopen(
    accountId: string,
    id: string,
    note: string,
    deadline: string,
    submittedAt: string
  ) {
    const reason = note.trim();
    const dueAt = new Date(deadline);
    if (!reason || !(dueAt.getTime() > Date.now())) {
      throw new BadRequestException('请填写打回原因和新的截止时间');
    }
    return this.write(async (tx) => {
      const access = await this.manageAccess(accountId, tx);
      const task = await tx.v2OperationalTask.findFirst({
        where: {
          id,
          store: operating,
          storeId: access.storeIds ? { in: access.storeIds } : undefined
        }
      });
      if (!task) throw new ForbiddenException('无权处理该任务');
      if (
        task.status !== 'SUBMITTED' ||
        task.submittedAt?.getTime() !== new Date(submittedAt).getTime()
      ) {
        throw new ConflictException('提交版本已变化，请刷新任务后再审核');
      }
      if (dueAt.getTime() <= Date.now())
        throw new BadRequestException('新截止时间已过');
      const change = await tx.v2OperationalTask.updateMany({
        where: { id, status: 'SUBMITTED' },
        data: {
          status: 'PENDING',
          dueAt,
          originalDueAt: task.originalDueAt ?? task.dueAt,
          claimerId: null,
          claimerName: null,
          claimedAt: null,
          submission: null,
          checklistConfirmed: false,
          checklistIssues: Prisma.DbNull,
          submittedAt: null
        }
      });
      if (!change.count) throw new ConflictException('任务状态已变化，请刷新');
      const history = await tx.v2OperationalTaskReopen.create({
        data: {
          taskId: id,
          actorId: accountId,
          reason,
          previousClaimerId: task.claimerId,
          previousClaimerName: task.claimerName,
          previousClaimedAt: task.claimedAt,
          previousSubmission: task.submission,
          checklistConfirmed: task.checklistConfirmed,
          checklistIssues: jsonObject(task.checklistIssues),
          previousSubmittedAt: task.submittedAt,
          previousDueAt: task.dueAt,
          newDueAt: dueAt
        }
      });
      await tx.v2OperationalTaskEvidence.updateMany({
        where: { taskId: id, reopenId: null },
        data: { reopenId: history.id }
      });
      await this.notifyExecutor(tx, id, task.claimerId, 'RETURNED', reason);
      return { status: 'PENDING' };
    });
  }

  private async resolveCc(
    tx: Prisma.TransactionClient,
    usernames: string[],
    storeIds: string[]
  ) {
    const recipients: Array<{ accountId: string; username: string }> = [];
    for (const username of usernames) {
      const account = await tx.v2Account.findUnique({
        where: { username },
        select: { id: true }
      });
      const access =
        account &&
        (await resolveScopedPermission(
          account.id,
          'operational-task:manage',
          tx
        ));
      if (
        !account ||
        !access ||
        storeIds.some(
          (storeId) => access.storeIds && !access.storeIds.includes(storeId)
        )
      ) {
        throw new BadRequestException(
          '抄送账号无效，或未获得全部目标门店的任务管理权限'
        );
      }
      recipients.push({ accountId: account.id, username });
    }
    return recipients;
  }

  private async manageAccess(accountId: string, db: Prisma.TransactionClient) {
    const access = await resolveScopedPermission(
      accountId,
      'operational-task:manage',
      db
    );
    if (!access) throw new ForbiddenException('缺少运营任务权限或门店授权');
    return access;
  }

  private async account(
    accountId: string,
    db: Prisma.TransactionClient = this.prisma
  ) {
    const account = await db.v2Account.findFirst({
      where: {
        id: accountId,
        status: 'ACTIVE',
        deletedAt: null,
        mustChangePassword: false,
        OR: [{ employeeId: null }, { employee: activeEmployee }]
      },
      select: {
        employeeId: true,
        employee: { select: { name: true } },
        roles: {
          where: {
            role: { code: 'super_admin', enabled: true, deletedAt: null }
          },
          select: { roleId: true }
        }
      }
    });
    if (!account) throw new ForbiddenException('账号不可使用运营任务');
    return {
      employeeId: account.employeeId,
      employeeName: account.employee?.name,
      superAdmin: account.roles.length > 0
    };
  }

  private async targets(
    employeeId?: string,
    db: Prisma.TransactionClient = this.prisma,
    storeId?: string
  ) {
    const day = new Date(
      new Date(Date.now() + 28_800_000).toISOString().slice(0, 10)
    );
    const current = {
      employeeId,
      startedOn: { lte: day },
      endedOn: null,
      deletedAt: null,
      employee: activeEmployee
    };
    const [store, org] = await Promise.all([
      db.v2Employment.findMany({
        where: {
          ...current,
          storeId,
          store: operating,
          position: activePosition
        },
        select: {
          store: { select: { id: true, name: true } },
          position: { select: { id: true, name: true } }
        }
      }),
      db.v2OrganizationEmployment.findMany({
        where: {
          ...current,
          costStoreId: storeId,
          costStore: operating,
          position: activePosition
        },
        select: {
          costStore: { select: { id: true, name: true } },
          position: { select: { id: true, name: true } }
        }
      })
    ]);
    const targets: Target[] = [
      ...store.map(({ store, position }) => ({
        storeId: store.id,
        storeName: store.name,
        targetKey: `store:${position.id}`,
        targetName: position.name
      })),
      ...org.flatMap(({ costStore, position }) =>
        costStore
          ? [
              {
                storeId: costStore.id,
                storeName: costStore.name,
                targetKey: `org:${position.id}`,
                targetName: position.name
              }
            ]
          : []
      )
    ];
    return [
      ...new Map(
        targets.map((target) => [this.targetId(target), target])
      ).values()
    ];
  }

  private targetId(target: Pick<Target, 'storeId' | 'targetKey'>) {
    return `${target.storeId}/${target.targetKey}`;
  }

  private async employeeTask(
    tx: Prisma.TransactionClient,
    accountId: string,
    id: string
  ) {
    const { employeeId, employeeName } = await this.account(accountId, tx);
    if (!employeeId || !employeeName)
      throw new ForbiddenException('需要有效员工身份');
    const task = await tx.v2OperationalTask.findFirst({
      where: { id, store: operating }
    });
    if (
      !task ||
      !(await this.targets(employeeId, tx)).some(
        (target) => this.targetId(target) === this.targetId(task)
      )
    ) {
      throw new ForbiddenException('无权处理该门店岗位任务');
    }
    return { task, employeeId, employeeName };
  }

  private async write<T>(action: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(action, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code) ||
          attempt >= 2
        )
          throw error;
      }
    }
  }
}
