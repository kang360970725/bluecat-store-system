import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { CurrentUser } from '@bluecat/shared';
import { Prisma, V2PayrollBatchStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { V2OperationsService } from '../v2-operations/v2-operations.service';
import {
  CalculatePayrollBatchDto,
  CreatePayrollBatchDto,
  TransitionPayrollBatchDto,
  UpsertStoreProfitDto
} from './dto';
import {
  calculateExcessBonusPool,
  calculatePayroll,
  calculateProfitAchievement
} from './payroll-formulas';

const transitions: Record<V2PayrollBatchStatus, V2PayrollBatchStatus[]> = {
  DRAFT: ['CALCULATED', 'CANCELLED'],
  CALCULATED: ['DRAFT', 'PENDING_REVIEW', 'CANCELLED'],
  PENDING_REVIEW: ['CALCULATED', 'REVIEWED'],
  REVIEWED: ['PENDING_REVIEW', 'APPROVED'],
  APPROVED: ['REVIEWED', 'LOCKED'],
  LOCKED: ['PAID'],
  PAID: [],
  CANCELLED: []
};

@Injectable()
export class V2FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: V2OperationsService
  ) {}

  listBatches() {
    return this.prisma.v2PayrollBatch.findMany({
      orderBy: { payrollMonth: 'desc' },
      select: {
        id: true,
        payrollMonth: true,
        status: true,
        formulaVersion: true,
        monthlyProrationDays: true,
        calculatedAt: true,
        reviewedAt: true,
        approvedAt: true,
        lockedAt: true,
        paidAt: true,
        notes: true,
        createdAt: true
      }
    });
  }

  async createBatch(dto: CreatePayrollBatchDto, user: CurrentUser) {
    const payrollMonth = monthStart(dto.payrollMonth);
    const ranking = await this.operations.storePerformanceRanking(
      this.can(user, 'finance.payroll:view_all_stores') ? undefined : user,
      payrollMonth.toISOString().slice(0, 7)
    );
    const activeStores = await this.prisma.v2Store.findMany({
      where: {
        deletedAt: null,
        status: { not: 'CLOSED' },
        id: { in: ranking.items.map((item) => item.storeId) }
      },
      select: { id: true }
    });
    const activeStoreIds = new Set(activeStores.map((store) => store.id));
    return this.prisma.v2PayrollBatch.create({
      data: {
        payrollMonth,
        formulaVersion: 'PAYROLL_V1_202610',
        monthlyProrationDays: dto.monthlyProrationDays ?? 26,
        notes: dto.notes,
        createdBy: user.id,
        updatedBy: user.id,
        storeProfits: {
          create: ranking.items
            .filter((item) => activeStoreIds.has(item.storeId))
            .map((item) => {
              const achievementRate = calculateProfitAchievement(
                item.profitTarget,
                item.actualProfit
              );
              const { excessProfit, bonusPool } = calculateExcessBonusPool(
                item.profitTarget,
                item.actualProfit
              );
              return {
                storeId: item.storeId,
                targetProfit: item.profitTarget,
                actualProfit: item.actualProfit,
                achievementRate,
                excessProfit,
                bonusPool,
                createdBy: user.id,
                updatedBy: user.id
              };
            })
        }
      }
    });
  }

  async deleteBatch(id: string) {
    const batch = await this.prisma.v2PayrollBatch.findUnique({
      where: { id }
    });
    if (!batch) throw new NotFoundException('工资批次不存在');
    if (batch.status === 'PAID')
      throw new BadRequestException('已发放工资批次不能删除');
    await this.prisma.v2PayrollBatch.delete({ where: { id } });
    return { id };
  }

  async getBatch(id: string, user: CurrentUser, sensitive: boolean) {
    if (sensitive && !this.can(user, 'finance.payroll:view_sensitive'))
      throw new ForbiddenException('无权查看个人工资明细');
    const includeAudit = this.can(user, 'finance.payroll:audit');
    const batch = await this.prisma.v2PayrollBatch.findUnique({
      where: { id },
      include: {
        storeProfits: {
          include: {
            store: {
              select: { id: true, name: true, code: true, status: true }
            }
          },
          orderBy: { store: { code: 'asc' } }
        },
        ...(sensitive ? { employeeResults: true, adjustments: true } : {}),
        ...(includeAudit
          ? {
              auditLogs: { orderBy: { createdAt: 'desc' as const }, take: 100 }
            }
          : {})
      }
    });
    if (!batch) throw new NotFoundException('工资批次不存在');
    batch.storeProfits = batch.storeProfits.filter(
      (item) => item.store.status !== 'CLOSED'
    );
    const activeStoreIds = new Set(
      batch.storeProfits.map((item) => item.storeId)
    );
    if (sensitive && 'employeeResults' in batch)
      batch.employeeResults = batch.employeeResults.filter(
        (item) => !item.storeId || activeStoreIds.has(item.storeId)
      );
    if (sensitive && 'adjustments' in batch)
      batch.adjustments = batch.adjustments.filter(
        (item) => !item.storeId || activeStoreIds.has(item.storeId)
      );
    if (
      !user.roles.includes('super_admin') &&
      !this.can(user, 'finance.payroll:view_all_stores')
    ) {
      batch.storeProfits = batch.storeProfits.filter((item) =>
        user.accessibleStoreIds.includes(item.storeId)
      );
      if (sensitive && 'employeeResults' in batch)
        batch.employeeResults = batch.employeeResults.filter(
          (item) =>
            !item.storeId || user.accessibleStoreIds.includes(item.storeId)
        );
      if (sensitive && 'adjustments' in batch)
        batch.adjustments = batch.adjustments.filter(
          (item) =>
            !item.storeId || user.accessibleStoreIds.includes(item.storeId)
        );
    }
    return batch;
  }

  async upsertStoreProfit(
    batchId: string,
    dto: UpsertStoreProfitDto,
    user: CurrentUser
  ) {
    this.assertStoreScope(user, dto.storeId);
    const batch = await this.requireEditableBatch(batchId);
    if (dto.includedInHeadOffice === false && !dto.exclusionReason)
      throw new BadRequestException('剔除总部平均值时必须填写原因');
    const achievementRate = calculateProfitAchievement(
      dto.targetProfit,
      dto.actualProfit
    );
    const { excessProfit, bonusPool } = calculateExcessBonusPool(
      dto.targetProfit,
      dto.actualProfit
    );
    const before = await this.prisma.v2PayrollStoreProfit.findUnique({
      where: { batchId_storeId: { batchId, storeId: dto.storeId } }
    });
    const data = {
      targetProfit: dto.targetProfit,
      actualProfit: dto.actualProfit,
      achievementRate,
      excessProfit,
      bonusPool,
      includedInHeadOffice: dto.includedInHeadOffice ?? true,
      exclusionReason: dto.exclusionReason,
      exclusionConfirmedBy: dto.includedInHeadOffice === false ? user.id : null,
      exclusionConfirmedAt:
        dto.includedInHeadOffice === false ? new Date() : null,
      updatedBy: user.id
    };
    const result = await this.prisma.v2PayrollStoreProfit.upsert({
      where: { batchId_storeId: { batchId, storeId: dto.storeId } },
      update: data,
      create: { batchId, storeId: dto.storeId, ...data, createdBy: user.id }
    });
    await this.audit(
      batch.id,
      user,
      before ? 'STORE_PROFIT_UPDATED' : 'STORE_PROFIT_CREATED',
      'STORE_PROFIT',
      result.id,
      before,
      result
    );
    return result;
  }

  async transition(
    id: string,
    dto: TransitionPayrollBatchDto,
    user: CurrentUser
  ) {
    const batch = await this.prisma.v2PayrollBatch.findUnique({
      where: { id }
    });
    if (!batch) throw new NotFoundException('工资批次不存在');
    if (!transitions[batch.status].includes(dto.status))
      throw new BadRequestException(
        `不允许从 ${batch.status} 变更为 ${dto.status}`
      );
    const required = transitionPermission(batch.status, dto.status);
    if (!this.can(user, required))
      throw new ForbiddenException(`缺少权限：${required}`);
    if (dto.status === 'REVIEWED' && batch.calculatedBy === user.id)
      throw new ForbiddenException('工资计算人与复核人不能为同一账号');
    if (dto.status === 'APPROVED' && batch.reviewedBy === user.id)
      throw new ForbiddenException('工资复核人与审批人不能为同一账号');
    const isRollback =
      (batch.status === 'CALCULATED' && dto.status === 'DRAFT') ||
      (batch.status === 'PENDING_REVIEW' && dto.status === 'CALCULATED') ||
      (batch.status === 'REVIEWED' && dto.status === 'PENDING_REVIEW') ||
      (batch.status === 'APPROVED' && dto.status === 'REVIEWED');
    if (isRollback && !dto.reason)
      throw new BadRequestException('退回上一步必须填写原因');
    const now = new Date();
    const stamps =
      dto.status === 'CALCULATED'
        ? { calculatedAt: now, calculatedBy: user.id }
        : dto.status === 'REVIEWED'
          ? { reviewedAt: now, reviewedBy: user.id }
          : dto.status === 'APPROVED'
            ? { approvedAt: now, approvedBy: user.id }
            : dto.status === 'LOCKED'
              ? { lockedAt: now, lockedBy: user.id }
              : dto.status === 'PAID'
                ? { paidAt: now, paidBy: user.id }
                : {};
    const result = await this.prisma.v2PayrollBatch.update({
      where: { id },
      data: { status: dto.status, updatedBy: user.id, ...stamps }
    });
    await this.audit(
      id,
      user,
      'BATCH_STATUS_CHANGED',
      'BATCH',
      id,
      { status: batch.status },
      { status: dto.status },
      dto.reason
    );
    return result;
  }

  async calculateBatch(
    id: string,
    dto: CalculatePayrollBatchDto,
    user: CurrentUser
  ) {
    const batch = await this.requireEditableBatch(id);
    const employeeIds = dto.employees.map((item) => item.employeeId);
    if (new Set(employeeIds).size !== employeeIds.length)
      throw new BadRequestException('同一员工只能提交一条汇总工资输入');
    const [employees, profits] = await Promise.all([
      this.prisma.v2Employee.findMany({
        where: { id: { in: employeeIds }, deletedAt: null },
        select: {
          id: true,
          name: true,
          employments: {
            where: { endedOn: null, deletedAt: null },
            include: {
              position: { include: { template: true } }
            }
          },
          organizationEmployments: {
            where: { endedOn: null, deletedAt: null },
            include: { position: true, costStore: true }
          },
          changes: {
            where: { reason: '店长P等级调整' },
            orderBy: { effectiveOn: 'asc' },
            select: { effectiveOn: true, beforeData: true, afterData: true }
          }
        }
      }),
      this.prisma.v2PayrollStoreProfit.findMany({ where: { batchId: id } })
    ]);
    if (employees.length !== employeeIds.length)
      throw new BadRequestException('工资输入中包含不存在的员工');
    const profitByStore = new Map(
      profits.map((item) => [item.storeId, Number(item.achievementRate)])
    );
    const included = profits.filter((item) => item.includedInHeadOffice);
    const headOfficeProfitRate = included.length
      ? included.reduce((sum, item) => sum + Number(item.achievementRate), 0) /
        included.length
      : 0;
    if (
      dto.employees.some((item) => item.employeeType === 'HEAD_OFFICE') &&
      !included.length
    )
      throw new BadRequestException(
        '总部工资计算前必须录入纳入平均值的门店利润'
      );
    const employeeById = new Map(employees.map((item) => [item.id, item]));
    const managerGradeRows =
      await this.prisma.v2PayrollProfileTemplate.findMany({
        where: { employeeType: 'STORE_MANAGER', enabled: true },
        orderBy: { sort: 'asc' }
      });
    const results = dto.employees.map((submittedInput) => {
      const employee = employeeById.get(submittedInput.employeeId)!;
      const storeEmployment = employee.employments.find(
        (item) =>
          !submittedInput.storeId || item.storeId === submittedInput.storeId
      );
      const managerEmployment = employee.organizationEmployments.find(
        (item) => item.position.requiresPGrade
      );
      const payrollMonthEnd = new Date(batch.payrollMonth);
      payrollMonthEnd.setUTCMonth(payrollMonthEnd.getUTCMonth() + 1, 0);
      const futureGradeChange = employee.changes.find(
        (item) => item.effectiveOn > payrollMonthEnd
      );
      const appliedGradeChanges = employee.changes.filter(
        (item) => item.effectiveOn <= payrollMonthEnd
      );
      const latestAppliedGradeChange =
        appliedGradeChanges[appliedGradeChanges.length - 1];
      const historicalGrade = futureGradeChange
        ? (futureGradeChange.beforeData as { grade?: string } | null)?.grade
        : latestAppliedGradeChange
          ? (latestAppliedGradeChange.afterData as { grade?: string } | null)
              ?.grade
          : managerEmployment?.grade;
      const managerGrade = historicalGrade
        ? managerGradeRows.find((item) => item.grade === historicalGrade)
        : undefined;
      const input = {
        ...submittedInput,
        managerStoreId: managerEmployment?.costStoreId ?? undefined,
        ...(storeEmployment?.position.template
          ? {
              employeeType: 'STORE_STAFF' as const,
              compensationType: storeEmployment.compensationType as
                'MONTHLY' | 'HOURLY',
              baseSalary: Number(
                storeEmployment.position.template.monthlyBaseSalary
              ),
              performanceBase: Number(
                storeEmployment.position.template.monthlyPerformanceSalary
              ),
              hourlyRate: Number(storeEmployment.position.template.hourlyRate)
            }
          : managerEmployment
            ? {
                employeeType: 'STORE_MANAGER' as const,
                storeId: undefined,
                grade: historicalGrade ?? undefined,
                compensationType: 'MONTHLY' as const,
                baseSalary: managerGrade
                  ? Number(managerGrade.baseSalary)
                  : submittedInput.baseSalary,
                performanceBase: managerGrade
                  ? Number(managerGrade.performanceBase)
                  : submittedInput.performanceBase
              }
            : {})
      };
      if (input.compensationType !== 'HOURLY')
        input.requiredAttendance = Number(batch.monthlyProrationDays);
      const performanceStoreId =
        input.employeeType === 'STORE_MANAGER'
          ? input.managerStoreId
          : input.storeId;
      if (performanceStoreId) this.assertStoreScope(user, performanceStoreId);
      if (!input.storeId && input.employeeType === 'STORE_STAFF')
        throw new BadRequestException('门店员工必须指定门店');
      if (input.employeeType === 'STORE_MANAGER' && !performanceStoreId)
        throw new BadRequestException('店长必须关联管理门店');
      if (
        input.employeeType === 'HEAD_OFFICE' &&
        !this.can(user, 'finance.payroll:view_all_stores')
      )
        throw new ForbiddenException('总部工资仅限全门店财务权限账号核算');
      const profitRate =
        input.employeeType === 'HEAD_OFFICE'
          ? headOfficeProfitRate
          : input.employeeType === 'STORE_MANAGER'
            ? profitByStore.get(performanceStoreId!)
            : 0;
      if (input.employeeType === 'STORE_MANAGER' && profitRate === undefined)
        throw new BadRequestException(
          `管理门店 ${performanceStoreId} 尚未录入利润`
        );
      const automaticQualified =
        input.requiredAttendance > 0 &&
        input.actualAttendance / input.requiredAttendance >= 0.7;
      if (
        input.attendanceOverride !== undefined &&
        !input.attendanceOverrideReason
      )
        throw new BadRequestException('人工确认出勤门槛必须填写原因');
      const attendanceQualified =
        input.attendanceOverride ?? automaticQualified;
      try {
        return {
          input,
          attendanceQualified,
          calculation: calculatePayroll({
            ...input,
            profitRate: profitRate ?? 0,
            attendanceQualified
          })
        };
      } catch (error) {
        throw new BadRequestException(
          `${employees.find((employee) => employee.id === input.employeeId)?.name}: ${(error as Error).message}`
        );
      }
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.v2PayrollEmployeeResult.deleteMany({
        where: {
          batchId: id,
          employeeId: { notIn: employeeIds }
        }
      });
      for (const { input, attendanceQualified, calculation } of results) {
        const data = {
          storeId: input.storeId,
          employeeType: input.employeeType,
          formulaVersion: batch.formulaVersion,
          inputSnapshot: input as unknown as Prisma.InputJsonValue,
          calculationBreakdown: calculation as Prisma.InputJsonValue,
          grossPay: calculation.grossPay,
          employeeDeductions: calculation.employeeDeductions,
          netPay: calculation.netPay,
          employerContributions: calculation.employerContributions,
          employerCost: calculation.employerCost,
          attendanceQualified,
          attendanceOverride: input.attendanceOverride,
          attendanceOverrideReason: input.attendanceOverrideReason,
          attendanceOverrideBy:
            input.attendanceOverride !== undefined ? user.id : null,
          attendanceOverrideAt:
            input.attendanceOverride !== undefined ? new Date() : null
        };
        await tx.v2PayrollEmployeeResult.upsert({
          where: {
            batchId_employeeId: { batchId: id, employeeId: input.employeeId }
          },
          update: data,
          create: { batchId: id, employeeId: input.employeeId, ...data }
        });
      }
      await tx.v2PayrollBatch.update({
        where: { id },
        data: {
          status: 'CALCULATED',
          calculatedAt: new Date(),
          calculatedBy: user.id,
          updatedBy: user.id
        }
      });
      await tx.v2PayrollAuditLog.create({
        data: {
          batchId: id,
          action: 'PAYROLL_CALCULATED',
          entityType: 'BATCH',
          entityId: id,
          afterData: { employeeCount: results.length, headOfficeProfitRate },
          actorId: user.id,
          actorName: user.nickname || user.username
        }
      });
    });
    const total = (key: 'grossPay' | 'netPay' | 'employerCost') =>
      Math.round(
        results.reduce((sum, item) => sum + item.calculation[key], 0) * 100
      ) / 100;
    return {
      batchId: id,
      status: 'CALCULATED',
      employeeCount: results.length,
      headOfficeProfitRate,
      totals: {
        grossPay: total('grossPay'),
        netPay: total('netPay'),
        employerCost: total('employerCost')
      }
    };
  }

  private async requireEditableBatch(id: string) {
    const batch = await this.prisma.v2PayrollBatch.findUnique({
      where: { id }
    });
    if (!batch) throw new NotFoundException('工资批次不存在');
    if (!['DRAFT', 'CALCULATED'].includes(batch.status))
      throw new BadRequestException('当前批次已进入复核流程，不能修改基础数据');
    return batch;
  }
  private assertStoreScope(user: CurrentUser, storeId: string) {
    if (
      !user.roles.includes('super_admin') &&
      !this.can(user, 'finance.payroll:view_all_stores') &&
      !user.accessibleStoreIds.includes(storeId)
    )
      throw new ForbiddenException('无权访问该门店工资数据');
  }
  private can(user: CurrentUser, permission: string) {
    return (
      user.roles.includes('super_admin') ||
      user.permissions.includes(permission)
    );
  }
  private audit(
    batchId: string,
    user: CurrentUser,
    action: string,
    entityType: string,
    entityId: string | null,
    beforeData: unknown,
    afterData: unknown,
    reason?: string
  ) {
    return this.prisma.v2PayrollAuditLog.create({
      data: {
        batchId,
        action,
        entityType,
        entityId,
        beforeData: beforeData as object | undefined,
        afterData: afterData as object | undefined,
        reason,
        actorId: user.id,
        actorName: user.nickname || user.username
      }
    });
  }
}

function monthStart(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException('工资月份格式错误');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function transitionPermission(
  current: V2PayrollBatchStatus,
  status: V2PayrollBatchStatus
) {
  if (current === 'APPROVED' && status === 'REVIEWED')
    return 'finance.payroll:lock';
  if (current === 'REVIEWED' && status === 'PENDING_REVIEW')
    return 'finance.payroll:approve';
  if (current === 'PENDING_REVIEW' && status === 'CALCULATED')
    return 'finance.payroll:review';
  if (
    status === 'DRAFT' ||
    (current === 'CALCULATED' && status === 'PENDING_REVIEW')
  )
    return 'finance.payroll:calculate';
  if (status === 'REVIEWED') return 'finance.payroll:review';
  if (status === 'APPROVED') return 'finance.payroll:approve';
  if (status === 'LOCKED') return 'finance.payroll:lock';
  if (status === 'PAID') return 'finance.payroll:pay';
  return 'finance.payroll:manage';
}
