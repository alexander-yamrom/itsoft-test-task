import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsHealthService } from './events-health.service';
import { EventsConsumer } from './events.consumer';
import { EventsQueryController } from './events-query.controller';
import { StorageModule } from '../modules/storage/storage.module';
import { LogsModule } from '../modules/logs/logs.module';

@Module({
  imports: [
    ConfigModule,
    StorageModule,
    LogsModule
  ],
  controllers: [EventsController, EventsQueryController],
  providers: [
    EventsService,
    EventsHealthService,
    EventsConsumer
  ],
  exports: [
    EventsService,
    EventsHealthService
  ]
})
export class EventsModule {}