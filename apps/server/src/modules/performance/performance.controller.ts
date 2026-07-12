import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { CurrentUser } from '@bluecat/shared';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  CreatePerformanceTargetDto,
  GeneratePerformanceSplitDto,
  UpdatePerformanceSplitItemDto,
  UpdatePerformanceTargetDto,
  UpsertEmployeeScheduleDto
} from './dto/performance.dto';
import { PerformanceService } from './performance.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller('performances')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  @Get('monthly')
  @RequirePermissions('performance:view')
  listMonthly(
    @CurrentUserInfo() user: CurrentUser,
    @Query('month') month?: string
  ) {
    return this.performanceService.listMonthly(month, user);
  }

  @Get('monthly/existing-months')
  @RequirePermissions('performance:view')
  listExistingMonths(
    @CurrentUserInfo() user: CurrentUser,
    @Query('storeId') storeId: string
  ) {
    return this.performanceService.listExistingMonths(storeId, user);
  }

  @Post('monthly')
  @RequirePermissions('performance:update')
  createTarget(
    @Body() dto: CreatePerformanceTargetDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.performanceService.createTarget(dto, user);
  }

  @Patch('monthly/:storeId')
  @RequirePermissions('performance:update')
  updateTarget(
    @Param('storeId') storeId: string,
    @Body() dto: UpdatePerformanceTargetDto,
    @CurrentUserInfo() user: CurrentUser,
    @Query('month') month?: string
  ) {
    return this.performanceService.updateTarget(storeId, month, dto, user);
  }

  @Post('monthly/:storeId/copy-costs')
  @RequirePermissions('performance:update')
  copyPreviousMonthCosts(
    @Param('storeId') storeId: string,
    @CurrentUserInfo() user: CurrentUser,
    @Query('month') month?: string
  ) {
    return this.performanceService.copyPreviousMonthCosts(storeId, month, user);
  }

  @Get('splits')
  @RequirePermissions('performance-split:view')
  getSplitPlan(
    @CurrentUserInfo() user: CurrentUser,
    @Query('storeId') storeId: string,
    @Query('month') month?: string
  ) {
    return this.performanceService.getSplitPlan(storeId, month, user);
  }

  @Post('splits/:targetId/generate')
  @RequirePermissions('performance-split:update')
  generateSplitPlan(
    @Param('targetId') targetId: string,
    @Body() dto: GeneratePerformanceSplitDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.performanceService.generateSplitPlan(targetId, dto, user);
  }

  @Patch('splits/items/:id')
  @RequirePermissions('performance-split:update')
  updateSplitItem(
    @Param('id') id: string,
    @Body() dto: UpdatePerformanceSplitItemDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.performanceService.updateSplitItem(id, dto, user);
  }

  @Get('shift-dashboard')
  @RequirePermissions('performance-split:view')
  getShiftDashboard(
    @CurrentUserInfo() user: CurrentUser,
    @Query('storeId') storeId?: string,
    @Query('date') date?: string
  ) {
    return this.performanceService.getShiftDashboard(user, storeId, date);
  }

  @Get('schedules')
  @RequirePermissions('schedule:view')
  listSchedules(
    @CurrentUserInfo() user: CurrentUser,
    @Query('storeId') storeId: string,
    @Query('month') month?: string
  ) {
    return this.performanceService.listSchedules(storeId, month, user);
  }

  @Post('schedules')
  @RequirePermissions('schedule:update')
  upsertSchedule(
    @Body() dto: UpsertEmployeeScheduleDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.performanceService.upsertSchedule(dto, user);
  }
}
