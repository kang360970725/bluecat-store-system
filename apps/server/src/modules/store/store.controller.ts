import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import type { CurrentUser } from '@bluecat/shared';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  CreateEmployeeDto,
  CreateStoreAreaDto,
  CreateStoreDto,
  UpdateEmployeeDto,
  UpdateStoreAreaDto,
  UpdateStoreDto,
  UpsertAreaPricesDto
} from './dto/store.dto';
import { StoreService } from './store.service';

@ApiTags('store')
@ApiBearerAuth()
@Controller('stores')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get()
  @RequirePermissions('store:view')
  list(@CurrentUserInfo() user: CurrentUser) {
    return this.storeService.list(user);
  }

  @Post()
  @RequirePermissions('store:create')
  create(@Body() dto: CreateStoreDto, @CurrentUserInfo() user: CurrentUser) {
    return this.storeService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('store:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.storeService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('store:delete')
  remove(@Param('id') id: string, @CurrentUserInfo() user: CurrentUser) {
    return this.storeService.remove(id, user);
  }

  @Get('employees')
  @RequirePermissions('employee:view')
  listEmployees(
    @CurrentUserInfo() user: CurrentUser,
    @Query('storeId') storeId?: string
  ) {
    return this.storeService.listEmployees(user, storeId);
  }

  @Post('employees')
  @RequirePermissions('employee:create')
  createEmployee(
    @Body() dto: CreateEmployeeDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.storeService.createEmployee(dto, user);
  }

  @Patch('employees/:id')
  @RequirePermissions('employee:update')
  updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.storeService.updateEmployee(id, dto, user);
  }

  @Delete('employees/:id')
  @RequirePermissions('employee:delete')
  removeEmployee(
    @Param('id') id: string,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.storeService.removeEmployee(id, user);
  }

  @Get('areas')
  @RequirePermissions('store-area:view')
  listAreas(
    @CurrentUserInfo() user: CurrentUser,
    @Query('storeId') storeId?: string
  ) {
    return this.storeService.listAreas(user, storeId);
  }

  @Post('areas')
  @RequirePermissions('store-area:create')
  createArea(
    @Body() dto: CreateStoreAreaDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.storeService.createArea(dto, user);
  }

  @Patch('areas/:id')
  @RequirePermissions('store-area:update')
  updateArea(
    @Param('id') id: string,
    @Body() dto: UpdateStoreAreaDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.storeService.updateArea(id, dto, user);
  }

  @Delete('areas/:id')
  @RequirePermissions('store-area:delete')
  removeArea(@Param('id') id: string, @CurrentUserInfo() user: CurrentUser) {
    return this.storeService.removeArea(id, user);
  }

  @Post('areas/:id/prices')
  @RequirePermissions('store-area-price:update')
  upsertAreaPrices(
    @Param('id') id: string,
    @Body() dto: UpsertAreaPricesDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.storeService.upsertAreaPrices(id, dto, user);
  }
}
