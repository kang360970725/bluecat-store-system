import { Module } from '@nestjs/common';
import { V2OperationalTasksController } from './v2-operational-tasks.controller';
import { V2OperationalTasksService } from './v2-operational-tasks.service';

@Module({
  controllers: [V2OperationalTasksController],
  providers: [V2OperationalTasksService]
})
export class V2OperationalTasksModule {}
