import { Module } from '@nestjs/common';
import { V2OperationalTasksController } from './v2-operational-tasks.controller';
import { V2OperationalTasksService } from './v2-operational-tasks.service';
import { TaskEvidenceObjectStorage } from './task-evidence-storage';

@Module({
  controllers: [V2OperationalTasksController],
  providers: [V2OperationalTasksService, TaskEvidenceObjectStorage]
})
export class V2OperationalTasksModule {}
