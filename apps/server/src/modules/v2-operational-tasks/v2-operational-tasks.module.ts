import { Module } from '@nestjs/common';
import { V2OperationalTasksController } from './v2-operational-tasks.controller';
import { V2OperationalTasksService } from './v2-operational-tasks.service';
import { TaskEvidenceObjectStorage } from './task-evidence-storage';
import { V2AttendanceModule } from '../v2-attendance/v2-attendance.module';

@Module({
  imports: [V2AttendanceModule],
  controllers: [V2OperationalTasksController],
  providers: [V2OperationalTasksService, TaskEvidenceObjectStorage]
})
export class V2OperationalTasksModule {}
