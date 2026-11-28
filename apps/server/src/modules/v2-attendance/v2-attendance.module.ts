import { Module } from '@nestjs/common';
import { V2AttendanceController } from './v2-attendance.controller';
import { V2AttendanceService } from './v2-attendance.service';

import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [V2AttendanceController],
  providers: [V2AttendanceService],
  exports: [V2AttendanceService]
})
export class V2AttendanceModule {}
