import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { EventsService } from './events.service';
import {
  EVENT_HEALTH_CHECK,
  RABBITMQ_EXCHANGE,
  RABBITMQ_QUEUE,
  RABBITMQ_DEAD_LETTER_QUEUE
} from './constants/events.constants';
import { HealthStatus } from './health-status.model';

@Injectable()
export class EventsHealthService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsHealthService.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private lastStatus: HealthStatus;
  private isConnecting: boolean = false;

  constructor(
    private configService: ConfigService,
    private eventsService: EventsService,
  ) {
    this.initializeHealth();
  }

  /**
   * Initialize the health monitoring service
   * Sets up RabbitMQ connection and performs initial health check
   */
  private async initializeHealth(): Promise<void> {
    try {
      await this.connectRabbitMQ();
      await this.checkHealth();
    } catch (error) {
      this.logger.error(`Health initialization failed: ${error.message}`, error.stack);
      this.setHealthDown();
    }
  }

  /**
   * Connect to RabbitMQ
   */
  private async connectRabbitMQ(): Promise<void> {
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      const rabbitMqUrl = this.configService.get<string>('RABBITMQ_URL');

      if (!rabbitMqUrl) {
        throw new Error('RABBITMQ_URL is not defined in the configuration');
      }

      this.connection = await amqp.connect(rabbitMqUrl);
      this.channel = await this.connection.createChannel();

      // Basic setup for exchange and queues
      await this.channel.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });
      await this.channel.assertQueue(RABBITMQ_QUEUE, { durable: true });
      await this.channel.assertQueue(RABBITMQ_DEAD_LETTER_QUEUE, { durable: true });

      this.logger.log('Successfully connected to RabbitMQ');

      // Setup connection error handlers
      this.connection.on('error', (error) => {
        this.logger.error(`RabbitMQ connection error: ${error.message}`, error.stack);
        this.setHealthDown();
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.setHealthDown();
      });

    } catch (error) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error.message}`, error.stack);
      this.setHealthDown();
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Set health status to down
   */
  private setHealthDown(): void {
    this.lastStatus = {
      status: 'down',
      details: {
        rabbitmq: {
          status: 'down',
          connection: false,
          exchange: false,
          queue: false,
          deadLetterQueue: false,
        },
        processing: {
          status: 'down',
          messageCount: 0,
          consumerCount: 0,
          deadLetterCount: 0,
        },
      },
      timestamp: new Date(),
    };
  }

  /**
   * Check the health of the service
   * @returns The current health status
   */
  async checkHealth(): Promise<HealthStatus> {
    try {
      if (!this.connection || !this.channel) {
        await this.connectRabbitMQ();
      }

      // Check if connection is still active
      if (!this.connection || !this.channel) {
        throw new Error('No active RabbitMQ connection');
      }

      // Get queue information
      const queueInfo = await this.channel.checkQueue(RABBITMQ_QUEUE);
      const deadLetterQueueInfo = await this.channel.checkQueue(RABBITMQ_DEAD_LETTER_QUEUE);

      this.lastStatus = {
        status: 'up',
        details: {
          rabbitmq: {
            status: 'up',
            connection: true,
            exchange: true,
            queue: true,
            deadLetterQueue: true,
          },
          processing: {
            status: 'up',
            messageCount: queueInfo.messageCount,
            consumerCount: queueInfo.consumerCount,
            deadLetterCount: deadLetterQueueInfo.messageCount,
          },
        },
        timestamp: new Date(),
      };

      return this.lastStatus;
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`, error.stack);
      this.setHealthDown();
      return this.lastStatus;
    }
  }

  /**
 * Get the last known health status
 * @returns Promise with the health status
 */
  async getStatus(): Promise<HealthStatus> {
    if (this.lastStatus) {
      return this.lastStatus;
    }
    return await this.checkHealth();
  }

  /**
   * Clean up resources when the module is destroyed
   */
  async onModuleDestroy(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('RabbitMQ connections closed');
    } catch (error) {
      this.logger.error(`Error closing RabbitMQ connections: ${error.message}`, error.stack);
    }
  }
}