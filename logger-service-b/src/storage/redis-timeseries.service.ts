import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisTimeSeriesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisTimeSeriesService.name);
  private redisClient: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    try {
      const host = this.configService.get<string>('REDIS_HOST', 'localhost');
      const port = this.configService.get<number>('REDIS_PORT', 6379);
      
      this.logger.log(`Connecting to Redis at ${host}:${port}`);
      
      this.redisClient = new Redis({
        host,
        port,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }
      });
      
      this.redisClient.on('error', (err) => {
        this.logger.error(`Redis error: ${err.message}`, err.stack);
      });
      
      this.logger.log('Successfully connected to Redis');
    } catch (error) {
      this.logger.error(`Failed to connect to Redis: ${error.message}`, error.stack);
    }
  }

  private async disconnect() {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.logger.log('Disconnected from Redis');
    }
  }

  /**
   * Store a log event in Redis TimeSeries
   * @param timestamp Timestamp of the event (milliseconds)
   * @param service Service name
   * @param level Log level
   * @param message Log message
   * @param correlationId Correlation ID
   * @param metadata Additional metadata
   */
  async storeLogEvent(
    timestamp: number,
    service: string,
    level: string,
    message: string,
    correlationId: string,
    metadata?: any
  ): Promise<void> {
    try {
      if (!this.redisClient) {
        this.logger.warn('Redis client not available');
        return;
      }
      
      // Create a time series key with pattern: logs:{service}:{level}
      const timeSeriesKey = `logs:${service}:${level}`;
      
      // Create the time series if it doesn't exist
      // Retention period: 30 days (in milliseconds)
      try {
        await this.redisClient.call(
          'TS.CREATE', 
          timeSeriesKey, 
          'RETENTION', 
          '2592000000', 
          'LABELS',
          'service', service,
          'level', level,
          'source', 'rabbitmq'
        );
      } catch (error) {
        // Ignore error if time series already exists
        if (!error.message.includes('already exists')) {
          this.logger.error(`Error creating time series: ${error.message}`);
        }
      }
      
      // Store the event with metadata as JSON string
      const metadataStr = metadata ? JSON.stringify(metadata) : '';
      
      await this.redisClient.call(
        'TS.ADD',
        timeSeriesKey,
        timestamp.toString(),
        '1',
        'LABELS',
        'message', message,
        'correlationId', correlationId,
        'metadata', metadataStr
      );
      
      this.logger.log(`Stored log event in Redis TimeSeries: ${timeSeriesKey}`);
    } catch (error) {
      this.logger.error(`Error storing log event: ${error.message}`, error.stack);
    }
  }

  /**
   * Query log events for a specific day
   * @param date Date to query (YYYY-MM-DD)
   * @param service Optional service filter
   * @param level Optional level filter
   * @returns Array of log events
   */
  async queryLogsByDay(date: string, service?: string, level?: string): Promise<any[]> {
    try {
      if (!this.redisClient) {
        this.logger.warn('Redis client not available');
        return [];
      }
      
      // Parse the date and get start/end timestamps for the day
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      const startTs = startDate.getTime();
      const endTs = endDate.getTime();
      
      return this.queryLogsByTimeRange(startTs, endTs, service, level);
    } catch (error) {
      this.logger.error(`Error querying logs by day: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Query log events for a date range
   * @param startDate Start date (YYYY-MM-DD)
   * @param endDate End date (YYYY-MM-DD)
   * @param service Optional service filter
   * @param level Optional level filter
   * @returns Array of log events
   */
  async queryLogsByDateRange(startDate: string, endDate: string, service?: string, level?: string): Promise<any[]> {
    try {
      if (!this.redisClient) {
        this.logger.warn('Redis client not available');
        return [];
      }
      
      // Parse dates and get timestamps
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      const startTs = start.getTime();
      const endTs = end.getTime();
      
      return this.queryLogsByTimeRange(startTs, endTs, service, level);
    } catch (error) {
      this.logger.error(`Error querying logs by date range: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Query log events by time range
   * @param startTs Start timestamp (milliseconds)
   * @param endTs End timestamp (milliseconds)
   * @param service Optional service filter
   * @param level Optional level filter
   * @returns Array of log events
   */
  private async queryLogsByTimeRange(startTs: number, endTs: number, service?: string, level?: string): Promise<any[]> {
    try {
      // Build filter string
      let filterStr = 'service=';
      
      if (service) {
        filterStr += service;
      } else {
        filterStr += '*';
      }
      
      if (level) {
        filterStr += ` level=${level}`;
      }
      
      // Query time series data
      const result = await this.redisClient.call(
        'TS.MRANGE',
        startTs.toString(),
        endTs.toString(),
        'FILTER',
        filterStr
      ) as any[];
      
      if (!result || !Array.isArray(result)) {
        return [];
      }
      
      // Process and format the results
      return result.flatMap(series => {
        const keyParts = series[0].split(':');
        const seriesService = keyParts[1];
        const seriesLevel = keyParts[2];
        
        return series[2].map((dataPoint: any[]) => {
          const timestamp = parseInt(dataPoint[0]);
          const value = dataPoint[1];
          
          // Extract labels
          const labels: Record<string, string> = {};
          for (let i = 0; i < series[1].length; i += 2) {
            labels[series[1][i]] = series[1][i + 1];
          }
          
          // Parse metadata if available
          let metadata = {};
          if (labels.metadata) {
            try {
              metadata = JSON.parse(labels.metadata);
            } catch (e) {
              // Ignore parsing errors
            }
          }
          
          return {
            timestamp: new Date(timestamp).toISOString(),
            service: seriesService,
            level: seriesLevel,
            message: labels.message || '',
            correlationId: labels.correlationId || '',
            metadata
          };
        });
      });
    } catch (error) {
      this.logger.error(`Error querying logs by time range: ${error.message}`, error.stack);
      return [];
    }
  }
} 