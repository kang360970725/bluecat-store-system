import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { IamModule } from './modules/iam/iam.module';
import { V2MasterDataModule } from './modules/v2-master-data/v2-master-data.module';
import { V2OperationsModule } from './modules/v2-operations/v2-operations.module';
import { V2RechargeContestModule } from './modules/v2-recharge-contest/v2-recharge-contest.module';
import { V2FinanceModule } from './modules/v2-finance/v2-finance.module';
import { V2AttendanceModule } from './modules/v2-attendance/v2-attendance.module';
import { V2OperationalTasksModule } from './modules/v2-operational-tasks/v2-operational-tasks.module';
import appConfig from './common/config/app.config';
import databaseConfig from './common/config/database.config';
import jwtConfig from './common/config/jwt.config';
import redisConfig from './common/config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      load: [appConfig, databaseConfig, redisConfig, jwtConfig]
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port')
        }
      })
    }),
    DatabaseModule,
    AuthModule,
    IamModule,
    V2MasterDataModule,
    V2OperationsModule,
    V2RechargeContestModule,
    V2FinanceModule,
    V2AttendanceModule,
    V2OperationalTasksModule
  ]
})
export class AppModule {}
