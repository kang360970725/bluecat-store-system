import { Module } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { IamController } from './iam.controller';
import { IamService } from './iam.service';

@Module({
  controllers: [IamController],
  providers: [IamService, PermissionGuard]
})
export class IamModule {}
