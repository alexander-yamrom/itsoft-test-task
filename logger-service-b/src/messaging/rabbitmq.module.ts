import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitMQConsumerService } from './rabbitmq.consumer';
import rabbitmqConfig from '../config/rabbitmq.config';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    ConfigModule.forFeature(rabbitmqConfig),
    StorageModule,
  ],
  providers: [RabbitMQConsumerService],
  exports: [RabbitMQConsumerService],
})
export class RabbitMQModule {} 