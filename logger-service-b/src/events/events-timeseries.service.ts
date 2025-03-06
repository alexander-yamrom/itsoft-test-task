import { Injectable, Logger } from '@nestjs/common';
import { RedisTimeSeriesService } from '@libs/database/redis/redis-timeseries.service';
import { EventType, IEvent } from './interfaces/event.interface';
import { EventUtils } from './utils/event-utils';

/**
 * TimeSeries key prefixes for different metrics
 */
export const TS_KEYS = {
  // Count of events by type
  EVENT_COUNT_PREFIX: 'events:count:',
  // Response time metrics
  RESPONSE_TIME_PREFIX: 'events:response_time:',
  // Error rate metrics
  ERROR_RATE_PREFIX: 'events:error_rate:',
  // Status code distribution
  STATUS_CODE_PREFIX: 'events:status_code:',
  // Request volume by endpoint
  ENDPOINT_VOLUME_PREFIX: 'events:endpoint:',
};

/**
 * Retention periods for different metrics (in milliseconds)
 */
export const RETENTION_PERIODS = {
  HOURLY: 1000 * 60 * 60 * 24 * 7,     // 7 days for hourly data
  DAILY: 1000 * 60 * 60 * 24 * 90,     // 90 days for daily data
  MONTHLY: 1000 * 60 * 60 * 24 * 365,  // 1 year for monthly data
};

@Injectable()
export class EventsTimeSeriesService {
  private readonly logger = new Logger(EventsTimeSeriesService.name);
  private isInitialized = false;

  constructor(private redisTimeSeriesService: RedisTimeSeriesService) {
    this.initialize();
  }

  /**
   * Initialize the time series keys and structure
   */
  private async initialize() {
    try {
      // Create time series for event counts by type
      await this.createEventCountTimeSeries();
      
      // Create time series for response times
      await this.createResponseTimeTimeSeries();
      
      // Create time series for error rates
      await this.createErrorRateTimeSeries();
      
      this.isInitialized = true;
      this.logger.log('Initialized Redis TimeSeries for events');
    } catch (error) {
      this.logger.error(`Failed to initialize Redis TimeSeries: ${error.message}`, error.stack);
    }
  }

  /**
   * Create time series for counting events by type
   */
  private async createEventCountTimeSeries() {
    const eventTypes = Object.values(EventType);
    
    for (const eventType of eventTypes) {
      const key = `${TS_KEYS.EVENT_COUNT_PREFIX}${eventType}`;
      await this.redisTimeSeriesService.createTimeSeries(
        key,
        { event_type: eventType, metric: 'count' },
        RETENTION_PERIODS.MONTHLY
      );
    }
    
    // Create total events counter
    await this.redisTimeSeriesService.createTimeSeries(
      `${TS_KEYS.EVENT_COUNT_PREFIX}total`,
      { event_type: 'total', metric: 'count' },
      RETENTION_PERIODS.MONTHLY
    );
  }

  /**
   * Create time series for tracking response times
   */
  private async createResponseTimeTimeSeries() {
    await this.redisTimeSeriesService.createTimeSeries(
      `${TS_KEYS.RESPONSE_TIME_PREFIX}avg`,
      { metric: 'response_time', aggregation: 'avg' },
      RETENTION_PERIODS.MONTHLY
    );
    
    await this.redisTimeSeriesService.createTimeSeries(
      `${TS_KEYS.RESPONSE_TIME_PREFIX}max`,
      { metric: 'response_time', aggregation: 'max' },
      RETENTION_PERIODS.MONTHLY
    );
    
    await this.redisTimeSeriesService.createTimeSeries(
      `${TS_KEYS.RESPONSE_TIME_PREFIX}min`,
      { metric: 'response_time', aggregation: 'min' },
      RETENTION_PERIODS.MONTHLY
    );
  }

  /**
   * Create time series for tracking error rates
   */
  private async createErrorRateTimeSeries() {
    await this.redisTimeSeriesService.createTimeSeries(
      `${TS_KEYS.ERROR_RATE_PREFIX}total`,
      { metric: 'error_rate', type: 'total' },
      RETENTION_PERIODS.MONTHLY
    );
    
    // Status code series (for 4xx and 5xx)
    for (let statusCode = 400; statusCode < 600; statusCode += 100) {
      await this.redisTimeSeriesService.createTimeSeries(
        `${TS_KEYS.STATUS_CODE_PREFIX}${statusCode}`,
        { metric: 'status_code', code: statusCode.toString() },
        RETENTION_PERIODS.MONTHLY
      );
    }
  }

  /**
   * Record event metrics in Redis TimeSeries
   * @param event The event to record metrics for
   */
  async recordEventMetrics(event: IEvent): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const timestamp = event.timestamp instanceof Date
        ? event.timestamp.getTime()
        : new Date(event.timestamp).getTime();
      
      // Record event count by type
      await this.redisTimeSeriesService.addDataPoint(
        `${TS_KEYS.EVENT_COUNT_PREFIX}${event.eventType}`,
        1,
        timestamp
      );
      
      // Record in total events
      await this.redisTimeSeriesService.addDataPoint(
        `${TS_KEYS.EVENT_COUNT_PREFIX}total`,
        1,
        timestamp
      );
      
      // Record endpoint-specific metrics
      if (event.endpoint) {
        const sanitizedEndpoint = this.sanitizeEndpointForKey(event.endpoint);
        const endpointKey = `${TS_KEYS.ENDPOINT_VOLUME_PREFIX}${sanitizedEndpoint}`;
        
        // Create endpoint-specific time series if it doesn't exist
        await this.redisTimeSeriesService.createTimeSeries(
          endpointKey,
          {
            metric: 'endpoint_volume',
            endpoint: sanitizedEndpoint,
            method: event.method || 'unknown'
          },
          RETENTION_PERIODS.MONTHLY
        );
        
        // Record the event
        await this.redisTimeSeriesService.addDataPoint(endpointKey, 1, timestamp);
      }
      
      // Record response-specific metrics
      if (event.eventType === EventType.RESPONSE && 'statusCode' in event && 'executionTime' in event) {
        // Record response time
        await this.redisTimeSeriesService.addDataPoint(
          `${TS_KEYS.RESPONSE_TIME_PREFIX}avg`,
          event.executionTime,
          timestamp
        );
        
        // Record max response time (we'll use the same value, and aggregation will find max)
        await this.redisTimeSeriesService.addDataPoint(
          `${TS_KEYS.RESPONSE_TIME_PREFIX}max`,
          event.executionTime,
          timestamp
        );
        
        // Record min response time (same approach)
        await this.redisTimeSeriesService.addDataPoint(
          `${TS_KEYS.RESPONSE_TIME_PREFIX}min`,
          event.executionTime,
          timestamp
        );
        
        // Record status code counts
        const statusCodeBucket = Math.floor(event.statusCode / 100) * 100;
        if (statusCodeBucket >= 400 && statusCodeBucket < 600) {
          await this.redisTimeSeriesService.addDataPoint(
            `${TS_KEYS.STATUS_CODE_PREFIX}${statusCodeBucket}`,
            1,
            timestamp
          );
          
          // Also record in error rate for 4xx and 5xx status codes
          await this.redisTimeSeriesService.addDataPoint(
            `${TS_KEYS.ERROR_RATE_PREFIX}total`,
            1,
            timestamp
          );
        }
      }
      
      // Record error-specific metrics
      if (event.eventType === EventType.ERROR) {
        await this.redisTimeSeriesService.addDataPoint(
          `${TS_KEYS.ERROR_RATE_PREFIX}total`,
          1,
          timestamp
        );
      }
    } catch (error) {
      this.logger.error(`Failed to record event metrics: ${error.message}`, error.stack);
    }
  }

  /**
   * Get event count metrics for a specific time range
   * @param eventType Type of event to get counts for, or 'total'
   * @param fromTimestamp Start of time range
   * @param toTimestamp End of time range
   * @param aggregation Optional aggregation settings
   */
  async getEventCounts(
    eventType: string | 'total' = 'total',
    fromTimestamp: number,
    toTimestamp: number,
    aggregation?: { type: 'avg' | 'sum' | 'min' | 'max' | 'count', bucketSizeMs: number }
  ): Promise<[number, number][]> {
    try {
      const key = `${TS_KEYS.EVENT_COUNT_PREFIX}${eventType}`;
      
      return await this.redisTimeSeriesService.queryRange(
        key,
        fromTimestamp,
        toTimestamp,
        undefined,
        aggregation
      );
    } catch (error) {
      this.logger.error(`Failed to get event counts: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get response time metrics for a specific time range
   * @param metricType Type of metric: 'avg', 'min', or 'max'
   * @param fromTimestamp Start of time range
   * @param toTimestamp End of time range
   * @param aggregation Optional aggregation settings
   */
  async getResponseTimeMetrics(
    metricType: 'avg' | 'min' | 'max' = 'avg',
    fromTimestamp: number,
    toTimestamp: number,
    aggregation?: { type: 'avg' | 'sum' | 'min' | 'max' | 'count', bucketSizeMs: number }
  ): Promise<[number, number][]> {
    try {
      const key = `${TS_KEYS.RESPONSE_TIME_PREFIX}${metricType}`;
      
      return await this.redisTimeSeriesService.queryRange(
        key,
        fromTimestamp,
        toTimestamp,
        undefined,
        aggregation
      );
    } catch (error) {
      this.logger.error(`Failed to get response time metrics: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get error rate metrics for a specific time range
   * @param fromTimestamp Start of time range
   * @param toTimestamp End of time range
   * @param aggregation Optional aggregation settings
   */
  async getErrorRateMetrics(
    fromTimestamp: number,
    toTimestamp: number,
    aggregation?: { type: 'avg' | 'sum' | 'min' | 'max' | 'count', bucketSizeMs: number }
  ): Promise<[number, number][]> {
    try {
      return await this.redisTimeSeriesService.queryRange(
        `${TS_KEYS.ERROR_RATE_PREFIX}total`,
        fromTimestamp,
        toTimestamp,
        undefined,
        aggregation
      );
    } catch (error) {
      this.logger.error(`Failed to get error rate metrics: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get status code distribution for a specific time range
   * @param fromTimestamp Start of time range
   * @param toTimestamp End of time range
   * @param aggregation Optional aggregation settings
   */
  async getStatusCodeDistribution(
    fromTimestamp: number,
    toTimestamp: number,
    aggregation?: { type: 'sum', bucketSizeMs: number }
  ): Promise<Record<string, number>> {
    try {
      const statusCodes = [400, 500];
      const result: Record<string, number> = {};
      
      for (const statusCode of statusCodes) {
        const key = `${TS_KEYS.STATUS_CODE_PREFIX}${statusCode}`;
        
        const data = await this.redisTimeSeriesService.queryRange(
          key,
          fromTimestamp,
          toTimestamp,
          undefined,
          aggregation || { type: 'sum', bucketSizeMs: toTimestamp - fromTimestamp }
        );
        
        // Sum up the values
        const total = data.reduce((sum, [_, value]) => sum + value, 0);
        result[statusCode.toString()] = total;
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to get status code distribution: ${error.message}`, error.stack);
      return {};
    }
  }

  /**
   * Get endpoint volume metrics for a specific time range
   * @param endpoint The endpoint to get metrics for, or undefined for all endpoints
   * @param fromTimestamp Start of time range
   * @param toTimestamp End of time range
   * @param aggregation Optional aggregation settings
   */
  async getEndpointVolumeMetrics(
    endpoint: string | undefined,
    fromTimestamp: number,
    toTimestamp: number,
    aggregation?: { type: 'sum', bucketSizeMs: number }
  ): Promise<Record<string, number>> {
    try {
      // If specific endpoint is requested
      if (endpoint) {
        const sanitizedEndpoint = this.sanitizeEndpointForKey(endpoint);
        const key = `${TS_KEYS.ENDPOINT_VOLUME_PREFIX}${sanitizedEndpoint}`;
        
        const data = await this.redisTimeSeriesService.queryRange(
          key,
          fromTimestamp,
          toTimestamp,
          undefined,
          aggregation || { type: 'sum', bucketSizeMs: toTimestamp - fromTimestamp }
        );
        
        // Sum up the values
        const total = data.reduce((sum, [_, value]) => sum + value, 0);
        return { [endpoint]: total };
      }
      
      // If all endpoints are requested, we need to use Redis keys pattern
      const client = this.redisTimeSeriesService.getClient();
      const keys = await client.keys(`${TS_KEYS.ENDPOINT_VOLUME_PREFIX}*`);
      
      const result: Record<string, number> = {};
      
      for (const key of keys) {
        const endpointName = key.replace(TS_KEYS.ENDPOINT_VOLUME_PREFIX, '');
        
        const data = await this.redisTimeSeriesService.queryRange(
          key,
          fromTimestamp,
          toTimestamp,
          undefined,
          aggregation || { type: 'sum', bucketSizeMs: toTimestamp - fromTimestamp }
        );
        
        // Sum up the values
        const total = data.reduce((sum, [_, value]) => sum + value, 0);
        result[endpointName] = total;
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to get endpoint volume metrics: ${error.message}`, error.stack);
      return {};
    }
  }

  /**
   * Sanitize endpoint path for use in Redis key
   * Replace characters that would be problematic in Redis keys
   */
  private sanitizeEndpointForKey(endpoint: string): string {
    // Remove query parameters
    let sanitized = endpoint.split('?')[0];
    
    // Replace dynamic parts (like IDs) with placeholders
    sanitized = sanitized.replace(/\/[0-9a-f]{24}\b/g, '/:id'); // MongoDB ObjectId
    sanitized = sanitized.replace(/\/\d+\b/g, '/:id'); // Numeric IDs
    sanitized = sanitized.replace(/\/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/g, '/:uuid'); // UUID
    
    // Replace characters not allowed in Redis keys
    sanitized = sanitized.replace(/[^a-zA-Z0-9_:.-]/g, '_');
    
    return sanitized;
  }
}