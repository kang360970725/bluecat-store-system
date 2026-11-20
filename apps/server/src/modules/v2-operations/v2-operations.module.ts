import { Module } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { V2OperationsController } from './v2-operations.controller';
import { V2OperationsService } from './v2-operations.service';
import { V2OperationsDashboardService } from './v2-operations-dashboard.service';
import { V2BridgeSnapshotSyncService } from './v2-bridge-snapshot-sync.service';
import { V2OperationsReportService } from './v2-operations-report.service';
import { V2UsageAnalyticsService } from './v2-usage-analytics.service';

@Module({
  controllers: [V2OperationsController],
  providers: [
    V2OperationsService,
    V2OperationsDashboardService,
    V2OperationsReportService,
    V2UsageAnalyticsService,
    V2BridgeSnapshotSyncService,
    PermissionGuard
  ],
  exports: [V2OperationsService]
})
export class V2OperationsModule {}
