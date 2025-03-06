import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { EventsService, EventData } from './events.service';
import { 
  RABBITMQ_EXCHANGE,
  RABBITMQ_QUEUE,
  RABBITMQ_ROUTING_KEY_PATTERN,
  RABBITMQ_DEAD_LETTER_EXCHANGE,
  RABBITMQ_DEAD_LETTER_QUEUE,
  EVENT_PROCESSING
} from './constants/events.constants';

@Injectable()
export class EventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsConsumer.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel;

  constructor(
    private configService: ConfigService,
    private eventsService: EventsService,
  ) {}

  async onModuleInit() {
    await this.connectToRabbitMQ();
    await this.consumeMessages();
  }

  async onModuleDestroy() {
    await this.closeConnection();
  }

  private async connectToRabbitMQ() {
    try {
      const rabbitmqUrl = this.configService.get<string>('RABBITMQ_URL');
      this.connection = await amqp.connect(rabbitmqUrl);
      this.channel = await this.connection.createChannel();
      
      this.logger.log('Successfully connected to RabbitMQ');
      
      // Handle connection errors
      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error', err);
        this.reconnect();
      });
      
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.reconnect();
      });
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
      // Retry connection after delay
      setTimeout(() => this.connectToRabbitMQ(), 5000);
    }
  }

  private async reconnect() {
    this.logger.log('Attempting to reconnect to RabbitMQ...');
    setTimeout(() => this.connectToRabbitMQ(), 5000);
  }

  private async closeConnection() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('Closed RabbitMQ connection');
    } catch (error) {
      this.logger.error('Error closing RabbitMQ connection', error);
    }
  }

  private async consumeMessages() {
    try {
      // Ensure exchange exists
      await this.channel.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });
      
      // Create queue with dead letter exchange for failed messages
      await this.channel.assertExchange(RABBITMQ_DEAD_LETTER_EXCHANGE, 'fanout', { durable: true });
      
      await this.channel.assertQueue(RABBITMQ_DEAD_LETTER_QUEUE, { durable: true });
      await this.channel.bindQueue(RABBITMQ_DEAD_LETTER_QUEUE, RABBITMQ_DEAD_LETTER_EXCHANGE, '');
      
      const queueOptions = {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': RABBITMQ_DEAD_LETTER_EXCHANGE,
          'x-message-ttl': 1000 * 60 * 60 * 24, // 24 hours
        },
      };
      
      const { queue: queueName } = await this.channel.assertQueue(RABBITMQ_QUEUE, queueOptions);
      await this.channel.bindQueue(queueName, RABBITMQ_EXCHANGE, RABBITMQ_ROUTING_KEY_PATTERN);
      
      // Set prefetch to avoid overwhelming the consumer
      await this.channel.prefetch(EVENT_PROCESSING.PREFETCH_COUNT);
      
      this.logger.log(`Waiting for messages on queue: ${queueName}`);
      
      // Start consuming messages
      await this.channel.consume(
        queueName,
        async (msg) => {
          if (!msg) return;
          
          try {
            const content = msg.content.toString();
            const event = JSON.parse(content);
            
            this.logger.debug(`Received event: ${msg.fields.routingKey}`);
            
            // Process and store the event
            await this.processEvent(event, msg.fields.routingKey);
            
            // Acknowledge the message
            this.channel.ack(msg);
          } catch (error) {
            this.logger.error(`Error processing message: ${error.message}`, error.stack);
            
            // Reject the message and requeue if it's not been redelivered too many times
            const redelivered = msg.fields.redelivered;
            this.channel.reject(msg, !redelivered);
            
            if (redelivered) {
              this.logger.warn('Message rejected and sent to DLQ after redelivery attempt');
            }
          }
        },
        { noAck: false }
      );
    } catch (error) {
      this.logger.error('Failed to set up message consumption', error);
      // Retry after delay
      setTimeout(() => this.consumeMessages(), 5000);
    }
  }

  private async processEvent(event: any, routingKey: string): Promise<void> {
    try {
      // Extract event type from routing key (e.g., log.request -> request)
      const eventType = routingKey.split('.')[1] || 'unknown';
      
      // Prepare event data
      const eventData: EventData = {
        timestamp: event.timestamp,
        serviceId: event.serviceId || 'service-a',
        endpoint: event.endpoint || '',
        method: event.method || '',
        statusCode: event.statusCode,
        executionTime: event.executionTime,
        correlationId: event.correlationId,
        headers: event.headers,
        request: event.request,
        response: event.response,
        error: event.error,
        metadata: event.metadata,
      };
      
      // Process and store the event using EventsService
      await this.eventsService.processEvent(eventData, eventType);
      
    } catch (error) {
      this.logger.error(`Error processing event: ${error.message}`, error.stack);
      throw error; // Rethrow to trigger message rejection
    }
  }
}