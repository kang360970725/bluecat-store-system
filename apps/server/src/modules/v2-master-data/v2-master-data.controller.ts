import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { CurrentUser } from '@bluecat/shared';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  CreateV2EmployeeDto,
  CreateV2EmployeePayrollProfileDto,
  CreateV2PayrollGradeDto,
  ChangeV2EmploymentDto,
  ChangeV2ManagerStoreDto,
  CreateV2EmployeeLeaveDto,
  CreateV2OrganizationDto,
  CreateV2PositionTemplateDto,
  CreateV2StoreAssetDto,
  CreateV2StoreAreaDto,
  CreateV2AccountDto,
  UpdateV2AccountScopeDto,
  CreateV2RoleDto,
  CreateV2StoreCostDto,
  CorrectV2StoreCostDto,
  CreateV2StoreDto,
  CreateV2StoreInvestmentDto,
  CreateV2StorePositionDto,
  ReviewV2EmployeeLeaveDto,
  TerminateV2EmployeeDto,
  UpdateV2EmployeeDto,
  UpdateV2StoreAreaDto,
  UpdateV2StoreAssetDto,
  UpdateV2StoreCostDto,
  UpdateV2StoreDto,
  UpdateV2PayrollGradeDto,
  UpdateV2PositionTemplateDto,
  UpdateV2StoreInvestmentDto,
  UpdateV2StorePositionDto,
  UpsertV2OperatingProfileDto
} from './dto';
import { V2MasterDataService } from './v2-master-data.service';

@ApiTags('v2-master-data')
@ApiBearerAuth()
@Controller('v2/master-data')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class V2MasterDataController {
  constructor(private readonly service: V2MasterDataService) {}

  @Get('overview')
  @RequirePermissions('store:view')
  overview(@CurrentUserInfo() user: CurrentUser) {
    return this.service.listOverview(user);
  }

  @Get('access-control')
  @RequirePermissions('permission:view')
  async accessControl(@CurrentUserInfo() user: CurrentUser) {
    await this.requireSuperAdmin(user);
    return this.service.listAccessControl();
  }

  @Get('login-users')
  @RequirePermissions('permission:view')
  async loginUsers(@CurrentUserInfo() user: CurrentUser) {
    await this.requireSuperAdmin(user);
    return this.service.listLoginUsers();
  }

  @Get('login-users/:accountType/:accountId/logs')
  @RequirePermissions('permission:view')
  async loginLogs(
    @Param('accountType') accountType: string,
    @Param('accountId') accountId: string,
    @CurrentUserInfo() user: CurrentUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    await this.requireSuperAdmin(user);
    return this.service.listLoginLogs(
      accountType,
      accountId,
      Number(page) || 1,
      Number(pageSize) || 20
    );
  }

  @Get('accounts/:id/effective-permissions')
  @RequirePermissions('permission:view')
  async effectivePermissions(
    @Param('id') id: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    await this.requireSuperAdmin(user);
    return this.service.previewScopedPermissions(id);
  }

  @Get('roles/:id/permission-audit')
  @RequirePermissions('permission:view')
  async rolePermissionAudit(
    @Param('id') id: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    await this.requireSuperAdmin(user);
    return this.service.rolePermissionAudit(id);
  }

  @Get('authorization-audit')
  @RequirePermissions('permission:view')
  async authorizationAudit(@CurrentUserInfo() user: CurrentUser) {
    await this.requireSuperAdmin(user);
    return this.service.authorizationAudit();
  }

  @Patch('accounts/:id/store-scope')
  @RequirePermissions('permission:update')
  async updateAccountScope(
    @Param('id') id: string,
    @Body() body: UpdateV2AccountScopeDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    await this.requireSuperAdmin(user);
    return this.service.updateAccountScope(
      id,
      body.dataScope,
      body.storeIds,
      user.id
    );
  }

  @Post('roles')
  @RequirePermissions('permission:update')
  async createRole(
    @Body() dto: CreateV2RoleDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    await this.requireSuperAdmin(user);
    return this.service.createRole(dto, user.id);
  }

  @Patch('roles/:id')
  @RequirePermissions('permission:update')
  async updateRole(
    @Param('id') id: string,
    @Body() dto: CreateV2RoleDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    await this.requireSuperAdmin(user);
    return this.service.updateRole(id, dto, user.id);
  }

  @Post('accounts')
  @RequirePermissions('permission:update')
  async createAccount(
    @Body() dto: CreateV2AccountDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    await this.requireSuperAdmin(user);
    return this.service.createAccount(dto, user);
  }

  private async requireSuperAdmin(user: CurrentUser) {
    if (
      !user.roles.includes('super_admin') ||
      !(await this.service.isLiveSuperAdmin(user.id))
    )
      throw new ForbiddenException('仅超级管理员可以管理系统账号和权限');
  }

  @Post('organizations')
  @RequirePermissions('org:create')
  createOrganization(
    @Body() dto: CreateV2OrganizationDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createOrganization(dto, user);
  }

  @Post('stores')
  @RequirePermissions('store:create')
  createStore(
    @Body() dto: CreateV2StoreDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createStore(dto, user);
  }

  @Patch('stores/:storeId')
  @RequirePermissions('store:update')
  updateStore(
    @Param('storeId') storeId: string,
    @Body() dto: UpdateV2StoreDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.updateStore(storeId, dto, user);
  }

  @Post('position-templates')
  @RequirePermissions('permission:update')
  async createPositionTemplate(
    @Body() dto: CreateV2PositionTemplateDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    if (dto.roleId !== undefined) await this.requireSuperAdmin(user);
    return this.service.createPositionTemplate(dto, user);
  }

  @Patch('position-templates/:id')
  @RequirePermissions('permission:update')
  async updatePositionTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateV2PositionTemplateDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    if (dto.roleId !== undefined) await this.requireSuperAdmin(user);
    return this.service.updatePositionTemplate(id, dto, user);
  }

  @Get('stores/:storeId/positions')
  @RequirePermissions('employee:view')
  listStorePositions(@Param('storeId') storeId: string) {
    return this.service.listStorePositions(storeId);
  }

  @Post('stores/:storeId/positions/inherit')
  @RequirePermissions('permission:update')
  inheritPositions(
    @Param('storeId') storeId: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.inheritPositionTemplates(storeId, user);
  }

  @Post('stores/:storeId/positions')
  @RequirePermissions('permission:update')
  createStorePosition(
    @Param('storeId') storeId: string,
    @Body() dto: CreateV2StorePositionDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createStorePosition(storeId, dto, user);
  }

  @Patch('positions/:id')
  @RequirePermissions('permission:update')
  updatePosition(
    @Param('id') id: string,
    @Body() dto: UpdateV2StorePositionDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.updateStorePosition(id, dto, user);
  }
  @Delete('positions/:id')
  @RequirePermissions('permission:update')
  deletePosition(
    @Param('id') id: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.deleteStorePosition(id, user);
  }

  @Get('employees')
  @RequirePermissions('employee:view')
  listEmployees(
    @CurrentUserInfo() user: CurrentUser,
    @Query('storeId') storeId?: string,
    @Query('organizationId') organizationId?: string
  ) {
    return this.service.listEmployees(storeId, organizationId, user);
  }

  @Post('employees')
  @RequirePermissions('employee:create')
  createEmployee(
    @Body() dto: CreateV2EmployeeDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createEmployee(dto, user);
  }

  @Get('employees-import/template')
  @RequirePermissions('employee:create')
  async downloadEmployeeImportTemplate(
    @CurrentUserInfo() user: CurrentUser,
    @Res() response: Response
  ) {
    const file = await this.service.buildEmployeeImportTemplate(user);
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('员工导入模板.xlsx')}`
    );
    response.send(file);
  }

  @Post('employees-import')
  @RequirePermissions('employee:create')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } })
  )
  importEmployees(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @CurrentUserInfo() user: CurrentUser
  ) {
    if (!file) throw new BadRequestException('请选择需要导入的Excel文件');
    return this.service.importEmployees(file.buffer, user);
  }

  @Post('employees/:employeeId/manager-transfer')
  @RequirePermissions('employee:update')
  changeManagerStore(
    @Param('employeeId') employeeId: string,
    @Body() dto: ChangeV2ManagerStoreDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.changeManagerStore(employeeId, dto, user);
  }

  @Patch('employees/:employeeId')
  @RequirePermissions('employee:update')
  updateEmployee(
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateV2EmployeeDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.updateEmployee(employeeId, dto, user);
  }

  @Get('employee-payroll-profiles')
  @RequirePermissions('employee.payroll:view')
  listEmployeePayrollProfiles(@Query('month') month?: string) {
    return this.service.listEmployeePayrollProfiles(month);
  }

  @Get('payroll-profile-templates')
  @RequirePermissions('employee.payroll:view')
  listPayrollProfileTemplates() {
    return this.service.listPayrollProfileTemplates();
  }

  @Get('onboarding-payroll-templates')
  @RequirePermissions('employee:create')
  listOnboardingPayrollTemplates() {
    return this.service.listPayrollProfileTemplates();
  }

  @Get('payroll-grades')
  @RequirePermissions('employee.grade:view')
  listPayrollGrades() {
    return this.service.listPayrollProfileTemplates();
  }

  @Post('payroll-profile-templates')
  @RequirePermissions('employee.grade:update')
  createPayrollGrade(
    @Body() dto: CreateV2PayrollGradeDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createPayrollGrade(dto, user);
  }

  @Patch('payroll-profile-templates/:id')
  @RequirePermissions('employee.grade:update')
  updatePayrollGrade(
    @Param('id') id: string,
    @Body() dto: UpdateV2PayrollGradeDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.updatePayrollGrade(id, dto, user);
  }

  @Post('employees/:employeeId/payroll-profiles')
  @RequirePermissions('employee.payroll:update')
  createEmployeePayrollProfile(
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateV2EmployeePayrollProfileDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createEmployeePayrollProfile(employeeId, dto, user);
  }

  @Post('employees/:employeeId/employment-change')
  @RequirePermissions('employee:update')
  changeEmployment(
    @Param('employeeId') employeeId: string,
    @Body() dto: ChangeV2EmploymentDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.changeEmployment(employeeId, dto, user);
  }

  @Post('employees/:employeeId/employments')
  @RequirePermissions('employee:update')
  addEmployment(
    @Param('employeeId') employeeId: string,
    @Body() dto: ChangeV2EmploymentDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.addEmployment(employeeId, dto, user);
  }

  @Post('employees/:employeeId/terminate')
  @RequirePermissions('employee:update')
  terminateEmployee(
    @Param('employeeId') employeeId: string,
    @Body() dto: TerminateV2EmployeeDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.terminateEmployee(employeeId, dto, user);
  }

  @Post('employees/:employeeId/reset-password')
  @RequirePermissions('employee:update')
  resetEmployeePassword(
    @Param('employeeId') employeeId: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.resetEmployeePassword(employeeId, user);
  }

  @Post('employees/:employeeId/leaves')
  @RequirePermissions('schedule:update')
  createLeave(
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateV2EmployeeLeaveDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createEmployeeLeave(employeeId, dto, user);
  }

  @Post('leaves/:id/review')
  @RequirePermissions('schedule:update')
  reviewLeave(
    @Param('id') id: string,
    @Body() dto: ReviewV2EmployeeLeaveDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.reviewEmployeeLeave(id, dto.status, user);
  }

  @Get('stores/:storeId/archive')
  @RequirePermissions('store:view')
  storeArchive(
    @Param('storeId') storeId: string,
    @Query('costMonth') costMonth?: string
  ) {
    return this.service.listStoreArchive(storeId, costMonth);
  }

  @Post('stores/:storeId/operating-profile')
  @RequirePermissions('store:update')
  upsertOperatingProfile(
    @Param('storeId') storeId: string,
    @Body() dto: UpsertV2OperatingProfileDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.upsertOperatingProfile(storeId, dto, user);
  }

  @Post('stores/:storeId/costs')
  @RequirePermissions('performance:update')
  createStoreCost(
    @Param('storeId') storeId: string,
    @Body() dto: CreateV2StoreCostDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createStoreCost(storeId, dto, user);
  }
  @Post('stores/:storeId/cost-corrections')
  @RequirePermissions('performance:update')
  correctStoreCost(
    @Param('storeId') storeId: string,
    @Body() dto: CorrectV2StoreCostDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.correctStoreCost(storeId, dto, user);
  }
  @Patch('costs/:id')
  @RequirePermissions('performance:update')
  updateCost(
    @Param('id') id: string,
    @Body() dto: UpdateV2StoreCostDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.updateStoreCost(id, dto, user);
  }
  @Delete('costs/:id')
  @RequirePermissions('performance:update')
  deleteCost(@Param('id') id: string, @CurrentUserInfo() user: CurrentUser) {
    return this.service.deleteStoreCost(id, user);
  }

  @Post('stores/:storeId/investments')
  @RequirePermissions('performance:update')
  createInvestment(
    @Param('storeId') storeId: string,
    @Body() dto: CreateV2StoreInvestmentDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createStoreInvestment(storeId, dto, user);
  }
  @Patch('investments/:id')
  @RequirePermissions('performance:update')
  updateInvestment(
    @Param('id') id: string,
    @Body() dto: UpdateV2StoreInvestmentDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.updateStoreInvestment(id, dto, user);
  }
  @Delete('investments/:id')
  @RequirePermissions('performance:update')
  deleteInvestment(
    @Param('id') id: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.deleteStoreInvestment(id, user);
  }

  @Post('stores/:storeId/assets')
  @RequirePermissions('store:update')
  createAsset(
    @Param('storeId') storeId: string,
    @Body() dto: CreateV2StoreAssetDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createStoreAsset(storeId, dto, user);
  }
  @Patch('assets/:id')
  @RequirePermissions('store:update')
  updateAsset(
    @Param('id') id: string,
    @Body() dto: UpdateV2StoreAssetDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.updateStoreAsset(id, dto, user);
  }
  @Delete('assets/:id')
  @RequirePermissions('store:update')
  deleteAsset(@Param('id') id: string, @CurrentUserInfo() user: CurrentUser) {
    return this.service.deleteStoreAsset(id, user);
  }

  @Post('stores/:storeId/areas')
  @RequirePermissions('store:update')
  createArea(
    @Param('storeId') storeId: string,
    @Body() dto: CreateV2StoreAreaDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createStoreArea(storeId, dto, user);
  }
  @Patch('areas/:id')
  @RequirePermissions('store:update')
  updateArea(
    @Param('id') id: string,
    @Body() dto: UpdateV2StoreAreaDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.updateStoreArea(id, dto, user);
  }
  @Delete('areas/:id')
  @RequirePermissions('store:update')
  deleteArea(@Param('id') id: string, @CurrentUserInfo() user: CurrentUser) {
    return this.service.deleteStoreArea(id, user);
  }
}
