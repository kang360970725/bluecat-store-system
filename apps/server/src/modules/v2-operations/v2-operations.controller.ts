import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CurrentUser } from '@bluecat/shared';
import { CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  CreateV2OperatingTargetDto,
  CreateV2ScheduleAssignmentDto,
  CreateV2SchedulePeriodDto,
  CreateV2ScorePlanDto,
  CreateV2ShiftTemplateDto,
  GenerateV2TargetAllocationsDto,
  MatchV2ExternalStoreCandidateDto,
  SaveV2WecomWebhookDto,
  UpsertV2DataSourceDto
} from './dto';
import { V2OperationsService } from './v2-operations.service';
import { V2OperationsDashboardService } from './v2-operations-dashboard.service';
import { V2OperationsReportService } from './v2-operations-report.service';
import { V2UsageAnalyticsService } from './v2-usage-analytics.service';

@ApiTags('v2-operations')
@ApiBearerAuth()
@Controller('v2/operations')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class V2OperationsController {
  constructor(
    private readonly service: V2OperationsService,
    private readonly dashboardService: V2OperationsDashboardService,
    private readonly reportService: V2OperationsReportService,
    private readonly usageAnalyticsService: V2UsageAnalyticsService
  ) {}
  private requireSuperAdmin(user: CurrentUser) {
    if (!user.roles.includes('super_admin'))
      throw new ForbiddenException('仅超级管理员可以执行此操作');
  }
  @Get('overview') @RequirePermissions('store:view') overview() {
    return this.service.overview();
  }
  @Post('shift-templates') @RequirePermissions('schedule:update') createShift(
    @Body() dto: CreateV2ShiftTemplateDto
  ) {
    return this.service.createShiftTemplate(dto);
  }
  @Post('stores/:storeId/shifts/inherit')
  @RequirePermissions('schedule:update')
  inheritShifts(@Param('storeId') storeId: string) {
    return this.service.inheritShifts(storeId);
  }
  @Post('schedules') @RequirePermissions('schedule:update') createSchedule(
    @Body() dto: CreateV2SchedulePeriodDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createSchedulePeriod(dto, user);
  }
  @Get('schedules/:id') @RequirePermissions('employee:view') schedule(
    @Param('id') id: string
  ) {
    return this.service.scheduleDetail(id);
  }
  @Get('stores/:storeId/schedule-options')
  @RequirePermissions('employee:view')
  scheduleOptions(@Param('storeId') storeId: string) {
    return this.service.storeScheduleOptions(storeId);
  }
  @Post('schedule-assignments')
  @RequirePermissions('schedule:update')
  createAssignment(
    @Body() dto: CreateV2ScheduleAssignmentDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createAssignment(dto, user);
  }
  @Delete('schedule-assignments/:id')
  @RequirePermissions('schedule:update')
  deleteAssignment(@Param('id') id: string) {
    return this.service.deleteAssignment(id);
  }
  @Post('schedules/:id/publish') @RequirePermissions('schedule:update') publish(
    @Param('id') id: string
  ) {
    return this.service.publishSchedule(id);
  }
  @Post('schedules/:id/lock') @RequirePermissions('schedule:update') lock(
    @Param('id') id: string
  ) {
    return this.service.lockSchedule(id);
  }
  @Post('targets') @RequirePermissions('performance:update') createTarget(
    @Body() dto: CreateV2OperatingTargetDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createTarget(dto, user);
  }
  @Post('score-plans') @RequirePermissions('scoring:update') createScorePlan(
    @Body() dto: CreateV2ScorePlanDto
  ) {
    return this.service.createScorePlan(dto);
  }
  @Post('data-sources')
  @RequirePermissions('performance:update')
  saveDataSource(
    @Body() dto: UpsertV2DataSourceDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.upsertDataSource(dto, user);
  }
  @Post('data-sources/discover')
  @RequirePermissions('performance:update')
  discoverDataSources(@CurrentUserInfo() user: CurrentUser) {
    return this.service.discoverStores(user);
  }
  @Post('data-sources/login/qr')
  @RequirePermissions('performance:update')
  createDataSourceLoginQr(@CurrentUserInfo() user: CurrentUser) {
    return this.service.createCollectorLoginQr(user);
  }
  @Get('data-sources/login/qr/:xmId')
  @RequirePermissions('performance:update')
  checkDataSourceLoginQr(
    @Param('xmId') xmId: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.checkCollectorLoginQr(xmId, user);
  }
  @Post('data-sources/sync-machine-counts')
  @RequirePermissions('performance:update')
  syncMachineCounts(@CurrentUserInfo() user: CurrentUser) {
    this.requireSuperAdmin(user);
    return this.service.syncAllStoreMachineCounts(user);
  }
  @Post('external-store-candidates/:id/match')
  @RequirePermissions('performance:update')
  matchExternalStoreCandidate(
    @Param('id') id: string,
    @Body() dto: MatchV2ExternalStoreCandidateDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.matchExternalStoreCandidate(id, dto, user);
  }
  @Post('data-sources/:id/check-session')
  @RequirePermissions('performance:update')
  checkDataSource(@Param('id') id: string) {
    return this.service.checkSession(id);
  }
  @Get('wecom-webhooks') @RequirePermissions('permission:view') wecomWebhooks(
    @CurrentUserInfo() user: CurrentUser
  ) {
    this.requireSuperAdmin(user);
    return this.service.listWecomWebhooks();
  }
  @Post('wecom-webhooks')
  @RequirePermissions('permission:update')
  createWecomWebhook(
    @Body() dto: SaveV2WecomWebhookDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    this.requireSuperAdmin(user);
    return this.service.saveWecomWebhook(dto, user);
  }
  @Patch('wecom-webhooks/:id')
  @RequirePermissions('permission:update')
  updateWecomWebhook(
    @Param('id') id: string,
    @Body() dto: SaveV2WecomWebhookDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    this.requireSuperAdmin(user);
    return this.service.saveWecomWebhook(dto, user, id);
  }
  @Post('wecom-webhooks/:id/test')
  @RequirePermissions('permission:update')
  testWecomWebhook(
    @Param('id') id: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    this.requireSuperAdmin(user);
    return this.service.testWecomWebhook(id);
  }
  @Post('wecom-webhooks/:id/push')
  @RequirePermissions('permission:update')
  pushWecomReport(
    @Param('id') id: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    this.requireSuperAdmin(user);
    return this.service.pushWecomReport(id);
  }
  @Delete('wecom-webhooks/:id')
  @RequirePermissions('permission:update')
  deleteWecomWebhook(
    @Param('id') id: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    this.requireSuperAdmin(user);
    return this.service.deleteWecomWebhook(id, user);
  }
  @Get('stores/:storeId/performance')
  @RequirePermissions('performance:view')
  performance(
    @Param('storeId') storeId: string,
    @Query('month') month?: string
  ) {
    return this.service.storePerformance(storeId, month);
  }
  @Get('store-performance-ranking')
  @RequirePermissions('performance:view')
  storePerformanceRanking(
    @CurrentUserInfo() user: CurrentUser,
    @Query('month') month?: string
  ) {
    return this.service.storePerformanceRanking(user, month);
  }
  @Get('stores/:storeId/operating-dashboard')
  @RequirePermissions('performance:view')
  operatingDashboard(
    @Param('storeId') storeId: string,
    @Query('month') month?: string
  ) {
    return this.service.operatingDashboard(storeId, month);
  }
  @Get('stores/:storeId/usage-analytics')
  @RequirePermissions('performance:view')
  usageAnalytics(
    @Param('storeId') storeId: string,
    @Query('start') start: string | undefined,
    @Query('end') end: string | undefined,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.usageAnalyticsService.read(storeId, start, end, user);
  }
  @Get('usage-analytics-ranking')
  @RequirePermissions('performance:view')
  usageAnalyticsRanking(
    @Query('start') start: string | undefined,
    @Query('end') end: string | undefined,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.usageAnalyticsService.ranking(start, end, user);
  }
  @Get('stores/:storeId/monthly-report')
  @RequirePermissions('performance:view')
  monthlyReport(
    @Param('storeId') storeId: string,
    @Query('month') month: string | undefined,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.reportService.monthly(storeId, month, user);
  }
  @Get('stores/:storeId/weekly-report')
  @RequirePermissions('performance:view')
  weeklyReport(
    @Param('storeId') storeId: string,
    @Query('start') start: string | undefined,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.reportService.weekly(storeId, start, user);
  }
  @Post('stores/:storeId/reports/generate')
  @RequirePermissions('performance:update')
  generateReport(
    @Param('storeId') storeId: string,
    @Body() body: { periodType?: string; period?: string; resync?: boolean },
    @CurrentUserInfo() user: CurrentUser
  ) {
    this.requireSuperAdmin(user);
    return this.reportService.generate(
      storeId,
      body.periodType ?? 'MONTH',
      body.period,
      body.resync === true,
      user
    );
  }
  @Get('report-comparison')
  @RequirePermissions('performance:view')
  reportComparison(
    @CurrentUserInfo() user: CurrentUser,
    @Query('periodType') periodType?: string,
    @Query('period') period?: string
  ) {
    return this.dashboardService.comparison(user, periodType, period);
  }
  @Get('stores/:storeId/performance-split')
  @RequirePermissions('performance:view')
  performanceSplit(
    @Param('storeId') storeId: string,
    @Query('month') month?: string,
    @Query('date') date?: string
  ) {
    return this.service.performanceSplit(storeId, month, date);
  }
  @Get('stores/:storeId/ota-center')
  @RequirePermissions('performance:view')
  otaCenter(
    @Param('storeId') storeId: string,
    @Query('month') month?: string,
    @Query('productPage') productPage?: string,
    @Query('productPageSize') productPageSize?: string,
    @Query('redemptionPage') redemptionPage?: string,
    @Query('redemptionPageSize') redemptionPageSize?: string,
    @Query('redemptionStatus') redemptionStatus?: string,
    @Query('redemptionKeyword') redemptionKeyword?: string,
    @Query('productStatus') productStatus?: string
  ) {
    return this.service.otaCenter(
      storeId,
      month,
      Number(productPage),
      Number(productPageSize),
      Number(redemptionPage),
      Number(redemptionPageSize),
      redemptionStatus,
      redemptionKeyword,
      productStatus
    );
  }
  @Post('stores/:storeId/ota-products/sync')
  @RequirePermissions('performance:update')
  syncOtaProducts(@Param('storeId') storeId: string) {
    return this.service.syncStoreOtaProducts(storeId);
  }
  @Get('stores/:storeId/product-exclusions')
  @RequirePermissions('performance:view')
  productExclusions(
    @Param('storeId') storeId: string,
    @Query('month') month?: string
  ) {
    return this.service.productExclusionCenter(storeId, month);
  }
  @Post('stores/:storeId/product-categories/sync')
  @RequirePermissions('performance:update')
  syncProductCategories(
    @Param('storeId') storeId: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.syncStoreProductCategories(storeId, user);
  }
  @Patch('product-categories/:id/excluded')
  @RequirePermissions('performance:update')
  updateProductCategory(
    @Param('id') id: string,
    @Body() body: { excluded?: boolean; month?: string },
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.updateProductCategoryExclusion(
      id,
      body.excluded === true,
      body.month,
      user
    );
  }
  @Post('stores/:storeId/product-categories/exclusions')
  @RequirePermissions('performance:update')
  updateProductCategories(
    @Param('storeId') storeId: string,
    @Body() body: { excludedIds?: string[]; month?: string },
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.updateProductCategoryExclusions(
      storeId,
      body.excludedIds ?? [],
      body.month,
      user
    );
  }
  @Post('stores/:storeId/product-exclusions/sync')
  @RequirePermissions('performance:update')
  syncProductExclusions(
    @Param('storeId') storeId: string,
    @Body() body: { month?: string }
  ) {
    return this.service.syncStoreProductExclusionMonth(storeId, body.month);
  }
  @Patch('ota-products/:id/brush')
  @RequirePermissions('performance:update')
  updateOtaProductBrush(
    @Param('id') id: string,
    @Body() body: { isBrush?: boolean }
  ) {
    return this.service.updateOtaProductBrush(id, body.isBrush === true);
  }
  @Patch('ota-products/:id/settlement')
  @RequirePermissions('performance:update')
  updateOtaProductSettlement(
    @Param('id') id: string,
    @Body() body: { settlementRate?: number; feeRate?: number }
  ) {
    return this.service.updateOtaProductSettlement(
      id,
      body.settlementRate,
      body.feeRate
    );
  }
  @Post('ota-redemptions/:id/brush-product')
  @RequirePermissions('performance:update')
  markRedemptionProductBrush(@Param('id') id: string) {
    return this.service.markRedemptionProductBrush(id);
  }
  @Post('stores/:storeId/performance-split/generate')
  @RequirePermissions('performance:update')
  generatePerformanceSplit(
    @Param('storeId') storeId: string,
    @Body() dto: GenerateV2TargetAllocationsDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.generatePerformanceSplit(storeId, dto, user);
  }
}
