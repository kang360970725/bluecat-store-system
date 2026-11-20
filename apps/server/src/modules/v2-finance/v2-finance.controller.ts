import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
  CalculatePayrollBatchDto,
  CreatePayrollBatchDto,
  TransitionPayrollBatchDto
} from './dto';
import { V2FinanceService } from './v2-finance.service';

@ApiTags('v2-finance')
@ApiBearerAuth()
@Controller('v2/finance')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class V2FinanceController {
  constructor(private readonly service: V2FinanceService) {}
  @Get('payroll-batches')
  @RequirePermissions('finance.payroll:view_summary')
  listBatches() {
    return this.service.listBatches();
  }
  @Post('payroll-batches')
  @RequirePermissions('finance.payroll:manage')
  createBatch(
    @Body() dto: CreatePayrollBatchDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.createBatch(dto, user);
  }
  @Delete('payroll-batches/:id')
  @RequirePermissions('finance.payroll:manage')
  deleteBatch(@Param('id') id: string) {
    return this.service.deleteBatch(id);
  }
  @Get('payroll-batches/:id')
  @RequirePermissions('finance.payroll:view_summary')
  getBatch(
    @Param('id') id: string,
    @Query('sensitive') sensitive: string | undefined,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.getBatch(id, user, sensitive === 'true');
  }
  @Post('payroll-batches/:id/transition')
  @RequirePermissions('finance.payroll:view_summary')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionPayrollBatchDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.transition(id, dto, user);
  }
  @Post('payroll-batches/:id/calculate')
  @RequirePermissions('finance.payroll:calculate')
  calculate(
    @Param('id') id: string,
    @Body() dto: CalculatePayrollBatchDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.service.calculateBatch(id, dto, user);
  }
}
