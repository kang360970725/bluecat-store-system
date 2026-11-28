import { chinaCsvTime, csvRow } from '../../common/csv';
import { randomUUID } from 'node:crypto';
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
  type V2OperationalTaskReviewMode,
  type V2OperationalTaskStatus
} from '@prisma/client';
import { resolveScopedPermission } from '../../common/scoped-permission';
import { isLiveSuperAdmin } from '../../common/live-super-admin';
import {
  emptyTaskCounts,
  taskStatusLabel,
  type TaskReportQuery
} from './task-report';
import { nextTaskRun } from './task-schedule';
import {
  encodeTaskEvidence,
  maxEvidenceFileSize,
  maxTaskReferenceImages,
  maxEncodedEvidenceTotalSize,
  maxLegacyEvidenceFiles,
  maxRawEvidenceTotalSize
} from './task-evidence';
import { PrismaService } from '../../database/prisma.service';
import { TaskEvidenceObjectStorage } from './task-evidence-storage';
import { V2AttendanceService } from '../v2-attendance/v2-attendance.service';

const operating = { status: 'OPERATING', deletedAt: null } as const;
const activePosition = { enabled: true, deletedAt: null } as const;
const activeEmployee = { status: 'ACTIVE', deletedAt: null } as const;
type ReferenceImage = { objectKey: string; checksumSha256: string };

function taskReferences(value: Prisma.JsonValue | null): ReferenceImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const image = jsonObject(item);
    return typeof image.objectKey === 'string' && typeof image.checksumSha256 === 'string'
      ? [{ objectKey: image.objectKey, checksumSha256: image.checksumSha256 }]
      : [];
  });
}

function sameTaskReferences(value: Prisma.JsonValue | null, references: ReferenceImage[]) {
  const saved = taskReferences(value);
  return saved.length === references.length &&
    saved.every((image, index) => image.checksumSha256 === references[index]?.checksumSha256);
}

const currentEvidence = {
  where: { reopenId: null },
  select: { id: true, checklistItemId: true, byteSize: true },
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
  category?: string;
  batchId: string;
  title: string;
  description: string;
  checklist?: unknown[];
  reviewMode?: V2OperationalTaskReviewMode;
  ccUsernames?: string[];
  dueAt: string;
  sourceTaskId?: string;
  sourceItemIndex?: number;
  sourceSubmittedAt?: string;
  targets: Array<Pick<Target, 'storeId' | 'targetKey'>>;
}

interface ScheduleInput extends Pick<
  DispatchInput,
  'title' | 'description' | 'checklist' | 'ccUsernames' | 'reviewMode' | 'category'
> {
  requestId: string;
  targets: Array<Pick<Target, 'storeId' | 'targetKey'>>;
  cadence: V2OperationalTaskCadence;
  firstRunAt: string;
  dueHours: number;
}

type ChecklistMode = 'CONFIRM' | 'PHOTO_REQUIRED';
type ChecklistItem = { id: string; label: string; mode: ChecklistMode };

export function checklistItems(value: Prisma.JsonValue | unknown[] | null | undefined) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index): ChecklistItem[] => {
    if (typeof entry === 'string') {
      const label = entry.trim();
      return label ? [{ id: String(index), label, mode: 'CONFIRM' }] : [];
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return typeof item.id === 'string' &&
      typeof item.label === 'string' &&
      (item.mode === 'CONFIRM' || item.mode === 'PHOTO_REQUIRED')
      ? [{ id: item.id, label: item.label, mode: item.mode }]
      : [];
  });
}

export function normalizeChecklist(items?: unknown[] | null): ChecklistItem[] {
  const checklist = checklistItems(items);
  if (checklist.length !== (items ?? []).length) {
    throw new BadRequestException('检查项格式无效');
  }
  if (
    checklist.some(
      (item) =>
        !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ||
        !item.label.trim() ||
        item.label.trim().length > 120
    ) ||
    new Set(checklist.map((item) => item.id)).size !== checklist.length ||
    new Set(checklist.map((item) => item.label.trim())).size !== checklist.length
  ) {
    throw new BadRequestException('检查项不能为空、重复或超过 120 字');
  }
  if (checklist.filter((item) => item.mode === 'PHOTO_REQUIRED').length > 12)
    throw new BadRequestException('需要拍照的检查项最多 12 个');
  return checklist.map((item) => ({ ...item, label: item.label.trim() }));
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

function sameCc(value: Prisma.JsonValue | null, selections: string[]) {
  const recipients = savedCc(value);
  return recipients.length === selections.length &&
    recipients.every(({ username, accountId }) =>
      selections.includes(username) || selections.includes(`id:${accountId}`)
    );
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function parseChecklistIssues(value: string | undefined, validIds: Set<string>) {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error();
    const entries = Object.entries(parsed);
    if (
      entries.some(
        ([key, text]) =>
          !validIds.has(key) ||
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
  private draftCleanupTimer?: ReturnType<typeof setInterval>;
  private processingSchedules = false;
  private processingWechat = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly objectStorage: TaskEvidenceObjectStorage,
    private readonly wechat: V2AttendanceService
  ) {}

  onModuleInit() {
    this.draftCleanupTimer = setInterval(
      () => void this.cleanupEvidenceDrafts(),
      3_600_000
    );
    this.draftCleanupTimer.unref();
    void this.cleanupEvidenceDrafts();
    if (!this.config.get<boolean>('app.backgroundJobsEnabled')) return;
    this.scheduleTimer = setInterval(
      () => void this.processBackgroundDispatch(),
      30_000
    );
    this.scheduleTimer.unref();
    void this.processBackgroundDispatch();
  }

  onModuleDestroy() {
    clearInterval(this.scheduleTimer);
    clearInterval(this.draftCleanupTimer);
  }

  private async cleanupEvidenceDrafts() {
    const startedAt = new Date();
    const staleClaim = new Date(startedAt.getTime() - 15 * 60_000);
    try {
      for (let batch = 0; batch < 5; batch++) {
        const drafts = await this.prisma.v2OperationalTaskEvidenceDraft.findMany({
          where: {
            expiresAt: { lte: startedAt },
            OR: [
              { cleanupClaimedAt: null },
              { cleanupClaimedAt: { lte: staleClaim } }
            ]
          },
          select: { id: true, objectKey: true },
          orderBy: { expiresAt: 'asc' },
          take: 100
        });
        if (!drafts.length) break;
        for (const draft of drafts) {
          const claimTime = new Date();
          const claimed =
            await this.prisma.v2OperationalTaskEvidenceDraft.updateMany({
              where: {
                id: draft.id,
                expiresAt: { lte: startedAt },
                OR: [
                  { cleanupClaimedAt: null },
                  { cleanupClaimedAt: { lte: staleClaim } }
                ]
              },
              data: { cleanupClaimedAt: claimTime }
            });
          if (!claimed.count) continue;
          try {
            await this.objectStorage.delete(draft.objectKey);
            await this.prisma.v2OperationalTaskEvidenceDraft.deleteMany({
              where: { id: draft.id, cleanupClaimedAt: claimTime }
            });
          } catch {
            this.logger.warn(`任务暂存图片清理失败：${draft.objectKey}`);
          }
        }
        if (drafts.length < 100) break;
      }
    } catch {
      this.logger.warn('任务暂存图片清理失败，稍后重试');
    }
  }

  private async deleteStoredEvidence(objectKeys: string[]) {
    for (const objectKey of objectKeys) {
      try {
        await this.objectStorage.delete(objectKey);
      } catch {
        this.logger.warn(`任务图片对象清理失败：${objectKey}`);
      }
    }
  }

  async inbox(accountId: string, testStoreId?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const where = await this.inboxScope(accountId, tx, testStoreId);
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
            task: { select: { id: true, title: true, store: { select: { name: true } } } }
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

  async readNotification(accountId: string, id: string, testStoreId?: string) {
    return this.write(async (tx) => {
      const where = await this.inboxScope(accountId, tx, testStoreId);
      await tx.v2OperationalTaskNotification.updateMany({
        where: { ...where, id, readAt: null },
        data: { readAt: new Date() }
      });
      return { read: true };
    });
  }

  private async inboxScope(
    accountId: string,
    tx: Prisma.TransactionClient,
    testStoreId?: string
  ): Promise<Prisma.V2OperationalTaskNotificationWhereInput> {
    const account = await this.account(accountId, tx, testStoreId);
    const access = testStoreId ? null : await resolveScopedPermission(
      accountId,
      'operational-task:manage',
      tx
    );
    const targets = account.employeeId
      ? await this.targets(account.employeeId, tx, testStoreId)
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
        kind: { in: ['ASSIGNED', 'COMPLETED', 'RETURNED', 'RELEASED'] },
        task: {
          store: operating,
          OR: targets.map(({ storeId, targetKey }) => ({ storeId, targetKey }))
        }
      });
    }
    return { recipientId: accountId, OR: or };
  }

  private async notifyAssignment(
    tx: Prisma.TransactionClient,
    task: { id: string; storeId: string; targetKey: string }
  ) {
    const [kind, targetId] = task.targetKey.split(':');
    if (!targetId || !['store', 'org', 'group'].includes(kind)) return;
    const current = {
      startedOn: { lte: new Date(new Date(Date.now() + 28_800_000).toISOString().slice(0, 10)) },
      endedOn: null,
      deletedAt: null,
      position: activePosition
    };
    const target: Prisma.V2EmployeeWhereInput = kind === 'org'
      ? { organizationEmployments: { some: {
          ...current, costStoreId: task.storeId, costStore: operating, positionId: targetId
        } } }
      : { employments: { some: {
          ...current, storeId: task.storeId, store: operating,
          ...(kind === 'group' ? {
            operationalTaskGroups: { some: { group: { id: targetId, storeId: task.storeId, enabled: true } } }
          } : { positionId: targetId })
        } } };
    const recipients = await tx.v2Account.findMany({
      where: {
        status: 'ACTIVE', deletedAt: null, mustChangePassword: false,
        employee: { ...activeEmployee, ...target }
      },
      select: { id: true }
    });
    if (!recipients.length) return;
    await tx.v2OperationalTaskNotification.createMany({
      data: recipients.map(({ id }) => ({ taskId: task.id, recipientId: id, kind: 'ASSIGNED' }))
    });
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

  async list(accountId: string, filters: TaskListFilters, testStoreId?: string) {
    const account = await this.account(accountId, this.prisma, testStoreId);
    const canReviewExtensions = account.superAdmin;
    const [access, reportAccess] = testStoreId ? [null, null] : await Promise.all([
      resolveScopedPermission(
        accountId,
        'operational-task:manage',
        this.prisma
      ),
      resolveScopedPermission(accountId, 'operational-task:report', this.prisma)
    ]);
    const canReport = Boolean(reportAccess);
    const targets = account.employeeId
      ? await this.targets(account.employeeId, this.prisma, testStoreId)
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
          omit: { ccRecipients: true, referenceImages: true, wechatPending: true },
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
        omit: { referenceImages: true, wechatPending: true },
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
    await this.account(accountId);
    const access = await resolveScopedPermission(accountId, 'operational-task:manage', this.prisma);
    return this.prisma.v2OperationalTaskSchedule.findMany({
      where: {
        store: { deletedAt: null },
        archivedAt: null,
        OR: access?.storeIds === null ? undefined : [
          { createdBy: accountId },
          ...(access?.storeIds ? [{ storeId: { in: access.storeIds } }] : [])
        ]
      },
      select: {
        id: true,
        category: true,
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

  async createSchedule(accountId: string, input: ScheduleInput, references: ReferenceImage[] = []) {
    const category = input.category?.trim() || null;
    const title = input.title.trim();
    const description = input.description.trim();
    const checklist = normalizeChecklist(input.checklist);
    const ccUsernames = ccNames(input.ccUsernames);
    const firstRunAt = new Date(input.firstRunAt);
    if (!title || !description || !Number.isFinite(firstRunAt.getTime())) {
      throw new BadRequestException('请填写任务名称、说明和未来的首次派发时间');
    }
    return this.write(async (tx) => {
      await this.account(accountId, tx);
      const requested = new Set(input.targets.map((target) => this.targetId(target)));
      const existing = await tx.v2OperationalTaskSchedule.findMany({
        where: { createdBy: accountId, batchId: input.requestId }
      });
      if (existing.length) {
        const same =
          existing.length === requested.size &&
          existing.every(
            (schedule) =>
              requested.has(this.targetId(schedule)) &&
              schedule.title === title &&
              schedule.category === category &&
              sameTaskReferences(schedule.referenceImages, references) &&
              schedule.description === description &&
              JSON.stringify(schedule.checklist ?? []) === JSON.stringify(checklist) &&
              schedule.reviewMode === (input.reviewMode ?? 'REQUIRED') &&
              sameCc(schedule.ccRecipients, ccUsernames) &&
              schedule.cadence === input.cadence &&
              schedule.firstRunAt.getTime() === firstRunAt.getTime() &&
              schedule.dueHours === input.dueHours
          );
        if (!same) {
          throw new ConflictException('循环模板请求已使用，请重新发起');
        }
        return { count: existing.length, ...(references.length ? { reused: true } : {}) };
      }
      if (firstRunAt.getTime() <= Date.now())
        throw new BadRequestException('首次派发时间必须晚于当前时间');
      const candidates = new Map(
        (await this.targets(undefined, tx)).map((target) => [this.targetId(target), target])
      );
      const targets = [...requested].map((key) => {
        const target = candidates.get(key);
        if (!target) throw new BadRequestException('循环派发目标已失效，请刷新');
        return target;
      });
      const ccRecipients = await this.resolveCc(
        tx,
        ccUsernames,
        [...new Set(targets.map((target) => target.storeId))]
      );
      await tx.v2OperationalTaskSchedule.createMany({
        data: targets.map((target, index) => ({
          id: `${input.requestId}:${index}`,
          batchId: input.requestId,
          storeId: target.storeId,
          targetKey: target.targetKey,
          targetName: target.targetName,
          title,
          category,
          referenceImages: references.length ? references : undefined,
          description,
          checklist,
          ccRecipients,
          reviewMode: input.reviewMode ?? 'REQUIRED',
          cadence: input.cadence,
          dueHours: input.dueHours,
          firstRunAt,
          nextRunAt: firstRunAt,
          createdBy: accountId,
          scheduledBy: accountId
        }))
      });
      return { count: targets.length };
    });
  }

  async setScheduleEnabled(accountId: string, id: string, enabled: boolean, archive = false) {
    return this.write(async (tx) => {
      await this.account(accountId, tx);
      const access = await resolveScopedPermission(accountId, 'operational-task:manage', tx);
      const schedule = await tx.v2OperationalTaskSchedule.findFirst({
        where: {
          id,
          store: { deletedAt: null },
          OR: access?.storeIds === null ? undefined : [
            { createdBy: accountId },
            ...(access?.storeIds ? [{ storeId: { in: access.storeIds } }] : [])
          ]
        }
      });
      if (!schedule) throw new ForbiddenException('无权操作该循环模板');
      if (archive) {
        if (!schedule.archivedAt) {
          await tx.v2OperationalTaskSchedule.update({
            where: { id },
            data: { enabled: false, archivedAt: new Date() }
          });
        }
        return { enabled: false };
      }
      if (schedule.archivedAt) throw new BadRequestException('循环模板已移除');
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

  private async processBackgroundDispatch() {
    await this.processSchedules();
    await this.processWechatDispatch();
  }

  private async processWechatDispatch() {
    if (this.processingWechat || !this.config.get<string>('TASK_WECHAT_TEMPLATE_ID')?.trim()) return;
    this.processingWechat = true;
    try {
      const now = new Date();
      const recent = new Date(now.getTime() - 86_400_000);
      await this.prisma.v2OperationalTask.updateMany({
        where: { wechatPending: true, OR: [
          { dueAt: { lte: now } }, { createdAt: { lt: recent } }, { status: { not: 'PENDING' } }
        ] },
        data: { wechatPending: false }
      });
      const template = await this.wechat.taskWechatTemplate();
      if (!template) return;
      const pending = await this.prisma.v2OperationalTask.findMany({
        where: { wechatPending: true, dueAt: { gt: now }, status: 'PENDING' },
        select: { id: true, title: true, dueAt: true, createdAt: true, storeId: true, targetKey: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 25
      });
      if (!pending.length) return;
      const bindings = await this.prisma.v2AttendanceWechatBinding.findMany({
        where: {
          taskSubscriptionKey: template.key,
          taskSubscribedAt: { lte: now },
          taskOpenIdCipher: { not: null },
          account: {
            status: 'ACTIVE', deletedAt: null, mustChangePassword: false,
            employee: activeEmployee
          }
        },
        select: { accountId: true, taskSubscribedAt: true, taskOpenIdCipher: true,
          account: { select: { employeeId: true } } }
      });
      const recipients = [];
      for (const binding of bindings) {
        if (!binding.account.employeeId || !binding.taskSubscribedAt || !binding.taskOpenIdCipher)
          continue;
        const targets = await this.targets(binding.account.employeeId);
        recipients.push({
          accountId: binding.accountId, subscribedAt: binding.taskSubscribedAt,
          employeeId: binding.account.employeeId,
          openIdCipher: binding.taskOpenIdCipher,
          targets: new Set(targets.map((target) => this.targetId(target)))
        });
      }
      for (const task of pending) {
        const eligible = recipients.filter((recipient) =>
          recipient.subscribedAt <= task.createdAt && recipient.targets.has(this.targetId(task)));
        if (eligible.length) {
          const token = await this.wechat.taskWechatAccessToken(template.appid);
          for (const recipient of eligible) {
            const reserved = await this.write(async (tx) => {
              const active = await tx.v2OperationalTask.findFirst({
                where: { id: task.id, wechatPending: true, status: 'PENDING', dueAt: { gt: new Date() } },
                select: { id: true }
              });
              if (!active) return false;
              const liveTargets = await this.targets(recipient.employeeId, tx, task.storeId);
              if (!liveTargets.some((target) => target.targetKey === task.targetKey))
                return false;
              const used = await tx.v2AttendanceWechatBinding.updateMany({
                where: {
                  accountId: recipient.accountId, taskSubscriptionKey: template.key,
                  taskSubscribedAt: recipient.subscribedAt,
                  account: {
                    employeeId: recipient.employeeId, status: 'ACTIVE', deletedAt: null,
                    mustChangePassword: false, employee: activeEmployee
                  }
                },
                data: { taskSubscribedAt: null, taskOpenIdCipher: null }
              });
              return used.count === 1;
            });
            if (!reserved) continue;
            try {
              await this.wechat.sendTaskWechatMessage(token, recipient.openIdCipher, template, task);
            } catch {
              this.logger.warn(`微信任务提醒未确认送达（任务 ${task.id}）`);
            }
          }
        }
        await this.prisma.v2OperationalTask.updateMany({
          where: { id: task.id, wechatPending: true },
          data: { wechatPending: false }
        });
      }
    } catch {
      this.logger.warn('微信任务提醒处理暂不可用');
    } finally {
      this.processingWechat = false;
    }
  }

  private async runSchedule(id: string) {
    return this.write(async (tx) => {
      const now = new Date();
      const schedule = await tx.v2OperationalTaskSchedule.findFirst({
        where: { id, enabled: true, nextRunAt: { lte: now } }
      });
      if (!schedule) return;
      const sponsor = await this.account(schedule.scheduledBy, tx).catch((error) => {
        if (error instanceof ForbiddenException) return null;
        throw error;
      });
      const target = sponsor
        ? (await this.targets(undefined, tx, schedule.storeId)).find(
            (item) => item.targetKey === schedule.targetKey
          )
        : undefined;
      if (!target) {
        await tx.v2OperationalTaskSchedule.update({
          where: { id },
          data: {
            enabled: false,
            pauseReason: '派发账号、门店或岗位已失效'
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
      const task = await tx.v2OperationalTask.create({
        data: {
          scheduleId: id,
          scheduledFor: slot,
          batchId: `schedule:${id}:${slot.getTime()}`,
          storeId: target.storeId,
          targetKey: target.targetKey,
          targetName: target.targetName,
          title: schedule.title,
          category: schedule.category,
          referenceImages: taskReferences(schedule.referenceImages),
          referenceImageCount: taskReferences(schedule.referenceImages).length,
          wechatPending: Boolean(this.config.get<string>('TASK_WECHAT_TEMPLATE_ID')?.trim()),
          description: schedule.description,
          ccRecipients: savedCc(schedule.ccRecipients),
          checklist: Array.isArray(schedule.checklist)
            ? schedule.checklist
            : [],
          reviewMode: schedule.reviewMode,
          createdBy: schedule.scheduledBy,
          dueAt: new Date(slot.getTime() + duration)
        },
        select: { id: true, storeId: true, targetKey: true }
      });
      await this.notifyAssignment(tx, task);
    });
  }

  async dispatchTargets(accountId: string) {
    await this.account(accountId);
    return this.targets();
  }

  async managementGroups(accountId: string) {
    const access = await this.manageAccess(accountId, this.prisma);
    const day = new Date(
      new Date(Date.now() + 28_800_000).toISOString().slice(0, 10)
    );
    const stores = await this.prisma.v2Store.findMany({
      where: {
        ...operating,
        id: access.storeIds ? { in: access.storeIds } : undefined
      },
      select: {
        id: true,
        name: true,
        operationalTaskExecutorGroups: {
          where: { code: 'management' },
          select: {
            id: true,
            members: { select: { employmentId: true } }
          },
          take: 1
        },
        employments: {
          where: {
            startedOn: { lte: day },
            endedOn: null,
            deletedAt: null,
            employee: activeEmployee,
            position: activePosition
          },
          select: {
            id: true,
            employee: { select: { name: true, employeeNo: true } },
            position: { select: { name: true } }
          },
          orderBy: [{ employee: { name: 'asc' } }, { id: 'asc' }]
        }
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }]
    });
    return stores.map(({ operationalTaskExecutorGroups, ...store }) => ({
      ...store,
      groupId: operationalTaskExecutorGroups[0]?.id ?? null,
      memberEmploymentIds:
        operationalTaskExecutorGroups[0]?.members.map((member) => member.employmentId) ?? []
    }));
  }

  async saveManagementGroup(
    accountId: string,
    storeId: string,
    rawEmploymentIds: string[]
  ) {
    const employmentIds = [...new Set(rawEmploymentIds)];
    return this.write(async (tx) => {
      const access = await this.manageAccess(accountId, tx);
      if (access.storeIds && !access.storeIds.includes(storeId))
        throw new ForbiddenException('无权维护该门店任务执行组');
      const day = new Date(
        new Date(Date.now() + 28_800_000).toISOString().slice(0, 10)
      );
      const valid = await tx.v2Employment.findMany({
        where: {
          id: { in: employmentIds },
          storeId,
          startedOn: { lte: day },
          endedOn: null,
          deletedAt: null,
          employee: activeEmployee,
          position: activePosition,
          store: operating
        },
        select: { id: true }
      });
      if (valid.length !== employmentIds.length)
        throw new BadRequestException('执行组成员已离职、调店或任职失效，请刷新');
      const group = await tx.v2OperationalTaskExecutorGroup.upsert({
        where: { storeId_code: { storeId, code: 'management' } },
        create: {
          storeId,
          code: 'management',
          name: '门店管理组',
          enabled: employmentIds.length > 0,
          createdBy: accountId,
          updatedBy: accountId
        },
        update: {
          enabled: employmentIds.length > 0,
          updatedBy: accountId
        },
        select: { id: true }
      });
      await tx.v2OperationalTaskExecutorGroupMember.deleteMany({
        where: { groupId: group.id }
      });
      if (employmentIds.length) {
        await tx.v2OperationalTaskExecutorGroupMember.createMany({
          data: employmentIds.map((employmentId) => ({
            groupId: group.id,
            employmentId,
            createdBy: accountId
          }))
        });
      }
      return { groupId: group.id, members: employmentIds.length };
    });
  }

  async evidenceStorage(accountId: string) {
    const access = await this.manageAccess(accountId, this.prisma);
    const where: Prisma.V2OperationalTaskEvidenceWhereInput = {
      task: {
        store: { deletedAt: null },
        storeId: access.storeIds ? { in: access.storeIds } : undefined
      }
    };
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [all, recent, drafts] = await Promise.all([
      this.prisma.v2OperationalTaskEvidence.aggregate({
        where,
        _count: { _all: true },
        _sum: { byteSize: true }
      }),
      this.prisma.v2OperationalTaskEvidence.aggregate({
        where: { ...where, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { byteSize: true }
      }),
      this.prisma.v2OperationalTaskEvidenceDraft.aggregate({
        where: {
          expiresAt: { gt: new Date() },
          task: where.task
        },
        _count: { _all: true },
        _sum: { byteSize: true }
      })
    ]);
    return {
      count: all._count._all,
      bytes: all._sum.byteSize ?? 0,
      recentCount: recent._count._all,
      recentBytes: recent._sum.byteSize ?? 0,
      draftCount: drafts._count._all,
      draftBytes: drafts._sum.byteSize ?? 0,
      perImageLimitBytes: 768 * 1024,
      perSubmissionLimitBytes: maxEncodedEvidenceTotalSize
    };
  }

  async ccOptions(accountId: string, rawStoreIds: string[]) {
    await this.account(accountId);
    const storeIds = [
      ...new Set(rawStoreIds.map((storeId) => storeId.trim()).filter(Boolean))
    ];
    if (!storeIds.length) return [];
    if (storeIds.length > 50 || storeIds.some((storeId) => storeId.length > 100))
      throw new BadRequestException('抄送门店范围无效');
    const [accounts, stores] = await Promise.all([
      this.prisma.v2Account.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          mustChangePassword: false
        },
        select: { id: true, username: true, displayName: true },
        orderBy: [{ displayName: 'asc' }, { username: 'asc' }]
      }),
      this.prisma.v2Store.findMany({
        where: operating,
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      })
    ]);
    const storeName = new Map(stores.map((store) => [store.id, store.name]));
    const options = await Promise.all(
      accounts.map(async (account) => ({
        account,
        access: await resolveScopedPermission(
          account.id,
          'operational-task:manage',
          this.prisma
        )
      }))
    );
    return options.flatMap(({ account, access }) => {
      if (
        !access ||
        storeIds.some(
          (storeId) => access.storeIds && !access.storeIds.includes(storeId)
        )
      ) {
        return [];
      }
      return [
        {
          value: `id:${account.id}`,
          displayName: account.displayName,
          allStores: access.storeIds === null,
          stores:
            access.storeIds?.flatMap((storeId) => {
              const name = storeName.get(storeId);
              return name ? [name] : [];
            }) ?? []
        }
      ];
    });
  }

  async dispatch(accountId: string, input: DispatchInput, references: ReferenceImage[] = []) {
    const category = input.category?.trim() || null;
    const title = input.title.trim();
    const description = input.description.trim();
    const checklist = normalizeChecklist(input.checklist);
    const ccUsernames = ccNames(input.ccUsernames);
    const dueAt = new Date(input.dueAt);
    if (!title || !description || !Number.isFinite(dueAt.getTime())) {
      throw new BadRequestException('请填写任务名称、说明和未来的截止时间');
    }
    return this.write(async (tx) => {
      const sourceTaskId = input.sourceTaskId ?? null;
      await this.account(accountId, tx);
      const rectificationAccess = sourceTaskId
        ? await this.manageAccess(accountId, tx)
        : null;
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
        rectificationAccess?.storeIds &&
        input.targets.some(
          (target) => !rectificationAccess.storeIds?.includes(target.storeId)
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
          category: true,
          referenceImages: true,
          description: true,
          checklist: true,
          reviewMode: true,
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
              task.category === category &&
              sameTaskReferences(task.referenceImages, references) &&
              task.description === description &&
              JSON.stringify(task.checklist ?? []) ===
                JSON.stringify(checklist) &&
              task.reviewMode === (input.reviewMode ?? 'REQUIRED') &&
              (task.originalDueAt ?? task.dueAt).getTime() ===
                dueAt.getTime() &&
              task.sourceTaskId === sourceTaskId &&
              (jsonObject(task.sourceIssue).index ?? null) ===
                sourceItemIndex &&
              (jsonObject(task.sourceIssue).submittedAt ?? null) ===
                sourceSubmittedAt &&
              sameCc(task.ccRecipients, ccUsernames)
          );
        if (!sameBatch)
          throw new ConflictException('此派发批次已使用，请重新发起');
        return { count: previous.length, ...(references.length ? { reused: true } : {}) };
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
          const sourceItem = checklistItems(source.checklist)[sourceItemIndex];
          const label = sourceItem?.label;
          const reason = sourceItem
            ? jsonObject(source.checklistIssues)[sourceItem.id]
            : null;
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
      const tasks = targets.map(({ storeId, targetKey, targetName }) => ({
          id: randomUUID(),
          storeId,
          targetKey,
          targetName,
          sourceTaskId,
          sourceIssue,
          title,
          category,
          referenceImages: references.length ? references : undefined,
          referenceImageCount: references.length,
          wechatPending: Boolean(this.config.get<string>('TASK_WECHAT_TEMPLATE_ID')?.trim()),
          description,
          checklist,
          reviewMode: input.reviewMode ?? 'REQUIRED',
          ccRecipients,
          dueAt,
          batchId: input.batchId,
          createdBy: accountId
      }));
      await tx.v2OperationalTask.createMany({ data: tasks });
      for (const task of tasks) await this.notifyAssignment(tx, task);
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

  async dispatchWithReferences(accountId: string, input: DispatchInput, files: Buffer[]) {
    await this.account(accountId);
    if (input.sourceTaskId) await this.manageAccess(accountId, this.prisma);
    return this.withReferenceImages(files, (images) => this.dispatch(accountId, input, images));
  }

  async scheduleWithReferences(accountId: string, input: ScheduleInput, files: Buffer[]) {
    await this.account(accountId);
    return this.withReferenceImages(files, (images) => this.createSchedule(accountId, input, images));
  }

  private async withReferenceImages(
    files: Buffer[],
    publish: (images: ReferenceImage[]) => Promise<{ count: number; reused?: boolean }>
  ) {
    if (files.length > maxTaskReferenceImages || files.some((file) => file.length > maxEvidenceFileSize))
      throw new BadRequestException('参考图片最多三张，单张不超过 5 MB');
    const references: ReferenceImage[] = [];
    let retained = false;
    try {
      for (const file of files) {
        const encoded = await encodeTaskEvidence(file);
        const { objectKey, checksumSha256 } = await this.objectStorage.put(encoded.image);
        references.push({ objectKey, checksumSha256 });
      }
      const result = await publish(references);
      retained = !result.reused;
      return { count: result.count };
    } finally {
      if (!retained) {
        const cleanup = await Promise.allSettled(
          references.map((image) => this.objectStorage.delete(image.objectKey))
        );
        if (cleanup.some(({ status }) => status === 'rejected'))
          this.logger.warn('清理未发布参考图片失败');
      }
    }
  }

  async referenceImage(accountId: string, taskId: string, index: number, testStoreId?: string) {
    const access = testStoreId ? null : await resolveScopedPermission(accountId, 'operational-task:manage', this.prisma);
    const task = await this.prisma.v2OperationalTask.findFirst({
      where: { id: taskId, storeId: testStoreId, store: { deletedAt: null } },
      select: { createdBy: true, storeId: true, referenceImages: true }
    });
    if (!task) throw new ForbiddenException('照片不存在或无权查看');
    const canManage = access && (!access.storeIds || access.storeIds.includes(task.storeId));
    if (!testStoreId && (task.createdBy === accountId || canManage)) {
      await this.account(accountId);
    } else {
      await this.employeeTask(this.prisma, accountId, taskId, testStoreId);
    }
    const photo = Number.isInteger(index) && index >= 0 ? taskReferences(task.referenceImages)[index] : undefined;
    if (!photo) throw new ForbiddenException('照片不存在或无权查看');
    return this.objectStorage.get(photo.objectKey, photo.checksumSha256);
  }

  async assignedDetail(accountId: string, taskId: string, testStoreId?: string) {
    const { task, employeeId } = await this.employeeTask(this.prisma, accountId, taskId, testStoreId);
    if (task.status !== 'PENDING' && task.claimerId !== employeeId)
      throw new ForbiddenException('任务已由同组员工处理');
    const store = await this.prisma.v2Store.findUniqueOrThrow({
      where: { id: task.storeId }, select: { name: true }
    });
    const { id, title, description, dueAt, status, checklist, submission, sourceTaskId,
      referenceImageCount } = task;
    return { id, title, description, dueAt, status, checklist, submission, sourceTaskId,
      referenceImageCount, store };
  }

  async evidence(accountId: string, taskId: string, evidenceId: string, testStoreId?: string) {
    const access = testStoreId ? null : await resolveScopedPermission(
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
        taskId,
        testStoreId
      );
      if (task.claimerId !== employeeId)
        throw new ForbiddenException('无权查看任务照片');
    }
    const photo = await this.prisma.v2OperationalTaskEvidence.findFirst({
      where: { id: evidenceId, taskId, ...(manager ? {} : { reopenId: null }) },
      select: {
        image: true,
        storageProvider: true,
        objectKey: true,
        checksumSha256: true
      }
    });
    if (!photo) throw new ForbiddenException('照片不存在或无权查看');
    if (photo.storageProvider === 'S3' && photo.objectKey) {
      return this.objectStorage.get(photo.objectKey, photo.checksumSha256);
    }
    if (!photo.image) throw new ForbiddenException('照片不存在或无权查看');
    return photo.image;
  }

  async uploadEvidenceDraft(
    accountId: string,
    taskId: string,
    photo: Buffer | undefined,
    checklistItemId?: string,
    testStoreId?: string
  ) {
    if (!photo) throw new BadRequestException('请选择照片');
    const encoded = await encodeTaskEvidence(photo);
    await this.employeeTask(this.prisma, accountId, taskId, testStoreId);
    const stored = await this.objectStorage.put(encoded.image);
    try {
      const result = await this.write(async (tx) => {
        const { task, employeeId } = await this.employeeTask(
          tx,
          accountId,
          taskId,
          testStoreId
        );
        if (
          !['PENDING', 'CLAIMED'].includes(task.status) ||
          (task.status === 'CLAIMED' && task.claimerId !== employeeId) ||
          task.dueAt.getTime() <= Date.now()
        )
          throw new ConflictException('任务已被处理或已截止，请刷新');
        const items = checklistItems(task.checklist);
        if (checklistItemId) {
          const item = items.find((entry) => entry.id === checklistItemId);
          if (!item || item.mode !== 'PHOTO_REQUIRED')
            throw new BadRequestException('照片检查项无效');
        } else if (items.some((item) => item.mode === 'PHOTO_REQUIRED')) {
          throw new BadRequestException('请选择照片对应的检查项');
        }
        await tx.v2OperationalTaskEvidenceDraft.updateMany({
          where: {
            taskId,
            employeeId,
            checklistItemId: checklistItemId ?? null,
            cleanupClaimedAt: null
          },
          data: { expiresAt: new Date() }
        });
        const existing = await tx.v2OperationalTaskEvidenceDraft.aggregate({
          where: {
            taskId,
            employeeId,
            expiresAt: { gt: new Date() },
            cleanupClaimedAt: null
          },
          _sum: { byteSize: true }
        });
        if (
          (existing._sum.byteSize ?? 0) + encoded.byteSize >
          maxEncodedEvidenceTotalSize
        )
          throw new BadRequestException('暂存照片总量超过 9 MB，请减少照片');
        const draft = await tx.v2OperationalTaskEvidenceDraft.create({
          data: {
            taskId,
            employeeId,
            checklistItemId: checklistItemId ?? null,
            objectKey: stored.objectKey,
            etag: stored.etag,
            checksumSha256: stored.checksumSha256,
            byteSize: encoded.byteSize,
            width: encoded.width,
            height: encoded.height,
            expiresAt: new Date(Date.now() + 24 * 3_600_000)
          },
          select: {
            id: true,
            checklistItemId: true,
            byteSize: true,
            expiresAt: true
          }
        });
        return draft;
      });
      return result;
    } catch (error) {
      await this.deleteStoredEvidence([stored.objectKey]);
      throw error;
    }
  }

  async submit(
    accountId: string,
    id: string,
    text: string,
    photos: Buffer[],
    checkedItems?: string,
    issueText?: string,
    confirmedItemsText?: string,
    photoItemIdsText?: string,
    evidenceDraftIdsText?: string,
    testStoreId?: string
  ) {
    const submission = text.trim();
    if (!submission) throw new BadRequestException('请填写完成说明');
    if (
      photos.reduce((sum, photo) => sum + photo.length, 0) >
      maxRawEvidenceTotalSize
    )
      throw new BadRequestException(
        '本次上传原图总量超过 24 MB，请压缩或减少照片'
      );
    const before = await this.employeeTask(this.prisma, accountId, id, testStoreId);
    if (
      (before.task.status === 'SUBMITTED' || before.task.status === 'DONE') &&
      before.task.claimerId === before.employeeId
    )
      return { status: before.task.status };
    if (
      !(
        before.task.status === 'PENDING' ||
        (before.task.status === 'CLAIMED' &&
          before.task.claimerId === before.employeeId)
      ) ||
      before.task.dueAt.getTime() <= Date.now()
    )
      throw new ConflictException('任务状态已变更或已截止，请刷新待办');
    const checklist = checklistItems(before.task.checklist);
    const structured =
      Array.isArray(before.task.checklist) &&
      before.task.checklist.some((item) => typeof item === 'object');
    let confirmedIds: string[] = [];
    try {
      confirmedIds = structured
        ? (JSON.parse(confirmedItemsText ?? '[]') as string[])
        : (checkedItems?.split(',').filter(Boolean) ?? []);
    } catch {
      throw new BadRequestException('检查项确认数据无效');
    }
    const expectedIds = checklist.map((item) => item.id).sort();
    if (
      confirmedIds.length !== expectedIds.length ||
      [...new Set(confirmedIds)].sort().join(',') !== expectedIds.join(',')
    ) {
      throw new BadRequestException('请逐项确认检查清单后再提交');
    }
    let photoItemIds: Array<string | null> = [];
    try {
      photoItemIds = photoItemIdsText
        ? (JSON.parse(photoItemIdsText) as Array<string | null>)
        : photos.map(() => null);
    } catch {
      throw new BadRequestException('照片检查项关联无效');
    }
    if (
      photoItemIds.length !== photos.length ||
      photoItemIds.some(
        (itemId) => itemId !== null && typeof itemId !== 'string'
      )
    )
      throw new BadRequestException('照片检查项关联无效');
    let evidenceDraftIds: string[] = [];
    try {
      evidenceDraftIds = evidenceDraftIdsText
        ? (JSON.parse(evidenceDraftIdsText) as string[])
        : [];
    } catch {
      throw new BadRequestException('暂存照片数据无效');
    }
    if (
      !Array.isArray(evidenceDraftIds) ||
      evidenceDraftIds.some((draftId) => typeof draftId !== 'string') ||
      new Set(evidenceDraftIds).size !== evidenceDraftIds.length
    )
      throw new BadRequestException('暂存照片数据无效');
    const drafts = evidenceDraftIds.length
      ? await this.prisma.v2OperationalTaskEvidenceDraft.findMany({
          where: {
            id: { in: evidenceDraftIds },
            taskId: id,
            employeeId: before.employeeId,
            expiresAt: { gt: new Date() },
            cleanupClaimedAt: null
          }
        })
      : [];
    if (drafts.length !== evidenceDraftIds.length)
      throw new BadRequestException('暂存照片已失效，请重新选择');
    const allPhotoItemIds = [
      ...photoItemIds,
      ...drafts.map((draft) => draft.checklistItemId)
    ];
    if (!structured && photos.length + drafts.length > maxLegacyEvidenceFiles)
      throw new BadRequestException('旧版任务最多上传 3 张照片');
    const requiredIds = new Set(
      checklist
        .filter((item) => item.mode === 'PHOTO_REQUIRED')
        .map((item) => item.id)
    );
    if (
      structured &&
      (allPhotoItemIds.some((itemId) => !itemId || !requiredIds.has(itemId)) ||
        [...requiredIds].some(
          (itemId) =>
            allPhotoItemIds.filter((value) => value === itemId).length !== 1
        ))
    )
      throw new BadRequestException('每个拍照检查项必须且只能上传一张对应照片');
    if (before.task.sourceTaskId && !photos.length && !drafts.length)
      throw new BadRequestException('请至少上传一张整改照片');
    const checklistIssues = parseChecklistIssues(
      issueText,
      new Set(checklist.map((item) => item.id))
    );
    const images: Array<Awaited<ReturnType<typeof encodeTaskEvidence>>> = [];
    for (const photo of photos) images.push(await encodeTaskEvidence(photo));
    if (
      images.reduce((sum, image) => sum + image.byteSize, 0) +
        drafts.reduce((sum, draft) => sum + draft.byteSize, 0) >
      maxEncodedEvidenceTotalSize
    )
      throw new BadRequestException('本次照片压缩后总量超过 9 MB，请减少照片');
    const storedImages = [] as Array<
      Awaited<ReturnType<TaskEvidenceObjectStorage['put']>>
    >;
    try {
      for (const image of images) {
        storedImages.push(await this.objectStorage.put(image.image));
      }
    } catch (error) {
      await this.deleteStoredEvidence(
        storedImages.map((image) => image.objectKey)
      );
      throw error;
    }
    try {
      const outcome = await this.write(async (tx) => {
        const { employeeId, task } = await this.employeeTask(tx, accountId, id, testStoreId);
        if (
          (task.status === 'SUBMITTED' || task.status === 'DONE') &&
          task.claimerId === employeeId
        )
          return { status: task.status, accepted: false };
        const now = new Date();
        const finalStatus =
          task.reviewMode === 'AUTO_COMPLETE' ? 'DONE' : 'SUBMITTED';
        const draftClaimTime = evidenceDraftIds.length ? new Date() : null;
        if (draftClaimTime) {
          const claimedDrafts =
            await tx.v2OperationalTaskEvidenceDraft.updateMany({
              where: {
                id: { in: evidenceDraftIds },
                taskId: id,
                employeeId,
                expiresAt: { gt: now },
                cleanupClaimedAt: null
              },
              data: { cleanupClaimedAt: draftClaimTime }
            });
          if (claimedDrafts.count !== evidenceDraftIds.length)
            throw new BadRequestException('暂存照片已失效，请重新选择');
        }
        const currentDrafts = draftClaimTime
          ? await tx.v2OperationalTaskEvidenceDraft.findMany({
              where: {
                id: { in: evidenceDraftIds },
                taskId: id,
                employeeId,
                cleanupClaimedAt: draftClaimTime
              }
            })
          : [];
        const result = await tx.v2OperationalTask.updateMany({
          where: {
            id,
            OR: [
              { status: 'PENDING', claimerId: null },
              {
                status: 'CLAIMED',
                claimerId: employeeId,
                claimedAt: task.claimedAt
              }
            ],
            dueAt: { gt: now }
          },
          data: {
            status: finalStatus,
            claimerId: employeeId,
            claimerName: before.employeeName,
            claimedAt: task.claimedAt ?? now,
            submission,
            submittedAt: now,
            reviewedBy: finalStatus === 'DONE' ? accountId : null,
            reviewedAt: finalStatus === 'DONE' ? now : null,
            checklistConfirmed: checklist.length > 0,
            checklistIssues
          }
        });
        if (!result.count)
          throw new ConflictException('任务状态已变更或已截止，请刷新待办');
        for (const [index, image] of images.entries()) {
          const stored = storedImages[index];
          await tx.v2OperationalTaskEvidence.create({
            data: {
              taskId: id,
              storageProvider: 'S3',
              objectKey: stored.objectKey,
              etag: stored.etag,
              checksumSha256: stored.checksumSha256,
              checklistItemId: photoItemIds[index],
              byteSize: image.byteSize,
              width: image.width,
              height: image.height
            }
          });
        }
        for (const draft of currentDrafts) {
          await tx.v2OperationalTaskEvidence.create({
            data: {
              taskId: id,
              storageProvider: 'S3',
              objectKey: draft.objectKey,
              etag: draft.etag,
              checksumSha256: draft.checksumSha256,
              contentType: draft.contentType,
              checklistItemId: draft.checklistItemId,
              byteSize: draft.byteSize,
              width: draft.width,
              height: draft.height
            }
          });
        }
        if (currentDrafts.length) {
          await tx.v2OperationalTaskEvidenceDraft.deleteMany({
            where: { id: { in: currentDrafts.map((draft) => draft.id) } }
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
        return { status: finalStatus, accepted: true };
      });
      if (!outcome.accepted) {
        await this.deleteStoredEvidence(
          storedImages.map((image) => image.objectKey)
        );
      }
      return { status: outcome.status };
    } catch (error) {
      await this.deleteStoredEvidence(
        storedImages.map((image) => image.objectKey)
      );
      throw error;
    }
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
    for (const selection of usernames) {
      const account = await tx.v2Account.findFirst({
        where: {
          ...(selection.startsWith('id:')
            ? { id: selection.slice(3) }
            : { username: selection }),
          status: 'ACTIVE',
          deletedAt: null,
          mustChangePassword: false
        },
        select: { id: true, username: true }
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
      if (recipients.some(({ accountId }) => accountId === account.id))
        throw new BadRequestException('抄送账号重复');
      recipients.push({ accountId: account.id, username: account.username });
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
    db: Prisma.TransactionClient = this.prisma,
    testStoreId?: string
  ) {
    const account = await db.v2Account.findFirst({
      where: {
        id: accountId,
        status: 'ACTIVE',
        deletedAt: null,
        mustChangePassword: testStoreId ? undefined : false,
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
    if (!account) {
      if (await isLiveSuperAdmin(db, accountId)) {
        return {
          employeeId: null,
          employeeName: undefined,
          superAdmin: true
        };
      }
      throw new ForbiddenException('账号不可使用运营任务');
    }
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
    const [store, org, groups] = await Promise.all([
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
      }),
      db.v2OperationalTaskExecutorGroup.findMany({
        where: {
          enabled: true,
          storeId,
          store: operating,
          members: {
            some: {
              employment: {
                ...current,
                storeId: storeId ?? undefined,
                position: activePosition
              }
            }
          },
          ...(employeeId
            ? {
                members: {
                  some: {
                    employment: {
                      ...current,
                      storeId: storeId ?? undefined,
                      position: activePosition
                    }
                  }
                }
              }
            : {})
        },
        select: { id: true, name: true, store: { select: { id: true, name: true } } }
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
      ),
      ...groups.map((group) => ({
        storeId: group.store.id,
        storeName: group.store.name,
        targetKey: `group:${group.id}`,
        targetName: group.name
      }))
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
    id: string,
    testStoreId?: string
  ) {
    const { employeeId, employeeName } = await this.account(accountId, tx, testStoreId);
    if (!employeeId || !employeeName)
      throw new ForbiddenException('需要有效员工身份');
    const task = await tx.v2OperationalTask.findFirst({
      where: { id, storeId: testStoreId, store: operating }
    });
    if (
      !task ||
      !(await this.targets(employeeId, tx, testStoreId)).some(
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
