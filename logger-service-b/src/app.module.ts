import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { RabbitMQModule } from './messaging/rabbitmq.module';
import { LogsModule } from './modules/logs/logs.module';
import { StorageModule } from './modules/storage/storage.module';
import { ReportModule } from './modules/report/report.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RabbitMQModule,
    StorageModule,
    LogsModule,
    ReportModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}