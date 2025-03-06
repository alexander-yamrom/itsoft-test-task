import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { StorageModule } from '../storage/storage.module';
import { RabbitMQConsumerService } from './rabbitmq-consumer.service';

@Module({
  imports: [StorageModule],
  controllers: [LogsController],
  providers: [LogsService, RabbitMQConsumerService],
  exports: [LogsService, RabbitMQConsumerService]
})
export class LogsModule {} 