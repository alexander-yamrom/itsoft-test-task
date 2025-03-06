import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { validateOrReject } from 'class-validator';
import { BaseEventDto, HttpRequestDto } from './base-event.dto';
import { LogEventDto, LogLevel } from './dto/log-event.dto';
import { Request } from 'express';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel | amqp.ConfirmChannel;
  private readonly exchange: string;
  private readonly queue: string;
  private readonly routingKey: string;
  private readonly url: string;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;
  private isConnected = false;
  private isConfirmChannel = false; // Flag to determine channel type
  private readonly useConfirmChannel: boolean;
  private readonly reconnectDelayBase: number; // Base delay for reconnect in ms
  private readonly prefetchCount: number; // Number of messages processed simultaneously
  private readonly enableDeadLetter: boolean; // Enable dead letter support
  private readonly messageOptions: Record<string, unknown>; // Message options

  constructor(private configService: ConfigService) {
    // Basic connection settings
    this.url = this.configService.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672');
    this.exchange = this.configService.get<string>('RABBITMQ_EXCHANGE', 'data_service_events');
    this.queue = this.configService.get<string>('RABBITMQ_QUEUE', 'data_service_logs');
    this.routingKey = this.configService.get<string>('RABBITMQ_ROUTING_KEY', 'data.service.logs');
    
    // Advanced settings
    this.maxReconnectAttempts = this.configService.get<number>('RABBITMQ_MAX_RECONNECT_ATTEMPTS', 10);
    this.useConfirmChannel = this.configService.get<string>('RABBITMQ_USE_CONFIRM_CHANNEL', 'true') !== 'false';
    this.reconnectDelayBase = this.configService.get<number>('RABBITMQ_RECONNECT_DELAY_BASE', 1000);
    this.prefetchCount = this.configService.get<number>('RABBITMQ_PREFETCH_COUNT', 10);
    this.enableDeadLetter = this.configService.get<string>('RABBITMQ_ENABLE_DEAD_LETTER', 'true') !== 'false';
    
    // Default message settings
    this.messageOptions = {
      persistent: true,
      contentType: 'application/json',
      contentEncoding: 'utf-8',
    };
    
    this.logger.log(`RabbitMQ configured with: ${JSON.stringify({
      url: this.url,
      exchange: this.exchange,
      queue: this.queue,
      useConfirmChannel: this.useConfirmChannel,
      prefetchCount: this.prefetchCount,
      enableDeadLetter: this.enableDeadLetter
    }, null, 2)}`);
  }

  async onModuleInit() {
    try {
      await this.connect();
    } catch (error) {
      this.logger.error(`Failed to initialize RabbitMQ connection: ${error.message}`, error.stack);
      // Attempts to reconnect will be handled by this.reconnect() which is called in connect()
    }
  }

  async onModuleDestroy() {
    try {
      await this.close();
    } catch (error) {
      this.logger.error(`Error during RabbitMQ shutdown: ${error.message}`, error.stack);
      // Ensure we don't leave any unhandled promises during shutdown
    }
  }

  private async connect() {
    try {
      this.logger.log(`Connecting to RabbitMQ at ${this.url}`);
      this.connection = await amqp.connect(this.url);
      
      this.connection.on('error', (err) => {
        this.logger.error(`RabbitMQ connection error: ${err.message}`, err.stack);
        this.isConnected = false;
        this.reconnect();
      });
      
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.isConnected = false;
        this.reconnect();
      });
      
      // Create confirm channel for delivery confirmations if enabled
      try {
        if (this.useConfirmChannel) {
          this.channel = await this.connection.createConfirmChannel();
          this.isConfirmChannel = true;
          this.logger.log('Created confirm channel for publisher confirms');
        } else {
          this.channel = await this.connection.createChannel();
          this.isConfirmChannel = false;
          this.logger.log('Created regular channel (publisher confirms disabled)');
        }
      } catch (error) {
        this.logger.warn(`Failed to create ${this.useConfirmChannel ? 'confirm' : 'regular'} channel: ${error.message}. Falling back to regular channel.`);
        this.channel = await this.connection.createChannel();
        this.isConfirmChannel = false;
      }
      
      this.channel.on('error', (err) => {
        this.logger.error(`RabbitMQ channel error: ${err.message}`, err.stack);
      });
      
      // Setup exchange, queue, and binding
      await this.setupExchangeAndQueue();
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.logger.log('Connected to RabbitMQ successfully');
    } catch (error) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error.message}`, error.stack);
      this.isConnected = false;
      this.reconnect();
    }
  }

  private async setupExchangeAndQueue() {
    if (!this.channel) {
      throw new Error('Channel not available');
    }
    
    try {
      // Assert exchange (create if doesn't exist)
      await this.channel.assertExchange(this.exchange, 'topic', {
        durable: true,
        autoDelete: false,
      });
      
      // Assert queue (create if doesn't exist)
      const queueOptions: any = {
        durable: true,
        autoDelete: false,
      };
      
      // Add dead letter settings only if enabled
      if (this.enableDeadLetter) {
        queueOptions.arguments = {
          'x-dead-letter-exchange': `${this.exchange}.dlx`,
          'x-dead-letter-routing-key': `${this.routingKey}.dead`,
        };
        
        // Create dead letter exchange and queue
        await this.channel.assertExchange(`${this.exchange}.dlx`, 'topic', {
          durable: true,
          autoDelete: false,
        });
        
        // Create dead letter queue
        await this.channel.assertQueue(`${this.queue}.dead`, {
          durable: true,
          autoDelete: false,
        });
        
        // Bind dead letter queue to dead letter exchange
        await this.channel.bindQueue(
          `${this.queue}.dead`,
          `${this.exchange}.dlx`,
          `${this.routingKey}.dead`,
        );
      }
      
      await this.channel.assertQueue(this.queue, queueOptions);
      
      // Bind the main queue to the exchange
      await this.channel.bindQueue(this.queue, this.exchange, this.routingKey);
      
      // Set prefetch count for better load balancing
      await this.channel.prefetch(this.prefetchCount);
      
      this.logger.log(`Exchange ${this.exchange} and queue ${this.queue} set up successfully`);
    } catch (error) {
      this.logger.error(`Failed to set up exchange and queue: ${error.message}`, error.stack);
      throw error; // Re-throw to allow connect method to handle it
    }
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        `Failed to reconnect to RabbitMQ after ${this.maxReconnectAttempts} attempts`,
      );
      return;
    }
    
    const delay = Math.min(this.reconnectDelayBase * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    this.logger.log(`Attempting to reconnect to RabbitMQ in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      // Wrap connect in try-catch to prevent unhandled promise rejections
      this.connect().catch(error => {
        this.logger.error(`Error during reconnect attempt: ${error.message}`, error.stack);
        // Continue reconnection attempts despite errors
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnect();
        }
      });
    }, delay);
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error(`Error closing RabbitMQ connection: ${error.message}`, error.stack);
    }
  }

  /**
   * Generate a unique message ID
   * @returns string - Unique message ID
   * @private
   */
  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Generates a correlation ID for log events if not provided
   * Format: corr-{timestamp}-{randomString}
   */
  private generateCorrelationId(): string {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `corr-${timestamp}-${randomStr}`;
  }

  /**
   * Publish an event to RabbitMQ
   * @param event - Event data to publish
   * @param correlationId - Optional correlation ID for message tracking
   * @returns Promise<boolean> - Whether the message was successfully published and confirmed
   */
  async publishEvent<T extends BaseEventDto>(event: T, correlationId?: string): Promise<boolean> {
    try {
      // Log for debugging if the event contains request information
      if (event.httpRequest) {
        this.logger.debug(`Publishing event with request info: ${event.httpRequest.method} ${event.httpRequest.path}`);
      } else {
        this.logger.debug(`Publishing event without request info`);
      }

      // Validate event using class-validator
      await validateOrReject(event);
    } catch (validationErrors) {
      this.logger.error(`Event validation failed: ${JSON.stringify(validationErrors)}`);
      return false;
    }

    if (!this.isConnected || !this.channel) {
      this.logger.warn('Cannot publish event: Not connected to RabbitMQ');
      return false;
    }
    
    const specificRoutingKey = this.routingKey;
    
    try {
      // Generate message ID
      const messageId = this.generateMessageId();
      
      // Serialize the message and log content for debugging
      const messageContentStr = JSON.stringify(event, (key, value) => {
        // Handle date values for proper serialization
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });
      this.logger.debug(`Event content before publishing: ${messageContentStr}`);
      
      const messageContent = Buffer.from(messageContentStr);
      
      // Publish the message
      const result = this.channel.publish(this.exchange, specificRoutingKey, messageContent, {
        persistent: true, // Makes message durable
        contentType: 'application/json',
        contentEncoding: 'utf-8',
        messageId: messageId,
        correlationId: correlationId || event.correlationId || messageId, // Use correlationId from params, event, or generate one
        timestamp: Date.now(),
        headers: {
          'x-service': 'data-service-a',
        },
      });
      
      if (!result) {
        this.logger.warn(`Failed to publish message (buffer full) to ${this.exchange}`);
        return false;
      }
      
      // If using confirm channel, wait for confirmation from the broker
      if (this.isConfirmChannel) {
        try {
          await new Promise<void>((resolve, reject) => {
            // Correctly cast type to ConfirmChannel
            const confirmChannel = this.channel as amqp.ConfirmChannel;
            confirmChannel.waitForConfirms()
              .then(() => resolve())
              .catch(err => reject(err));
          });
          this.logger.log(`Message confirmed by broker: ${this.exchange} with routing key ${specificRoutingKey}`);
        } catch (confirmError) {
          this.logger.error(`Message rejected by broker: ${confirmError.message}`);
          return false;
        }
      } else {
        this.logger.log(`Published message to ${this.exchange} with routing key ${specificRoutingKey} (no confirmation)`);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error publishing message: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Publish a log event to RabbitMQ
   * @param logData - Log data to publish
   * @returns Promise<boolean> - Whether the log was successfully published
   */
  async publishLogEvent(logData: {
    level: string | LogLevel;
    message: string;
    timestamp?: Date;
    metadata?: any;
    correlationId?: string;
  }): Promise<boolean> {
    const logEvent = new LogEventDto();
    logEvent.level = (typeof logData.level === 'string') ? logData.level as LogLevel : logData.level;
    logEvent.message = logData.message;
    logEvent.timestamp = logData.timestamp || new Date();
    
    // Generate a correlation ID if not provided
    const correlationId = logData.correlationId || this.generateCorrelationId();
    logEvent.correlationId = correlationId;
    
    if (logData.metadata) {
      logEvent.metadata = logData.metadata;
    }

    try {
      // Validate event using class-validator
      await validateOrReject(logEvent);
      return this.publishEvent(logEvent, correlationId);
    } catch (validationErrors) {
      this.logger.error(`Log event validation failed: ${JSON.stringify(validationErrors)}`);
      return false;
    }
  }

  /**
   * Convert Express request to HttpRequestDto removing sensitive data
   * @param req Express request
   * @returns HttpRequestDto with sanitized data
   */
  private extractHttpRequestData(req: Request): HttpRequestDto {
    // Input validation
    if (!req) {
      this.logger.warn('Attempted to extract request data from undefined request');
      return null;
    }
    
    // List of headers that should not be included in events
    const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'proxy-authorization'];
    
    // Create object with request data
    const httpRequest = new HttpRequestDto();
    httpRequest.method = req.method;
    httpRequest.path = req.path;
    httpRequest.query = req.query;
    httpRequest.params = req.params;
    httpRequest.ip = req.ip;
    
    // Copy request body, possibly excluding sensitive fields
    // (you can add logic to filter sensitive fields in the body)
    if (req.body && typeof req.body === 'object') {
      const safeBody = { ...req.body };
      
      // Remove sensitive fields from request body (example)
      const sensitiveBodyFields = ['password', 'token', 'secret'];
      for (const field of sensitiveBodyFields) {
        if (field in safeBody) {
          safeBody[field] = '***FILTERED***';
        }
      }
      
      httpRequest.body = safeBody;
    }
    
    // Filter headers
    httpRequest.headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!sensitiveHeaders.includes(key.toLowerCase())) {
        httpRequest.headers[key] = value;
      }
    }
    
    return httpRequest;
  }

  /**
   * Publish an event including HTTP request information
   * @param event Event to publish
   * @param req Express request
   * @param correlationId Optional correlation ID
   * @returns Promise<boolean> Publication success
   */
  async publishEventWithRequest<T extends BaseEventDto>(
    event: T, 
    req: Request, 
    correlationId?: string
  ): Promise<boolean> {
    // Add request data to the event
    if (req) {
      event.httpRequest = this.extractHttpRequestData(req);
      
      // If correlationId is not specified, use X-Request-ID header or generate a new one
      if (!correlationId && !event.correlationId) {
        correlationId = (req.headers['x-request-id'] as string) || this.generateCorrelationId();
        event.correlationId = correlationId;
      }
    }
    
    // Publish event using standard method
    return this.publishEvent(event, correlationId);
  }

  /**
   * Publish a log event including HTTP request information
   * @param logData Log data
   * @param req Express request
   * @returns Promise<boolean> Publication success
   */
  async publishLogEventWithRequest(
    logData: {
      level: string | LogLevel;
      message: string;
      timestamp?: Date;
      metadata?: any;
      correlationId?: string;
    },
    req: Request
  ): Promise<boolean> {
    const logEvent = new LogEventDto();
    logEvent.level = (typeof logData.level === 'string') ? logData.level as LogLevel : logData.level;
    logEvent.message = logData.message;
    logEvent.timestamp = logData.timestamp || new Date();
    
    if (logData.metadata) {
      logEvent.metadata = logData.metadata;
    }
    
    const correlationId = logData.correlationId || 
                          this.generateCorrelationId();
    logEvent.correlationId = correlationId;
    
    logEvent.httpRequest = this.extractHttpRequestData(req);

    this.logger.debug(`Log event before publishing: ${JSON.stringify({
      service: logEvent.service,
      correlationId: logEvent.correlationId,
      timestamp: logEvent.timestamp,
      level: logEvent.level,
      message: logEvent.message,
      metadata: logEvent.metadata,
      httpRequest: logEvent.httpRequest ? {
        method: logEvent.httpRequest.method,
        path: logEvent.httpRequest.path,
        hasQuery: !!logEvent.httpRequest.query,
        hasParams: !!logEvent.httpRequest.params,
        hasBody: !!logEvent.httpRequest.body,
        hasHeaders: !!logEvent.httpRequest.headers
      } : 'null'
    }, null, 2)}`);

    try {
      await validateOrReject(logEvent);
      return this.publishEvent(logEvent, correlationId);
    } catch (validationErrors) {
      this.logger.error(`Log event validation failed: ${JSON.stringify(validationErrors)}`);
      return false;
    }
  }
}