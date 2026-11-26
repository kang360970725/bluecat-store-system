import { Module } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { V2OperationsModule } from '../v2-operations/v2-operations.module';
import { V2FinanceController } from './v2-finance.controller';
import { V2FinanceService } from './v2-finance.service';

@Module({
  imports: [V2OperationsModule],
  controllers: [V2FinanceController],
  providers: [V2FinanceService, PermissionGuard]
})
export class V2FinanceModule {}
