import { Module } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { V2MasterDataController } from './v2-master-data.controller';
import { V2MasterDataService } from './v2-master-data.service';

@Module({
  controllers: [V2MasterDataController],
  providers: [V2MasterDataService, PermissionGuard]
})
export class V2MasterDataModule {}
