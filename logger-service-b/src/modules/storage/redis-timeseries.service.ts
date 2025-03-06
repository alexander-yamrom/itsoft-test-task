import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { LogEvent } from '../../interfaces/log-event.interface';

@Injectable()
export class RedisTimeSeriesService {
  private readonly logger = new Logger(RedisTimeSeriesService.name);
  private client: any;
  private isConnected = false;

  constructor(private configService: ConfigService) {
    this.initializeClient();
  }

  private async initializeClient() {
    try {
      const host = this.configService.get<string>('REDIS_HOST', 'localhost');
      const port = this.configService.get<number>('REDIS_PORT', 6379);
      
      this.logger.log(`Connecting to Redis at ${host}:${port}`);
      
      this.client = createClient({
        url: `redis://${host}:${port}`
      });

      this.client.on('error', (err) => {
        this.logger.error(`Redis Client Error: ${err.message}`);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.logger.log('Connected to Redis');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to Redis: ${error.message}`);
      this.isConnected = false;
    }
  }

  async storeLogEvent(logEvent: LogEvent): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn('Redis client is not connected. Attempting to reconnect...');
      await this.initializeClient();
      if (!this.isConnected) {
        this.logger.error('Failed to reconnect to Redis. Cannot store log event.');
        return false;
      }
    }

    try {
      const timestamp = new Date(logEvent.timestamp).getTime();
      const eventId = logEvent.correlationId || `event-${timestamp}-${Math.random().toString(36).substring(2, 10)}`;
      const key = `logs:${logEvent.service}:${logEvent.level}`;
      
      // Store the log event data in Redis
      const dataKey = `logdata:${timestamp}:${eventId}`;
      await this.client.set(dataKey, JSON.stringify(logEvent), {
        EX: 60 * 60 * 24 * 30 // Expire after 30 days
      });
      
      // Store a simple index by date for faster retrieval
      const dateStr = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
      const indexKey = `logindex:${dateStr}`;
      await this.client.sAdd(indexKey, dataKey);
      
      // Set expiration for the index key as well
      await this.client.expire(indexKey, 60 * 60 * 24 * 30); // 30 days
      
      this.logger.debug(`Stored log event in Redis: ${eventId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to store log event in Redis: ${error.message}`);
      return false;
    }
  }

  async getLogsByDay(date: string): Promise<LogEvent[]> {
    if (!this.isConnected) {
      this.logger.warn('Redis client is not connected. Attempting to reconnect...');
      await this.initializeClient();
      if (!this.isConnected) {
        this.logger.error('Failed to reconnect to Redis. Cannot retrieve logs.');
        return [];
      }
    }

    try {
      // Get all log data keys for the specified date
      const indexKey = `logindex:${date}`;
      const dataKeys = await this.client.sMembers(indexKey);
      
      if (!dataKeys || dataKeys.length === 0) {
        this.logger.debug(`No log keys found for date: ${date}`);
        return [];
      }
      
      const logEvents: LogEvent[] = [];
      
      // For each data key, get the log event data
      for (const dataKey of dataKeys) {
        const logDataStr = await this.client.get(dataKey);
        if (logDataStr) {
          try {
            const logEvent = JSON.parse(logDataStr);
            logEvents.push(logEvent);
          } catch (e) {
            this.logger.error(`Failed to parse log data: ${e.message}`);
          }
        }
      }
      
      return logEvents;
    } catch (error) {
      this.logger.error(`Failed to retrieve logs by day: ${error.message}`);
      return [];
    }
  }

  async getLogsByType(type: string): Promise<LogEvent[]> {
    if (!this.isConnected) {
      this.logger.warn('Redis client is not connected. Attempting to reconnect...');
      await this.initializeClient();
      if (!this.isConnected) {
        this.logger.error('Failed to reconnect to Redis. Cannot retrieve logs.');
        return [];
      }
    }

    try {
      const logEvents: LogEvent[] = [];
      const dataKeys = await this.client.keys(`logdata:*`);
      if (!dataKeys || dataKeys.length === 0) {
        this.logger.debug(`No log keys found for type: ${type}`);
        return [];
      }

      for (const dataKey of dataKeys) {
        const logDataStr = await this.client.get(dataKey);
        if (logDataStr) {
          try {
            const logEvent = JSON.parse(logDataStr);
            if (logEvent.eventType === type) {
              logEvents.push(logEvent);
            }
          } catch (e) {
            this.logger.error(`Failed to parse log data: ${e.message}`);
          }
        }
      }
      
      return logEvents;
    } catch (error) {
      this.logger.error(`Failed to retrieve logs by type: ${error.message}`);
      return [];
    }
  }

  async getLogsByDateRange(startDate: string, endDate: string): Promise<LogEvent[]> {
    if (!this.isConnected) {
      this.logger.warn('Redis client is not connected. Attempting to reconnect...');
      await this.initializeClient();
      if (!this.isConnected) {
        this.logger.error('Failed to reconnect to Redis. Cannot retrieve logs.');
        return [];
      }
    }

    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const logEvents: LogEvent[] = [];
      
      // Iterate through each day in the range
      for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
        const dateStr = day.toISOString().split('T')[0]; // YYYY-MM-DD
        const logsForDay = await this.getLogsByDay(dateStr);
        logEvents.push(...logsForDay);
      }
      
      return logEvents;
    } catch (error) {
      this.logger.error(`Failed to retrieve logs by date range: ${error.message}`);
      return [];
    }
  }

  async onModuleDestroy() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.logger.log('Redis client disconnected');
    }
  }
} 