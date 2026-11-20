import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CurrentUser } from '@bluecat/shared';
import { CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { V2RechargeContestService } from './v2-recharge-contest.service';

@ApiTags('v2-recharge-contest')
@ApiBearerAuth()
@Controller('v2/recharge-contest')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class V2RechargeContestController {
  constructor(private readonly service: V2RechargeContestService) {}

  @Get('leaderboard')
  @RequirePermissions('performance:view')
  leaderboard(@CurrentUserInfo() user: CurrentUser) {
    return this.service.leaderboard(user);
  }

  @Get('entries')
  @RequirePermissions('performance:view')
  entries(@CurrentUserInfo() user: CurrentUser, @Query('page') page?: string, @Query('storeId') storeId?: string, @Query('bound') bound?: string, @Query('card') card?: string, @Query('salesperson') salesperson?: string) {
    return this.service.entries(user, Number(page) || 1, storeId, bound, card, salesperson);
  }

  @Patch('entries/:id/salesperson')
  @RequirePermissions('performance:update')
  bindSalesperson(@Param('id') id: string, @Body() body: { salespersonName?: string }, @CurrentUserInfo() user: CurrentUser) {
    return this.service.updateEntry(id, { salespersonName: body.salespersonName }, user);
  }

  @Patch('entries/:id')
  @RequirePermissions('performance:update')
  updateEntry(@Param('id') id: string, @Body() body: { salespersonName?: string; note?: string }, @CurrentUserInfo() user: CurrentUser) {
    return this.service.updateEntry(id, body, user);
  }

  @Post('push')
  @RequirePermissions('performance:update')
  push() { return this.service.pushContestReport(true); }

  @Get('push-preview')
  @RequirePermissions('performance:update')
  previewPush() { return this.service.previewContestReport(); }

  @Post('sync')
  @RequirePermissions('performance:update')
  sync() {
    return this.service.sync('manual');
  }
}
