import { Module } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { V2RechargeContestController } from './v2-recharge-contest.controller';
import { V2RechargeContestService } from './v2-recharge-contest.service';

@Module({
  controllers: [V2RechargeContestController],
  providers: [V2RechargeContestService, PermissionGuard]
})
export class V2RechargeContestModule {}
