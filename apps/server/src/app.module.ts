import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { IamModule } from './modules/iam/iam.module';
import { OrgModule } from './modules/org/org.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { StoreModule } from './modules/store/store.module';
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
    OrgModule,
    StoreModule,
    PerformanceModule,
    ScoringModule
  ]
})
export class AppModule {}
