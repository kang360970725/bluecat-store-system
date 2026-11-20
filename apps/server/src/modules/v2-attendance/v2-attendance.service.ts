import { chinaCsvTime, csvRow } from '../../common/csv';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type V2AttendancePunchKind } from '@prisma/client';
import { compare } from 'bcryptjs';
import { resolveScopedPermission } from '../../common/scoped-permission';
import { PrismaService } from '../../database/prisma.service';
import {
  digest,
  isClockInTime,
  normalizeBssid,
  shiftBounds
} from './attendance-code';

const activeAccount = { status: 'ACTIVE', deletedAt: null } as const;
const activeEmployee = { status: 'ACTIVE', deletedAt: null } as const;
const operatingStore = { status: 'OPERATING', deletedAt: null } as const;

const attendanceRecordSelect = {
  id: true,
  workDate: true,
  employee: { select: { name: true, employeeNo: true } },
  period: { select: { store: { select: { name: true } } } },
  shift: {
    select: {
      name: true,
      startsAt: true,
      endsAt: true,
      spansNextDay: true
    }
  },
  attendancePunches: {
    select: {
      kind: true,
      punchedAt: true,
      terminalId: true,
      wifiNetworkId: true
    }
  }
} satisfies Prisma.V2ScheduleAssignmentSelect;

@Injectable()
export class V2AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async wifiNetworks(accountId: string, storeId: string) {
    await this.requireStorePermission(accountId, storeId, 'schedule:update');
    return this.prisma.v2AttendanceWifiNetwork.findMany({
      where: { storeId, enabled: true, deletedAt: null },
      select: { id: true, bssid: true, label: true },
      orderBy: [{ label: 'asc' }, { bssid: 'asc' }]
    });
  }

  async saveWifiNetworks(
    accountId: string,
    storeId: string,
    networks: Array<{ bssid: string; label?: string }>
  ) {
    const normalized = networks.map((item) => ({
      bssid: normalizeBssid(item.bssid),
      label: item.label?.trim() || null
    }));
    if (
      new Set(normalized.map((item) => item.bssid)).size !== normalized.length
    )
      throw new BadRequestException('同一个 Wi-Fi BSSID 不能重复配置');

    return this.write(async (tx) => {
      await this.requireStorePermission(
        accountId,
        storeId,
        'schedule:update',
        tx
      );
      const now = new Date();
      await tx.v2AttendanceWifiNetwork.updateMany({
        where: {
          storeId,
          deletedAt: null,
          ...(normalized.length
            ? { bssid: { notIn: normalized.map((item) => item.bssid) } }
            : {})
        },
        data: { enabled: false, deletedAt: now, updatedBy: accountId }
      });
      for (const item of normalized) {
        await tx.v2AttendanceWifiNetwork.upsert({
          where: { storeId_bssid: { storeId, bssid: item.bssid } },
          update: {
            label: item.label,
            enabled: true,
            deletedAt: null,
            updatedBy: accountId
          },
          create: {
            storeId,
            bssid: item.bssid,
            label: item.label,
            createdBy: accountId,
            updatedBy: accountId
          }
        });
      }
      return tx.v2AttendanceWifiNetwork.findMany({
        where: { storeId, enabled: true, deletedAt: null },
        select: { id: true, bssid: true, label: true },
        orderBy: [{ label: 'asc' }, { bssid: 'asc' }]
      });
    });
  }

  async bind(accountId: string, password: string, wechatCode: string) {
    const account = await this.prisma.v2Account.findFirst({
      where: {
        id: accountId,
        ...activeAccount,
        mustChangePassword: false,
        employee: activeEmployee
      },
      select: { passwordHash: true }
    });
    if (!account || !(await compare(password, account.passwordHash))) {
      throw new UnauthorizedException('员工账号不可绑定或密码错误');
    }
    const subject = await this.wechatSubject(wechatCode);
    try {
      await this.prisma.v2AttendanceWechatBinding.create({
        data: { accountId, subject }
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      const existing = await this.prisma.v2AttendanceWechatBinding.findUnique({
        where: { accountId }
      });
      if (existing?.subject !== subject)
        throw new ConflictException('微信或员工账号已绑定，请联系人事');
    }
    return { bound: true };
  }

  async assignments(wechatCode: string, workDate?: string) {
    const employeeId = await this.employeeFor(
      await this.wechatSubject(wechatCode)
    );
    const today = this.localDate(new Date());
    const yesterday = new Date(today.getTime() - 86_400_000);
    const tomorrow = new Date(today.getTime() + 86_400_000);
    return this.prisma.v2ScheduleAssignment.findMany({
      where: {
        ...this.assignmentScope(employeeId),
        workDate: workDate
          ? new Date(workDate)
          : { gte: yesterday, lte: tomorrow }
      },
      select: {
        id: true,
        workDate: true,
        period: {
          select: { storeId: true, store: { select: { name: true } } }
        },
        shift: {
          select: {
            name: true,
            startsAt: true,
            endsAt: true,
            spansNextDay: true
          }
        },
        attendancePunches: {
          select: {
            kind: true,
            punchedAt: true,
            terminalId: true,
            wifiNetworkId: true
          }
        },
        attendanceCorrections: {
          select: { kind: true, status: true, reviewNote: true },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: [{ workDate: 'desc' }, { id: 'asc' }]
    });
  }

  async wifiPunch(
    wechatCode: string,
    assignmentId: string,
    bssid: string,
    kind: V2AttendancePunchKind
  ) {
    const window = this.config.get<string>(
      kind === 'IN'
        ? 'ATTENDANCE_CLOCK_IN_EARLY_MINUTES'
        : 'ATTENDANCE_CLOCK_OUT_LATE_MINUTES'
    );
    if (!/^\d{1,3}$/.test(window ?? ''))
      throw new ServiceUnavailableException('尚未配置打卡时间窗口');

    const normalizedBssid = normalizeBssid(bssid);
    const subject = await this.wechatSubject(wechatCode);
    return this.write(async (tx) => {
      const employeeId = await this.employeeFor(subject, tx);
      const assignment = await tx.v2ScheduleAssignment.findFirst({
        where: { id: assignmentId, ...this.assignmentScope(employeeId) },
        include: {
          shift: true,
          period: true,
          attendancePunches: { where: { kind } }
        }
      });
      if (!assignment || assignment.shift.storeId !== assignment.period.storeId)
        throw new ForbiddenException('无权为该排班打卡');

      const network = await tx.v2AttendanceWifiNetwork.findFirst({
        where: {
          storeId: assignment.period.storeId,
          bssid: normalizedBssid,
          enabled: true,
          deletedAt: null,
          store: operatingStore
        },
        select: { id: true, storeId: true }
      });
      if (!network)
        throw new ForbiddenException('当前 Wi-Fi 未在该排班门店登记');

      const existing = assignment.attendancePunches[0];
      if (existing) return existing;
      const now = Date.now();
      const { starts, ends } = shiftBounds(
        assignment.workDate,
        assignment.shift
      );
      const allowed =
        kind === 'IN'
          ? isClockInTime(
              assignment.workDate,
              assignment.shift,
              Number(window),
              now
            )
          : now >= starts && now <= ends + Number(window) * 60_000;
      if (!allowed) throw new BadRequestException('当前不在该班次的打卡窗口');

      await this.ensurePunchOrder(tx, assignmentId, kind, new Date(now));
      const punch = await tx.v2AttendancePunch.create({
        data: {
          assignmentId,
          kind,
          wifiNetworkId: network.id,
          employeeId,
          storeId: network.storeId,
          workDate: assignment.workDate,
          punchedAt: new Date(now)
        }
      });
      await tx.v2AttendanceCorrection.updateMany({
        where: { assignmentId, kind, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          pendingKey: null,
          reviewedAt: new Date(now),
          reviewNote: '已取得正常 Wi-Fi 打卡记录，补卡申请自动关闭'
        }
      });
      return punch;
    });
  }

  async requestCorrection(
    wechatCode: string,
    assignmentId: string,
    kind: V2AttendancePunchKind,
    requestedTime: string,
    reason: string
  ) {
    const time = new Date(requestedTime);
    if (
      !Number.isFinite(time.getTime()) ||
      time.getTime() > Date.now() ||
      !reason.trim()
    )
      throw new BadRequestException('请填写有效的补卡时间和原因');
    const subject = await this.wechatSubject(wechatCode);
    return this.write(async (tx) => {
      const employeeId = await this.employeeFor(subject, tx);
      const assignment = await tx.v2ScheduleAssignment.findFirst({
        where: { id: assignmentId, ...this.assignmentScope(employeeId) },
        include: { shift: true, attendancePunches: { where: { kind } } }
      });
      if (!assignment) throw new ForbiddenException('无权为该班次申请补卡');
      const { starts, ends } = shiftBounds(
        assignment.workDate,
        assignment.shift
      );
      if (!Number.isFinite(starts) || starts > Date.now())
        throw new BadRequestException('班次尚未开始');
      if (
        time.getTime() < starts - 86_400_000 ||
        time.getTime() > ends + 86_400_000
      )
        throw new BadRequestException('补卡时间与班次日期不符');
      if (assignment.attendancePunches.length)
        throw new ConflictException('该班次已有此类打卡');
      const pendingKey = `${assignmentId}:${kind}`;
      const pending = await tx.v2AttendanceCorrection.findUnique({
        where: { pendingKey }
      });
      if (pending) return pending;
      return tx.v2AttendanceCorrection.create({
        data: {
          assignmentId,
          kind,
          requestedTime: time,
          reason: reason.trim(),
          pendingKey
        }
      });
    });
  }

  async records(
    accountId: string,
    workDate: string,
    storeId: string | undefined,
    page: number
  ) {
    const access = await this.attendanceAccess(accountId, 'attendance:view');
    if (storeId && access.storeIds && !access.storeIds.includes(storeId)) {
      throw new ForbiddenException('无权查看该门店考勤');
    }
    const [stores, rows] = await Promise.all([
      this.prisma.v2Store.findMany({
        where: {
          deletedAt: null,
          id: access.storeIds ? { in: access.storeIds } : undefined
        },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }]
      }),
      this.prisma.v2ScheduleAssignment.findMany({
        where: {
          workDate: new Date(workDate),
          period: {
            status: { in: ['PUBLISHED', 'LOCKED'] },
            store: { deletedAt: null },
            storeId:
              storeId ?? (access.storeIds ? { in: access.storeIds } : undefined)
          }
        },
        select: attendanceRecordSelect,
        orderBy: { id: 'asc' },
        skip: (page - 1) * 50,
        take: 51
      })
    ]);
    return {
      stores,
      rows: rows.slice(0, 50),
      hasNext: rows.length > 50,
      canExport: await this.canExport(
        accountId,
        storeId ? [storeId] : access.storeIds,
        this.prisma
      )
    };
  }

  private async canExport(
    accountId: string,
    requestedStores: string[] | null,
    tx: Prisma.TransactionClient
  ) {
    const access = await resolveScopedPermission(
      accountId,
      'attendance:export',
      tx
    );
    const allowed = access?.storeIds;
    return (
      allowed === null ||
      Boolean(
        allowed &&
        requestedStores &&
        requestedStores.every((id) => allowed.includes(id))
      )
    );
  }

  async exportMonth(accountId: string, month: string, storeId?: string) {
    const first = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(first);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const rows = await this.prisma.$transaction(
      async (tx) => {
        const access = await this.attendanceAccess(
          accountId,
          'attendance:view',
          tx
        );
        if (storeId && access.storeIds && !access.storeIds.includes(storeId)) {
          throw new ForbiddenException('无权查看该门店考勤');
        }
        if (
          !(await this.canExport(
            accountId,
            storeId ? [storeId] : access.storeIds,
            tx
          ))
        ) {
          throw new ForbiddenException('缺少所选门店的考勤导出权限');
        }
        return tx.v2ScheduleAssignment.findMany({
          where: {
            workDate: { gte: first, lt: end },
            period: {
              status: { in: ['PUBLISHED', 'LOCKED'] },
              store: { deletedAt: null },
              storeId:
                storeId ??
                (access.storeIds ? { in: access.storeIds } : undefined)
            }
          },
          select: attendanceRecordSelect,
          orderBy: [{ workDate: 'asc' }, { id: 'asc' }],
          take: 10001
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
    if (rows.length > 10000)
      throw new BadRequestException(
        '单次最多导出 10000 个班次，请选择单个门店'
      );
    const header = csvRow([
      '排班日',
      '门店',
      '工号',
      '员工',
      '班次',
      '计划上班',
      '计划下班',
      '上班卡（北京时间）',
      '上班来源',
      '下班卡（北京时间）',
      '下班来源'
    ]);
    const records = rows.map((row) => {
      const clockIn = row.attendancePunches.find(
        (punch) => punch.kind === 'IN'
      );
      const clockOut = row.attendancePunches.find(
        (punch) => punch.kind === 'OUT'
      );
      return csvRow([
        row.workDate.toISOString().slice(0, 10),
        row.period.store.name,
        row.employee.employeeNo,
        row.employee.name,
        row.shift.name,
        row.shift.startsAt,
        (row.shift.spansNextDay ? '次日 ' : '') + row.shift.endsAt,
        chinaCsvTime(clockIn?.punchedAt ?? null),
        clockIn
          ? clockIn.wifiNetworkId
            ? 'Wi-Fi'
            : clockIn.terminalId
              ? '扫码（历史）'
              : '补卡'
          : '暂无记录',
        chinaCsvTime(clockOut?.punchedAt ?? null),
        clockOut
          ? clockOut.wifiNetworkId
            ? 'Wi-Fi'
            : clockOut.terminalId
              ? '扫码（历史）'
              : '补卡'
          : '暂无记录'
      ]);
    });
    return '\uFEFF' + [header, ...records].join('\r\n') + '\r\n';
  }

  async corrections(accountId: string, history = false) {
    const access = await this.attendanceAccess(accountId, 'attendance:review');
    const rows = await this.prisma.v2AttendanceCorrection.findMany({
      where: {
        status: history ? { in: ['APPROVED', 'REJECTED'] } : 'PENDING',
        assignment: {
          employeeId: access.employeeId
            ? { not: access.employeeId }
            : undefined,
          period: {
            store: { deletedAt: null },
            storeId: access.storeIds ? { in: access.storeIds } : undefined
          }
        }
      },
      select: {
        id: true,
        kind: true,
        requestedTime: true,
        reason: true,
        createdAt: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
        reviewedBy: true,
        assignment: {
          select: {
            workDate: true,
            employee: { select: { name: true } },
            period: { select: { store: { select: { name: true } } } }
          }
        }
      },
      orderBy: history
        ? [{ reviewedAt: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100
    });
    const ids = [
      ...new Set(
        rows.flatMap((row) => (row.reviewedBy ? [row.reviewedBy] : []))
      )
    ];
    const reviewers = ids.length
      ? await this.prisma.v2Account.findMany({
          where: { id: { in: ids } },
          select: { id: true, displayName: true }
        })
      : [];
    const names = new Map(
      reviewers.map((reviewer) => [reviewer.id, reviewer.displayName])
    );
    return rows.map(({ reviewedBy, ...row }) => ({
      ...row,
      reviewerName: reviewedBy ? (names.get(reviewedBy) ?? '历史审核人') : null
    }));
  }

  async review(accountId: string, id: string, approved: boolean, note: string) {
    if (!note.trim()) throw new BadRequestException('请填写审核说明');
    return this.write(async (tx) => {
      const reviewer = await this.attendanceAccess(
        accountId,
        'attendance:review',
        tx
      );
      const correction = await tx.v2AttendanceCorrection.findFirst({
        where: { id, assignment: { period: { store: { deletedAt: null } } } },
        include: { assignment: { include: { period: true } } }
      });
      if (
        !correction ||
        (reviewer.storeIds &&
          !reviewer.storeIds.includes(correction.assignment.period.storeId))
      ) {
        throw new ForbiddenException('无权处理该补卡申请');
      }
      const { assignment, kind } = correction;
      if (assignment.employeeId === reviewer.employeeId)
        throw new ForbiddenException('不能审核自己的补卡');
      if (correction.status !== 'PENDING')
        throw new ConflictException('补卡申请已处理');
      const reviewedAt = new Date();
      if (approved) {
        const existing = await tx.v2AttendancePunch.findUnique({
          where: { assignmentId_kind: { assignmentId: assignment.id, kind } }
        });
        if (existing) throw new ConflictException('该班次已有此类打卡');
        await this.ensurePunchOrder(
          tx,
          assignment.id,
          kind,
          correction.requestedTime
        );
        await tx.v2AttendancePunch.create({
          data: {
            assignmentId: assignment.id,
            kind,
            employeeId: assignment.employeeId,
            storeId: assignment.period.storeId,
            workDate: assignment.workDate,
            punchedAt: correction.requestedTime
          }
        });
      }
      return tx.v2AttendanceCorrection.update({
        where: { id },
        data: {
          status: approved ? 'APPROVED' : 'REJECTED',
          pendingKey: null,
          reviewedAt,
          reviewedBy: accountId,
          reviewNote: note.trim()
        }
      });
    });
  }

  private async ensurePunchOrder(
    tx: Prisma.TransactionClient,
    assignmentId: string,
    kind: V2AttendancePunchKind,
    time: Date
  ) {
    const other = await tx.v2AttendancePunch.findUnique({
      where: {
        assignmentId_kind: { assignmentId, kind: kind === 'IN' ? 'OUT' : 'IN' }
      },
      select: { punchedAt: true }
    });
    if (
      other &&
      (kind === 'IN' ? time > other.punchedAt : time < other.punchedAt)
    ) {
      throw new ConflictException('上班时间不能晚于下班时间，请核对打卡记录');
    }
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
          !['P2002', 'P2034'].includes(error.code) ||
          attempt >= 2
        )
          throw error;
      }
    }
  }

  private assignmentScope(
    employeeId: string
  ): Prisma.V2ScheduleAssignmentWhereInput {
    return {
      employeeId,
      period: { status: { in: ['PUBLISHED', 'LOCKED'] }, store: operatingStore }
    };
  }

  private localDate(now: Date) {
    const chinaTime = new Date(now.getTime() + 8 * 3_600_000);
    chinaTime.setUTCHours(0, 0, 0, 0);
    return chinaTime;
  }

  private async employeeFor(
    subject: string,
    db: Prisma.TransactionClient = this.prisma
  ) {
    const binding = await db.v2AttendanceWechatBinding.findFirst({
      where: {
        subject,
        account: { ...activeAccount, employee: activeEmployee }
      },
      select: { account: { select: { employeeId: true } } }
    });
    if (!binding?.account.employeeId)
      throw new UnauthorizedException('微信未绑定有效员工账号');
    return binding.account.employeeId;
  }

  private async attendanceAccess(
    accountId: string,
    permission: 'attendance:view' | 'attendance:review',
    db: Prisma.TransactionClient = this.prisma
  ) {
    const access = await resolveScopedPermission(accountId, permission, db);
    if (!access) throw new ForbiddenException('缺少考勤权限或门店授权');
    return access;
  }

  private async requireStorePermission(
    accountId: string,
    storeId: string,
    permission: 'schedule:update',
    db: Prisma.TransactionClient = this.prisma
  ) {
    const access = await resolveScopedPermission(accountId, permission, db);
    if (!access || (access.storeIds && !access.storeIds.includes(storeId)))
      throw new ForbiddenException('缺少该门店的排班维护权限');
    const store = await db.v2Store.findFirst({
      where: { id: storeId, deletedAt: null },
      select: { id: true }
    });
    if (!store) throw new BadRequestException('门店不存在');
    return access;
  }

  private async wechatSubject(code: string) {
    const appid = this.config.get<string>('ATTENDANCE_WECHAT_APP_ID');
    const secret = this.config.get<string>('ATTENDANCE_WECHAT_APP_SECRET');
    if (!appid || !secret)
      throw new ServiceUnavailableException('员工小程序尚未配置');
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.search = new URLSearchParams({
      appid,
      secret,
      js_code: code,
      grant_type: 'authorization_code'
    }).toString();
    let result: { openid?: string; errcode?: number };
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('WeChat HTTP error');
      result = (await response.json()) as typeof result;
    } catch {
      throw new ServiceUnavailableException('微信登录服务暂不可用，请重试');
    }
    if (
      result?.errcode ||
      typeof result?.openid !== 'string' ||
      !result.openid
    ) {
      throw new UnauthorizedException('微信登录已失效，请重新登录');
    }
    return digest(`${appid}:${result.openid}`);
  }
}
