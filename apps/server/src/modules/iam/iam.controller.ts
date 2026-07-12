import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  CreatePermissionDto,
  CreatePositionDto,
  CreateRoleDto,
  CreateUserDto,
  UpdatePermissionDto,
  UpdatePositionDto,
  UpdateRoleDto,
  UpdateUserDto
} from './dto/iam.dto';
import { IamService } from './iam.service';

@ApiTags('iam')
@ApiBearerAuth()
@Controller('iam')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IamController {
  constructor(private readonly iamService: IamService) {}

  @Get('modules')
  @RequirePermissions('iam:view')
  modules() {
    return ['user', 'role', 'permission', 'data-scope'];
  }

  @Get('permissions')
  @RequirePermissions('permission:view')
  listPermissions() {
    return this.iamService.listPermissions();
  }

  @Post('permissions')
  @RequirePermissions('permission:create')
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.iamService.createPermission(dto);
  }

  @Patch('permissions/:id')
  @RequirePermissions('permission:update')
  updatePermission(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.iamService.updatePermission(id, dto);
  }

  @Delete('permissions/:id')
  @RequirePermissions('permission:delete')
  removePermission(@Param('id') id: string) {
    return this.iamService.removePermission(id);
  }

  @Get('roles')
  @RequirePermissions('role:view')
  listRoles() {
    return this.iamService.listRoles();
  }

  @Post('roles')
  @RequirePermissions('role:create')
  createRole(@Body() dto: CreateRoleDto) {
    return this.iamService.createRole(dto);
  }

  @Patch('roles/:id')
  @RequirePermissions('role:update')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.iamService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions('role:delete')
  removeRole(@Param('id') id: string) {
    return this.iamService.removeRole(id);
  }

  @Get('positions')
  @RequirePermissions('position:view')
  listPositions() {
    return this.iamService.listPositions();
  }

  @Post('positions')
  @RequirePermissions('position:create')
  createPosition(@Body() dto: CreatePositionDto) {
    return this.iamService.createPosition(dto);
  }

  @Patch('positions/:id')
  @RequirePermissions('position:update')
  updatePosition(@Param('id') id: string, @Body() dto: UpdatePositionDto) {
    return this.iamService.updatePosition(id, dto);
  }

  @Delete('positions/:id')
  @RequirePermissions('position:delete')
  removePosition(@Param('id') id: string) {
    return this.iamService.removePosition(id);
  }

  @Get('users')
  @RequirePermissions('user:view')
  listUsers() {
    return this.iamService.listUsers();
  }

  @Post('users')
  @RequirePermissions('user:create')
  createUser(@Body() dto: CreateUserDto) {
    return this.iamService.createUser(dto);
  }

  @Patch('users/:id')
  @RequirePermissions('user:update')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.iamService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @RequirePermissions('user:delete')
  removeUser(@Param('id') id: string) {
    return this.iamService.removeUser(id);
  }
}
