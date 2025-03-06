import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import * as fs from 'fs';
import * as path from 'path';

type MessageHandler = (msg: amqp.ConsumeMessage) => void;

@Injectable()
export class RabbitMQConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQConsumerService.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private readonly logFilePath: string;
  private messageHandlers: MessageHandler[] = [];

  constructor(private readonly configService: ConfigService) {
    this.logFilePath = path.join(process.cwd(), 'rabbitmq-messages.log');
    // Create or clear the log file
    fs.writeFileSync(this.logFilePath, '');
    this.logger.log(`RabbitMQ messages will be logged to: ${this.logFilePath}`);
  }

  async onModuleInit() {
    await this.connect();
    await this.setupConsumer();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Register a handler for incoming messages
   * @param handler Function to handle incoming messages
   */
  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
    this.logger.log('Message handler registered');
  }

  private async connect() {
    try {
      const url = this.configService.get<string>('rabbitmq.url');
      this.logger.log(`Connecting to RabbitMQ at ${url}`);
      this.logToFile(`Connecting to RabbitMQ at ${url}`);
      
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      
      this.logger.log('Successfully connected to RabbitMQ');
      this.logToFile('Successfully connected to RabbitMQ');
      
      this.connection.on('error', (err) => {
        this.logger.error(`RabbitMQ connection error: ${err.message}`, err.stack);
        this.logToFile(`RabbitMQ connection error: ${err.message}`);
        this.reconnect();
      });
      
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.logToFile('RabbitMQ connection closed');
        this.reconnect();
      });
    } catch (error) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error.message}`, error.stack);
      this.logToFile(`Failed to connect to RabbitMQ: ${error.message}`);
      this.reconnect();
    }
  }

  private reconnect() {
    setTimeout(() => {
      this.logger.log('Attempting to reconnect to RabbitMQ...');
      this.logToFile('Attempting to reconnect to RabbitMQ...');
      this.connect();
    }, 5000);
  }

  private async disconnect() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('Disconnected from RabbitMQ');
      this.logToFile('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error(`Error disconnecting from RabbitMQ: ${error.message}`, error.stack);
      this.logToFile(`Error disconnecting from RabbitMQ: ${error.message}`);
    }
  }

  private async setupConsumer() {
    try {
      const exchange = this.configService.get<string>('rabbitmq.exchange');
      const queue = this.configService.get<string>('rabbitmq.queue');
      const routingKeyPattern = this.configService.get<string>('rabbitmq.routingKeyPattern');
      
      // Ensure the exchange exists
      await this.channel.assertExchange(exchange, 'topic', { durable: true });
      
      // Create a dead letter exchange
      const deadLetterExchange = `${exchange}.dlx`;
      await this.channel.assertExchange(deadLetterExchange, 'topic', { durable: true });
      
      // Create a dead letter queue
      const deadLetterQueue = `${queue}.dead`;
      await this.channel.assertQueue(deadLetterQueue, { durable: true });
      
      // Bind the dead letter queue to the dead letter exchange
      await this.channel.bindQueue(deadLetterQueue, deadLetterExchange, '#');
      
      // Instead of creating the queue, just check if it exists and bind to it
      // This avoids the issue with trying to recreate a queue with different settings
      try {
        await this.channel.checkQueue(queue);
        this.logger.log(`Queue ${queue} already exists, using existing queue`);
        this.logToFile(`Queue ${queue} already exists, using existing queue`);
      } catch (error) {
        // Queue doesn't exist, create it with the same dead letter settings
        const queueOptions = {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': deadLetterExchange,
            'x-dead-letter-routing-key': `${routingKeyPattern}.dead`
          }
        };
        
        await this.channel.assertQueue(queue, queueOptions);
        this.logger.log(`Created queue ${queue} with dead letter settings`);
        this.logToFile(`Created queue ${queue} with dead letter settings`);
      }
      
      // Bind the queue to the exchange with the routing key pattern
      await this.channel.bindQueue(queue, exchange, routingKeyPattern);
      
      // Set prefetch to 1 to ensure we process one message at a time
      await this.channel.prefetch(1);
      
      this.logger.log(`Consuming messages from queue: ${queue}`);
      this.logToFile(`Consuming messages from queue: ${queue}`);
      
      // Start consuming messages
      await this.channel.consume(queue, (msg) => {
        if (msg) {
          try {
            const content = msg.content.toString();
            const routingKey = msg.fields.routingKey;
            
            this.logger.log(`Received message from Service A with routing key: ${routingKey}`);
            this.logger.log(`Message content: ${content}`);
            
            this.logToFile(`Received message from Service A with routing key: ${routingKey}`);
            this.logToFile(`Message content: ${content}`);
            
            // Parse the message content if it's JSON
            try {
              const parsedContent = JSON.parse(content);
              this.logger.log(`Parsed message: ${JSON.stringify(parsedContent, null, 2)}`);
              this.logToFile(`Parsed message: ${JSON.stringify(parsedContent, null, 2)}`);
            } catch (parseError) {
              this.logger.warn(`Could not parse message as JSON: ${parseError.message}`);
              this.logToFile(`Could not parse message as JSON: ${parseError.message}`);
            }
            
            // Notify all registered message handlers
            this.messageHandlers.forEach(handler => {
              try {
                handler(msg);
              } catch (handlerError) {
                this.logger.error(`Error in message handler: ${handlerError.message}`, handlerError.stack);
              }
            });
            
            // Acknowledge the message
            this.channel.ack(msg);
          } catch (error) {
            this.logger.error(`Error processing message: ${error.message}`, error.stack);
            this.logToFile(`Error processing message: ${error.message}`);
            // Negative acknowledge the message to requeue it
            this.channel.nack(msg, false, true);
          }
        }
      });
      
      this.logger.log('RabbitMQ consumer setup completed');
      this.logToFile('RabbitMQ consumer setup completed');
    } catch (error) {
      this.logger.error(`Error setting up RabbitMQ consumer: ${error.message}`, error.stack);
      this.logToFile(`Error setting up RabbitMQ consumer: ${error.message}`);
      this.reconnect();
    }
  }

  private logToFile(message: string) {
    try {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] ${message}\n`;
      fs.appendFileSync(this.logFilePath, logMessage);
    } catch (error) {
      this.logger.error(`Error writing to log file: ${error.message}`, error.stack);
    }
  }
} 