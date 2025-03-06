import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { RedisTimeSeriesService } from '../storage/redis-timeseries.service';
import { LogEvent } from '../../interfaces/log-event.interface';

@Injectable()
export class RabbitMQConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQConsumerService.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private readonly queueName: string;
  private readonly exchangeName: string;
  private readonly routingKey: string;

  constructor(
    private configService: ConfigService,
    private redisTimeSeriesService: RedisTimeSeriesService,
  ) {
    this.queueName = this.configService.get<string>('RABBITMQ_QUEUE', 'data_service_logs');
    this.exchangeName = this.configService.get<string>('RABBITMQ_EXCHANGE', 'data_service_events');
    this.routingKey = this.configService.get<string>('RABBITMQ_ROUTING_KEY_PATTERN', 'data.service.#');
  }

  async onModuleInit() {
    await this.setupRabbitMQ();
  }

  async onModuleDestroy() {
    await this.closeConnection();
  }

  private async setupRabbitMQ() {
    try {
      const url = this.configService.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672');
      this.logger.log(`Connecting to RabbitMQ at ${url}`);
      
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      
      // Check if the queue exists
      try {
        // Use checkQueue instead of assertQueue to avoid modifying the queue
        const queueInfo = await this.channel.checkQueue(this.queueName);
        this.logger.log(`Queue ${this.queueName} already exists with ${queueInfo.messageCount} messages`);
      } catch (error) {
        // Queue doesn't exist, create it
        this.logger.log(`Queue ${this.queueName} doesn't exist, creating it`);
        
        // Ensure exchange exists
        await this.channel.assertExchange(this.exchangeName, 'topic', { durable: true });
        
        // Create the queue with default settings
        await this.channel.assertQueue(this.queueName, { durable: true });
        
        // Bind queue to exchange with routing key
        await this.channel.bindQueue(this.queueName, this.exchangeName, this.routingKey);
      }
      
      // Start consuming messages
      this.logger.log(`Consuming messages from queue: ${this.queueName}`);
      await this.channel.consume(this.queueName, this.onMessage.bind(this), { noAck: false });
      
      this.logger.log('RabbitMQ consumer setup completed');
    } catch (error) {
      this.logger.error(`Failed to setup RabbitMQ consumer: ${error.message}`);
      throw error;
    }
  }

  private async onMessage(msg: amqp.ConsumeMessage | null) {
    if (!msg) {
      this.logger.warn('Received null message from RabbitMQ');
      return;
    }

    try {
      const content = msg.content.toString();
      this.logger.debug(`Received message: ${content}`);
      
      const logEvent: LogEvent = JSON.parse(content);
      
      // Store the log event in Redis TimeSeries
      const stored = await this.redisTimeSeriesService.storeLogEvent(logEvent);
      
      if (stored) {
        this.logger.debug(`Successfully stored log event in Redis TimeSeries: ${logEvent.eventId}`);
        this.channel.ack(msg);
      } else {
        this.logger.error(`Failed to store log event in Redis TimeSeries: ${logEvent.eventId}`);
        // Requeue the message to try again later
        this.channel.nack(msg, false, true);
      }
    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`);
      // Requeue the message to try again later
      this.channel.nack(msg, false, true);
    }
  }

  private async closeConnection() {
    try {
      if (this.channel) {
        await this.channel.close();
        this.logger.log('RabbitMQ channel closed');
      }
      
      if (this.connection) {
        await this.connection.close();
        this.logger.log('RabbitMQ connection closed');
      }
    } catch (error) {
      this.logger.error(`Error closing RabbitMQ connection: ${error.message}`);
    }
  }
} 