import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { CurrentUser } from '@bluecat/shared';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  CreateScoreItemDto,
  UpdateScoreItemDto,
  UpsertStoreScoreEntryDto
} from './dto/scoring.dto';
import { ScoringService } from './scoring.service';

@ApiTags('scoring')
@ApiBearerAuth()
@Controller('scoring')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  @Get('items')
  @RequirePermissions('scoring:view')
  listItems() {
    return this.scoringService.listItems();
  }

  @Post('items')
  @RequirePermissions('scoring:config')
  createItem(@Body() dto: CreateScoreItemDto, @CurrentUserInfo() user: CurrentUser) {
    return this.scoringService.createItem(dto, user);
  }

  @Patch('items/:id')
  @RequirePermissions('scoring:config')
  updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateScoreItemDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.scoringService.updateItem(id, dto, user);
  }

  @Get('monthly')
  @RequirePermissions('scoring:view')
  listMonthly(
    @CurrentUserInfo() user: CurrentUser,
    @Query('month') month?: string
  ) {
    return this.scoringService.listMonthly(month, user);
  }

  @Post('entries')
  @RequirePermissions('scoring:update')
  upsertEntry(
    @Body() dto: UpsertStoreScoreEntryDto,
    @CurrentUserInfo() user: CurrentUser
  ) {
    return this.scoringService.upsertEntry(dto, user);
  }
}
