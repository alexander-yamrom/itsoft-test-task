import { Injectable, Logger } from '@nestjs/common';
import { EventUtils } from './utils/event-utils';
import { EventType } from './interfaces/event.interface';
import { RedisTimeSeriesService } from '../modules/storage/redis-timeseries.service';

export interface EventData {
  timestamp?: string | Date;
  serviceId?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  executionTime?: number;
  correlationId?: string;
  headers?: Record<string, any>;
  request?: Record<string, any>;
  response?: Record<string, any>;
  error?: Record<string, any>;
  metadata?: Record<string, any>;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly redisTimeSeriesService: RedisTimeSeriesService
  ) {}

  /**
   * Process an event and store it in Redis
   * @param eventData The event data
   * @param eventType The type of event (request, response, error, etc.)
   * @returns Success status
   */
  async processEvent(eventData: EventData, eventType: string): Promise<boolean> {
    try {
      // Validate event data
      if (!EventUtils.validateEvent({ ...eventData, eventType })) {
        this.logger.warn(`Invalid event data received: ${JSON.stringify(eventData)}`);
      }
      
      // Normalize and enrich the event
      const normalizedEvent = EventUtils.normalizeEvent(eventData, eventType);
      const enrichedEvent = EventUtils.enrichEvent(normalizedEvent);
      const sanitizedEvent = EventUtils.sanitizeEvent(enrichedEvent);
      
      // Create log entry
      const timestamp = new Date(sanitizedEvent.timestamp || Date.now()).getTime();
      const service = sanitizedEvent.serviceId || 'service-a';
      const level = eventType === EventType.ERROR ? 'error' : 'info';
      const message = this.getMessageFromEvent(sanitizedEvent, eventType);
      const correlationId = sanitizedEvent.correlationId || `event-${timestamp}-${Math.random().toString(36).substring(2, 10)}`;
      
      // Store in Redis
      const success = await this.redisTimeSeriesService.storeLogEvent({
        service,
        timestamp: new Date(timestamp).toISOString(),
        level,
        message,
        correlationId,
        metadata: sanitizedEvent
      });
      
      if (success) {
        this.logger.debug(`Stored event in Redis: ${correlationId}`);
      } else {
        this.logger.warn(`Failed to store event in Redis: ${correlationId}`);
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Error processing event: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Get a message description from the event
   */
  private getMessageFromEvent(event: any, eventType: string): string {
    if (eventType === EventType.REQUEST) {
      return `Received ${event.method} request to ${event.endpoint}`;
    } else if (eventType === EventType.RESPONSE) {
      return `Completed ${event.method} request to ${event.endpoint} with status ${event.statusCode}`;
    } else if (eventType === EventType.ERROR) {
      return `Error in ${event.method} request to ${event.endpoint}: ${event.message}`;
    } else {
      return `Event of type ${eventType}`;
    }
  }

  /**
   * Get statistics about stored events
   * @returns Statistics object
   */
  async getEventStats(): Promise<any> {
    try {
      // This would need to be implemented using Redis queries
      // For now, return a placeholder
      return {
        total: 0,
        requests: 0,
        responses: 0,
        errors: 0,
        lastDayCount: 0,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Error getting event stats: ${error.message}`, error.stack);
      throw error;
    }
  }
}