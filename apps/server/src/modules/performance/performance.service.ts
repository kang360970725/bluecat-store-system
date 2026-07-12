import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { CurrentUser } from '@bluecat/shared';
import { ScheduleRole, type Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreatePerformanceTargetDto,
  GeneratePerformanceSplitDto,
  UpdatePerformanceSplitItemDto,
  UpdatePerformanceTargetDto,
  UpsertEmployeeScheduleDto
} from './dto/performance.dto';

const COST_FIELDS = [
  'managementFee',
  'rent',
  'propertyTrashFee',
  'utilities',
  'drinkMaterial',
  'mealMaterial',
  'welfare',
  'salary',
  'franchiseFee',
  'baseOperationSoftware',
  'storeOperation',
  'advertisingMaterial',
  'financeTax',
  'withdrawalFee'
] as const;

type CostField = (typeof COST_FIELDS)[number];

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async listMonthly(monthValue: string | undefined, user: CurrentUser) {
    const month = this.parseMonth(monthValue);
    const stores = await this.prisma.store.findMany({
      where: this.storeScope(user),
      select: {
        id: true,
        name: true,
        code: true,
        performanceTargets: {
          where: {
            month,
            deletedAt: null
          },
          take: 1
        },
        performanceActuals: {
          where: {
            month,
            deletedAt: null
          }
        },
        performanceEstimates: {
          where: {
            month,
            deletedAt: null
          }
        }
      },
      orderBy: {
        code: 'asc'
      }
    });

    const rows = stores.map((store) => {
      const target = store.performanceTargets[0] ?? null;
      const actualRevenue = this.sumDecimals(
        store.performanceActuals.map((item) => item.amount)
      );
      const estimatedRevenue = this.sumDecimals(
        store.performanceEstimates.map((item) => item.amount)
      );
      const costs = this.pickCosts(target);
      const totalCost = COST_FIELDS.reduce((sum, field) => sum + costs[field], 0);
      const targetRevenue = this.toNumber(target?.targetRevenue);
      const netFeeTarget = this.toNumber(target?.netFeeTarget);
      const productTarget = this.toNumber(target?.productTarget);
      const monthlyCompletionRate = this.percent(actualRevenue, estimatedRevenue);
      const currentProgress = this.percent(actualRevenue, targetRevenue);
      const costRatio = this.percent(totalCost, targetRevenue);
      const grossProfit = targetRevenue - totalCost;

      return {
        store: {
          id: store.id,
          name: store.name,
          code: store.code
        },
        month: this.formatMonth(month),
        targetId: target?.id ?? null,
        targetRevenue,
        netFeeTarget,
        productTarget,
        splitStatus: target?.splitStatus ?? 'PENDING',
        actualRevenue,
        estimatedRevenue,
        monthlyCompletionRate,
        currentProgress,
        rank: 0,
        costs,
        totalCost,
        costRatio,
        grossProfit,
        editable: user.permissions.includes('performance:update') || this.isSuperAdmin(user)
      };
    });

    const rankedRows = [...rows].sort(
      (left, right) => right.monthlyCompletionRate - left.monthlyCompletionRate
    );
    rankedRows.forEach((row, index) => {
      row.rank = index + 1;
    });

    const rankByStoreId = new Map(
      rankedRows.map((row) => [row.store.id, row.rank] as const)
    );

    return {
      month: this.formatMonth(month),
      dataDeadline: this.formatDate(new Date()),
      rows: rows.map((row) => ({
        ...row,
        rank: rankByStoreId.get(row.store.id) ?? 0
      })),
      summary: this.summary(rows)
    };
  }

  async updateTarget(
    storeId: string,
    monthValue: string | undefined,
    dto: UpdatePerformanceTargetDto,
    user: CurrentUser
  ) {
    this.ensureEditable(user);
    await this.ensureStoreAccess(storeId, user);
    const month = this.parseMonth(monthValue);
    const target = this.normalizeTargetDto(dto);

    return this.prisma.storePerformanceTarget.upsert({
      where: {
        storeId_month: {
          storeId,
          month
        }
      },
      update: {
        ...target,
        updatedBy: user.id,
        deletedAt: null
      },
      create: {
        storeId,
        month,
        ...target,
        createdBy: user.id,
        updatedBy: user.id
      }
    });
  }

  async createTarget(dto: CreatePerformanceTargetDto, user: CurrentUser) {
    this.ensureEditable(user);
    await this.ensureStoreAccess(dto.storeId, user);
    const month = this.parseMonth(dto.month);
    const existed = await this.prisma.storePerformanceTarget.findUnique({
      where: {
        storeId_month: {
          storeId: dto.storeId,
          month
        }
      },
      select: {
        id: true,
        deletedAt: true
      }
    });

    if (existed && !existed.deletedAt) {
      throw new BadRequestException('该门店当前月份已存在业绩指标数据');
    }

    const { storeId, month: targetMonth, ...target } = dto;
    void targetMonth;
    const normalizedTarget = this.normalizeTargetDto(target);
    if (existed?.deletedAt) {
      return this.prisma.storePerformanceTarget.update({
        where: { id: existed.id },
        data: {
          ...normalizedTarget,
          deletedAt: null,
          updatedBy: user.id
        }
      });
    }

    return this.prisma.storePerformanceTarget.create({
      data: {
        storeId,
        month,
        ...normalizedTarget,
        createdBy: user.id,
        updatedBy: user.id
      }
    });
  }

  async getSplitPlan(
    storeId: string,
    monthValue: string | undefined,
    user: CurrentUser
  ) {
    await this.ensureStoreAccess(storeId, user);
    const month = this.parseMonth(monthValue);
    const plan = await this.prisma.storePerformanceSplitPlan.findFirst({
      where: { storeId, month, deletedAt: null },
      include: {
        store: { select: { id: true, name: true, code: true } },
        target: true,
        items: {
          where: { deletedAt: null },
          include: {
            shift: true,
            actuals: { where: { deletedAt: null } }
          },
          orderBy: [{ workDate: 'asc' }, { shift: { sort: 'asc' } }]
        }
      }
    });

    if (!plan) {
      throw new NotFoundException('业绩拆分计划不存在');
    }
    const schedules = await this.prisma.employeeSchedule.findMany({
      where: {
        storeId,
        workDate: {
          gte: this.parseMonth(this.formatMonth(plan.month)),
          lt: this.nextMonthDate(plan.month)
        },
        deletedAt: null
      },
      include: {
        employee: { select: { id: true, name: true, employeeNo: true } }
      }
    });
    const scheduleMap = new Map(
      schedules.map((schedule) => [
        `${this.formatDate(schedule.workDate)}:${schedule.shiftId}:${schedule.role}`,
        schedule.employee
      ])
    );

    const rows = plan.items.map((item) => {
      const netFeeActual = this.sumDecimals(
        item.actuals.map((actual) => actual.netFeeActual)
      );
      const productActual = this.sumDecimals(
        item.actuals.map((actual) => actual.productActual)
      );
      const netFeeTarget = this.toNumber(item.netFeeTarget);
      const productTarget = this.toNumber(item.productTarget);
      const targetTotal = netFeeTarget + productTarget;
      const actualTotal = netFeeActual + productActual;
      return {
        id: item.id,
        date: this.formatDate(item.workDate),
        weekday: this.weekdayLabel(item.workDate),
        shift: {
          id: item.shift.id,
          name: item.shift.name,
          code: item.shift.code
        },
        staff: {
          cashier:
            scheduleMap.get(
              `${this.formatDate(item.workDate)}:${item.shiftId}:${ScheduleRole.CASHIER}`
            ) ?? null,
          floor:
            scheduleMap.get(
              `${this.formatDate(item.workDate)}:${item.shiftId}:${ScheduleRole.FLOOR}`
            ) ?? null,
          flex:
            scheduleMap.get(
              `${this.formatDate(item.workDate)}:${item.shiftId}:${ScheduleRole.FLEX}`
            ) ?? null
        },
        netFeeTarget,
        productTarget,
        netFeeActual,
        productActual,
        netFeeCompletionRate: this.percent(netFeeActual, netFeeTarget),
        productCompletionRate: this.percent(productActual, productTarget),
        totalTarget: targetTotal,
        totalActual: actualTotal,
        totalCompletionRate: this.percent(actualTotal, targetTotal)
      };
    });

    return {
      id: plan.id,
      store: plan.store,
      month: this.formatMonth(plan.month),
      status: plan.status,
      netFeeTarget: this.toNumber(plan.netFeeTarget),
      productTarget: this.toNumber(plan.productTarget),
      weekendIncreaseRate: this.toNumber(plan.weekendIncreaseRate),
      rows,
      summary: {
        netFeeTarget: rows.reduce((sum, row) => sum + row.netFeeTarget, 0),
        productTarget: rows.reduce((sum, row) => sum + row.productTarget, 0),
        netFeeActual: rows.reduce((sum, row) => sum + row.netFeeActual, 0),
        productActual: rows.reduce((sum, row) => sum + row.productActual, 0)
      }
    };
  }

  async listSchedules(
    storeId: string,
    monthValue: string | undefined,
    user: CurrentUser
  ) {
    await this.ensureStoreAccess(storeId, user);
    const month = this.parseMonth(monthValue);
    await this.ensureDefaultSchedules(storeId, month);
    const [shifts, employees, schedules] = await Promise.all([
      this.prisma.workShift.findMany({
        where: { deletedAt: null },
        orderBy: { sort: 'asc' }
      }),
      this.prisma.employee.findMany({
        where: { storeId, enabled: true, deletedAt: null },
        select: { id: true, name: true, employeeNo: true, position: true },
        orderBy: { employeeNo: 'asc' }
      }),
      this.prisma.employeeSchedule.findMany({
        where: {
          storeId,
          workDate: { gte: month, lt: this.nextMonthDate(month) },
          deletedAt: null
        },
        include: {
          employee: { select: { id: true, name: true, employeeNo: true } },
          shift: true
        },
        orderBy: [{ workDate: 'asc' }, { shift: { sort: 'asc' } }]
      })
    ]);

    return {
      month: this.formatMonth(month),
      roles: [
        { label: '收银', value: ScheduleRole.CASHIER },
        { label: '外场', value: ScheduleRole.FLOOR },
        { label: '机动岗', value: ScheduleRole.FLEX }
      ],
      shifts,
      employees,
      rows: schedules.map((schedule) => ({
        id: schedule.id,
        date: this.formatDate(schedule.workDate),
        weekday: this.weekdayLabel(schedule.workDate),
        shift: schedule.shift,
        role: schedule.role,
        employee: schedule.employee
      }))
    };
  }

  async upsertSchedule(dto: UpsertEmployeeScheduleDto, user: CurrentUser) {
    this.ensureScheduleEditable(user);
    await this.ensureStoreAccess(dto.storeId, user);
    const workDate = this.parseDate(dto.workDate);

    if (!dto.employeeId) {
      return this.prisma.employeeSchedule.updateMany({
        where: {
          storeId: dto.storeId,
          shiftId: dto.shiftId,
          workDate,
          role: dto.role,
          deletedAt: null
        },
        data: { deletedAt: new Date() }
      });
    }

    await this.ensureEmployeeInStore(dto.employeeId, dto.storeId);
    await this.ensureShiftExists(dto.shiftId);
    return this.prisma.employeeSchedule.upsert({
      where: {
        storeId_shiftId_workDate_role: {
          storeId: dto.storeId,
          shiftId: dto.shiftId,
          workDate,
          role: dto.role
        }
      },
      update: {
        employeeId: dto.employeeId,
        deletedAt: null
      },
      create: {
        storeId: dto.storeId,
        shiftId: dto.shiftId,
        workDate,
        role: dto.role,
        employeeId: dto.employeeId
      }
    });
  }

  async generateSplitPlan(
    targetId: string,
    dto: GeneratePerformanceSplitDto,
    user: CurrentUser
  ) {
    this.ensureSplitEditable(user);
    const target = await this.prisma.storePerformanceTarget.findFirst({
      where: { id: targetId, deletedAt: null }
    });
    if (!target) {
      throw new NotFoundException('业绩指标不存在');
    }
    await this.ensureStoreAccess(target.storeId, user);

    const shifts = await this.prisma.workShift.findMany({
      where: { deletedAt: null },
      orderBy: { sort: 'asc' }
    });
    if (!shifts.length) {
      throw new BadRequestException('请先配置班次');
    }

    const netFeeTarget =
      dto.netFeeTarget ??
      (this.toNumber(target.netFeeTarget) ||
        this.toNumber(target.targetRevenue) * 0.8);
    const productTarget =
      dto.productTarget ??
      (this.toNumber(target.productTarget) ||
        this.toNumber(target.targetRevenue) * 0.2);
    const weekendIncreaseRate = dto.weekendIncreaseRate ?? 0.15;
    const items = this.buildSplitItems(
      target.month,
      shifts,
      netFeeTarget,
      productTarget,
      weekendIncreaseRate
    );

    return this.prisma.$transaction(async (tx) => {
      const existedPlan = await tx.storePerformanceSplitPlan.findFirst({
        where: { targetId: target.id }
      });

      const plan = existedPlan
        ? await tx.storePerformanceSplitPlan.update({
            where: { id: existedPlan.id },
            data: {
              netFeeTarget,
              productTarget,
              weekendIncreaseRate,
              status: 'ACTIVE',
              deletedAt: null,
              updatedBy: user.id,
              items: {
                deleteMany: {},
                create: items
              }
            },
            include: {
              items: true
            }
          })
        : await tx.storePerformanceSplitPlan.create({
            data: {
              storeId: target.storeId,
              targetId: target.id,
              month: target.month,
              netFeeTarget,
              productTarget,
              weekendIncreaseRate,
              createdBy: user.id,
              updatedBy: user.id,
              items: {
                create: items
              }
            },
            include: {
              items: true
            }
          });

      if (existedPlan) {
        await tx.storePerformanceShiftActualSnapshot.updateMany({
          where: {
            storeId: target.storeId,
            workDate: {
              gte: target.month,
              lt: this.nextMonthDate(target.month)
            }
          },
          data: {
            splitItemId: null
          }
        });
      }

      await tx.storePerformanceTarget.update({
        where: { id: target.id },
        data: {
          netFeeTarget,
          productTarget,
          splitStatus: 'ACTIVE',
          updatedBy: user.id
        }
      });

      return plan;
    });
  }

  async updateSplitItem(
    id: string,
    dto: UpdatePerformanceSplitItemDto,
    user: CurrentUser
  ) {
    this.ensureSplitEditable(user);
    const item = await this.prisma.storePerformanceSplitItem.findFirst({
      where: { id, deletedAt: null },
      include: {
        plan: true
      }
    });
    if (!item) {
      throw new NotFoundException('拆分明细不存在');
    }
    await this.ensureStoreAccess(item.plan.storeId, user);
    return this.prisma.storePerformanceSplitItem.update({
      where: { id },
      data: dto
    });
  }

  async getShiftDashboard(
    user: CurrentUser,
    storeIdValue?: string,
    dateValue?: string
  ) {
    const storeId = storeIdValue ?? user.accessibleStoreIds[0];
    if (!storeId) {
      throw new ForbiddenException('当前账号未关联门店');
    }
    await this.ensureStoreAccess(storeId, user);
    const workDate = this.parseDate(dateValue);
    const month = this.parseMonth(this.formatMonth(workDate));
    const plan = await this.prisma.storePerformanceSplitPlan.findFirst({
      where: { storeId, month, deletedAt: null },
      include: {
        store: { select: { id: true, name: true, code: true } },
        target: true,
        items: {
          where: { workDate, deletedAt: null },
          include: {
            shift: true,
            actuals: { where: { deletedAt: null } }
          },
          orderBy: { shift: { sort: 'asc' } }
        }
      }
    });
    if (!plan) {
      return {
        storeId,
        date: this.formatDate(workDate),
        active: false,
        message: '当前月份业绩指标未拆分，暂未生效'
      };
    }

    const todayRows = plan.items.map((item) => {
      const netFeeActual = this.sumDecimals(
        item.actuals.map((actual) => actual.netFeeActual)
      );
      const productActual = this.sumDecimals(
        item.actuals.map((actual) => actual.productActual)
      );
      const netFeeTarget = this.toNumber(item.netFeeTarget);
      const productTarget = this.toNumber(item.productTarget);
      const totalTarget = netFeeTarget + productTarget;
      const totalActual = netFeeActual + productActual;
      return {
        shift: item.shift,
        netFeeTarget,
        productTarget,
        netFeeActual,
        productActual,
        totalCompletionRate: this.percent(totalActual, totalTarget)
      };
    });
    const monthActual = await this.prisma.storePerformanceShiftActualSnapshot.findMany({
      where: { storeId, workDate: { gte: month }, deletedAt: null }
    });
    const currentPerformance = this.sumDecimals([
      ...monthActual.map((item) => item.netFeeActual),
      ...monthActual.map((item) => item.productActual)
    ]);
    const totalTarget = this.toNumber(plan.target.targetRevenue);

    return {
      active: true,
      store: plan.store,
      date: this.formatDate(workDate),
      todayRows,
      performanceScore: this.estimatePerformanceScore(todayRows),
      monthSummary: {
        totalTarget,
        currentPerformance,
        remainingPerformance: Math.max(totalTarget - currentPerformance, 0)
      },
      scoreRule: '绩效分按当日各班次总达成率估算；后续可按门店正式绩效规则替换。'
    };
  }

  async listExistingMonths(storeId: string, user: CurrentUser) {
    await this.ensureStoreAccess(storeId, user);
    const rows = await this.prisma.storePerformanceTarget.findMany({
      where: {
        storeId,
        deletedAt: null
      },
      select: {
        month: true
      },
      orderBy: {
        month: 'asc'
      }
    });

    return rows.map((row) => this.formatMonth(row.month));
  }

  async copyPreviousMonthCosts(
    storeId: string,
    monthValue: string | undefined,
    user: CurrentUser
  ) {
    this.ensureEditable(user);
    await this.ensureStoreAccess(storeId, user);
    const month = this.parseMonth(monthValue);
    const previousMonth = new Date(month);
    previousMonth.setMonth(previousMonth.getMonth() - 1);

    const previousTarget = await this.prisma.storePerformanceTarget.findUnique({
      where: {
        storeId_month: {
          storeId,
          month: previousMonth
        }
      }
    });

    if (!previousTarget || previousTarget.deletedAt) {
      throw new NotFoundException('上一月成本数据不存在');
    }

    return this.pickCosts(previousTarget);
  }

  private summary(rows: Array<{ targetRevenue: number; actualRevenue: number; estimatedRevenue: number; totalCost: number; grossProfit: number }>) {
    const targetRevenue = rows.reduce((sum, row) => sum + row.targetRevenue, 0);
    const actualRevenue = rows.reduce((sum, row) => sum + row.actualRevenue, 0);
    const estimatedRevenue = rows.reduce((sum, row) => sum + row.estimatedRevenue, 0);
    const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0);
    const grossProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);

    return {
      targetRevenue,
      actualRevenue,
      estimatedRevenue,
      monthlyCompletionRate: this.percent(actualRevenue, estimatedRevenue),
      currentProgress: this.percent(actualRevenue, targetRevenue),
      totalCost,
      costRatio: this.percent(totalCost, targetRevenue),
      grossProfit
    };
  }

  private pickCosts(target?: Partial<Record<CostField, Prisma.Decimal>> | null) {
    return COST_FIELDS.reduce(
      (result, field) => ({
        ...result,
        [field]: this.toNumber(target?.[field])
      }),
      {} as Record<CostField, number>
    );
  }

  private normalizeTargetDto<T extends UpdatePerformanceTargetDto>(dto: T) {
    const targetRevenue = dto.targetRevenue ?? 0;
    const netFeeTarget = dto.netFeeTarget ?? (targetRevenue ? targetRevenue * 0.8 : undefined);
    const productTarget =
      dto.productTarget ?? (targetRevenue ? targetRevenue - (netFeeTarget ?? 0) : undefined);
    return {
      ...dto,
      ...(netFeeTarget !== undefined ? { netFeeTarget } : {}),
      ...(productTarget !== undefined ? { productTarget } : {})
    };
  }

  private async ensureStoreAccess(storeId: string, user: CurrentUser) {
    this.ensureStoreIdInUserScope(storeId, user);
    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!store) {
      throw new NotFoundException('门店不存在');
    }
  }

  private ensureStoreIdInUserScope(storeId: string, user: CurrentUser) {
    if (this.isSuperAdmin(user)) {
      return;
    }

    if (!user.accessibleStoreIds.includes(storeId)) {
      throw new ForbiddenException('无权访问该门店数据');
    }
  }

  private ensureEditable(user: CurrentUser) {
    if (!this.isSuperAdmin(user) && !user.permissions.includes('performance:update')) {
      throw new ForbiddenException('当前账号仅可查看门店业绩指标');
    }
  }

  private ensureSplitEditable(user: CurrentUser) {
    if (
      !this.isSuperAdmin(user) &&
      !user.permissions.includes('performance-split:update')
    ) {
      throw new ForbiddenException('仅运营或管理员可修改业绩拆分');
    }
  }

  private ensureScheduleEditable(user: CurrentUser) {
    if (!this.isSuperAdmin(user) && !user.permissions.includes('schedule:update')) {
      throw new ForbiddenException('无权修改排班');
    }
  }

  private async ensureEmployeeInStore(employeeId: string, storeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, storeId, deletedAt: null },
      select: { id: true }
    });
    if (!employee) {
      throw new NotFoundException('员工不存在或不属于该门店');
    }
  }

  private async ensureShiftExists(shiftId: string) {
    const shift = await this.prisma.workShift.findFirst({
      where: { id: shiftId, deletedAt: null },
      select: { id: true }
    });
    if (!shift) {
      throw new NotFoundException('班次不存在');
    }
  }

  private storeScope(user: CurrentUser): Prisma.StoreWhereInput {
    if (this.isSuperAdmin(user)) {
      return { deletedAt: null };
    }

    return {
      deletedAt: null,
      id: {
        in: user.accessibleStoreIds
      }
    };
  }

  private isSuperAdmin(user: CurrentUser) {
    return user.roles.includes('super_admin');
  }

  private parseMonth(value?: string) {
    const monthValue = value || this.formatMonth(new Date());
    if (!/^\d{4}-\d{2}$/.test(monthValue)) {
      throw new BadRequestException('月份格式应为 YYYY-MM');
    }
    return new Date(`${monthValue}-01T00:00:00.000Z`);
  }

  private parseDate(value?: string) {
    const dateValue = value || this.formatDate(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      throw new BadRequestException('日期格式应为 YYYY-MM-DD');
    }
    return new Date(`${dateValue}T00:00:00.000Z`);
  }

  private buildSplitItems(
    month: Date,
    shifts: Array<{ id: string }>,
    netFeeTarget: number,
    productTarget: number,
    weekendIncreaseRate: number
  ) {
    const days = this.monthDays(month);
    const weightedSlots = days.flatMap((day) =>
      shifts.map((shift) => ({
        workDate: day,
        shiftId: shift.id,
        weight: this.isWeekend(day) ? 1 + weekendIncreaseRate : 1
      }))
    );
    const totalWeight = weightedSlots.reduce((sum, slot) => sum + slot.weight, 0);
    let netAllocated = 0;
    let productAllocated = 0;

    return weightedSlots.map((slot, index) => {
      const isLast = index === weightedSlots.length - 1;
      const netFeeValue = isLast
        ? netFeeTarget - netAllocated
        : this.roundMoney((netFeeTarget * slot.weight) / totalWeight);
      const productValue = isLast
        ? productTarget - productAllocated
        : this.roundMoney((productTarget * slot.weight) / totalWeight);
      netAllocated += netFeeValue;
      productAllocated += productValue;
      return {
        workDate: slot.workDate,
        shiftId: slot.shiftId,
        netFeeTarget: netFeeValue,
        productTarget: productValue
      };
    });
  }

  private async ensureDefaultSchedules(storeId: string, month: Date) {
    const existed = await this.prisma.employeeSchedule.count({
      where: {
        storeId,
        workDate: { gte: month, lt: this.nextMonthDate(month) },
        deletedAt: null
      }
    });
    if (existed > 0) {
      return;
    }

    const [employees, shifts] = await Promise.all([
      this.prisma.employee.findMany({
        where: { storeId, enabled: true, deletedAt: null },
        orderBy: { employeeNo: 'asc' }
      }),
      this.prisma.workShift.findMany({
        where: { deletedAt: null },
        orderBy: { sort: 'asc' }
      })
    ]);
    if (!employees.length || !shifts.length) {
      return;
    }

    const roles = [ScheduleRole.CASHIER, ScheduleRole.FLOOR, ScheduleRole.FLEX];
    const data = this.monthDays(month).flatMap((workDate, dayIndex) =>
      shifts.flatMap((shift, shiftIndex) =>
        roles.map((role, roleIndex) => ({
          storeId,
          workDate,
          shiftId: shift.id,
          role,
          employeeId:
            employees[(dayIndex + shiftIndex + roleIndex) % employees.length].id
        }))
      )
    );

    await this.prisma.employeeSchedule.createMany({
      data,
      skipDuplicates: true
    });
  }

  private nextMonthDate(month: Date) {
    return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  }

  private monthDays(month: Date) {
    const result: Date[] = [];
    const cursor = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    while (cursor.getUTCMonth() === month.getUTCMonth()) {
      result.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
  }

  private isWeekend(value: Date) {
    const day = value.getUTCDay();
    return day === 0 || day === 6;
  }

  private weekdayLabel(value: Date) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
      value.getUTCDay()
    ];
  }

  private estimatePerformanceScore(
    rows: Array<{ totalCompletionRate: number }>
  ) {
    if (!rows.length) {
      return 0;
    }
    const averageRate =
      rows.reduce((sum, row) => sum + row.totalCompletionRate, 0) / rows.length;
    if (averageRate < 50) return -3;
    if (averageRate < 80) return -1;
    if (averageRate < 120) return 3;
    if (averageRate < 150) return 5;
    if (averageRate < 180) return 10;
    return 12;
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }

  private formatMonth(value: Date) {
    return value.toISOString().slice(0, 7);
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private sumDecimals(values: Prisma.Decimal[]) {
    return values.reduce((sum, value) => sum + this.toNumber(value), 0);
  }

  private toNumber(value?: Prisma.Decimal | number | null) {
    if (value === undefined || value === null) {
      return 0;
    }
    return Number(value);
  }

  private percent(numerator: number, denominator: number) {
    if (!denominator) {
      return 0;
    }
    return Number(((numerator / denominator) * 100).toFixed(2));
  }
}
