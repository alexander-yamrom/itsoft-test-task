import { Logger } from '@nestjs/common';
import { 
  IEvent, 
  IBaseEvent, 
  IRequestEvent, 
  IResponseEvent, 
  IErrorEvent,
  EventType 
} from '../interfaces/event.interface';

export class EventUtils {
  private static readonly logger = new Logger(EventUtils.name);

  /**
   * Validate an event to ensure it has required fields
   * @param event The event to validate
   * @returns Whether the event is valid
   */
  static validateEvent(event: any): boolean {
    if (!event) {
      this.logger.error('Event is null or undefined');
      return false;
    }

    // Check for basic event structure
    if (typeof event !== 'object') {
      this.logger.error(`Event is not an object: ${typeof event}`);
      return false;
    }

    // Check for required fields based on event type
    if (!event.eventType) {
      this.logger.error('Event has no eventType');
      return false;
    }

    switch (event.eventType) {
      case EventType.ERROR:
        if (!event.message) {
          this.logger.error('Error event has no message field');
          return false;
        }
        break;
      case EventType.REQUEST:
      case EventType.RESPONSE:
        if (!event.endpoint) {
          this.logger.warn('Event has no endpoint field');
          // We'll still process it though
        }
        break;
    }

    return true;
  }

  /**
   * Sanitize an event by removing sensitive information
   * @param event The event to sanitize
   * @returns The sanitized event
   */
  static sanitizeEvent(event: IEvent): IEvent {
    try {
      const sanitized = { ...event };
      
      // Remove sensitive header information
      if (sanitized.headers) {
        const headers = { ...sanitized.headers };
        
        // Remove authentication tokens
        if (headers.authorization) {
          headers.authorization = '[REDACTED]';
        }
        
        // Remove cookies
        if (headers.cookie) {
          headers.cookie = '[REDACTED]';
        }
        
        sanitized.headers = headers;
      }
      
      // Handle specific event types
      if (sanitized.eventType === EventType.REQUEST && 'requestBody' in sanitized) {
        const requestEvent = sanitized as IRequestEvent;
        
        // Check for sensitive fields in request body
        if (requestEvent.requestBody) {
          const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'credit_card'];
          const body = { ...requestEvent.requestBody };
          
          sensitiveFields.forEach(field => {
            this.redactSensitiveField(body, field);
          });
          
          requestEvent.requestBody = body;
        }
      }
      
      return sanitized;
    } catch (error) {
      this.logger.error(`Error sanitizing event: ${error.message}`, error.stack);
      return event; // Return original if sanitization fails
    }
  }

  /**
   * Recursively redact sensitive fields in an object
   * @param obj The object to scan
   * @param sensitiveField The field name to redact
   */
  private static redactSensitiveField(obj: Record<string, any>, sensitiveField: string): void {
    for (const key in obj) {
      if (key.toLowerCase().includes(sensitiveField.toLowerCase()) && typeof obj[key] === 'string') {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.redactSensitiveField(obj[key], sensitiveField);
      }
    }
  }

  /**
   * Enrich an event with additional information
   * @param event The event to enrich
   * @returns The enriched event
   */
  static enrichEvent(event: IEvent): IEvent {
    try {
      const enriched = { ...event };
      
      // Add timestamp if missing
      if (!enriched.timestamp) {
        enriched.timestamp = new Date();
      }
      
      // Add correlation ID if missing
      if (!enriched.correlationId) {
        if (enriched.headers && enriched.headers['x-correlation-id']) {
          enriched.correlationId = enriched.headers['x-correlation-id'];
        } else if (enriched.headers && enriched.headers['x-request-id']) {
          enriched.correlationId = enriched.headers['x-request-id'];
        }
      }
      
      // Add service ID if missing
      if (!enriched.serviceId) {
        enriched.serviceId = 'service-a';
      }
      
      // Add metadata if missing
      if (!enriched.metadata) {
        enriched.metadata = {};
      }
      
      // Add timestamp to metadata
      enriched.metadata.processedAt = new Date();
      
      return enriched;
    } catch (error) {
      this.logger.error(`Error enriching event: ${error.message}`, error.stack);
      return event; // Return original if enrichment fails
    }
  }

  /**
   * Create a normalized event from any event data
   * @param eventData Raw event data
   * @param eventType The type of event
   * @returns Normalized event object
   */
  static normalizeEvent(eventData: any, eventType: string): IEvent {
    try {
      const baseEvent: IBaseEvent = {
        timestamp: eventData.timestamp ? new Date(eventData.timestamp) : new Date(),
        serviceId: eventData.serviceId || 'unknown',
        endpoint: eventData.endpoint || '',
        method: eventData.method || '',
        correlationId: eventData.correlationId || '',
        headers: eventData.headers || {},
        metadata: eventData.metadata || {},
      };
      
      switch (eventType) {
        case EventType.REQUEST:
          return {
            ...baseEvent,
            eventType: EventType.REQUEST,
            requestBody: eventData.request || eventData.requestBody || {},
          };
          
        case EventType.RESPONSE:
          return {
            ...baseEvent,
            eventType: EventType.RESPONSE,
            statusCode: eventData.statusCode || 200,
            executionTime: eventData.executionTime || 0,
            responseBody: eventData.response || eventData.responseBody || {},
          };
          
        case EventType.ERROR:
          return {
            ...baseEvent,
            eventType: EventType.ERROR,
            statusCode: eventData.statusCode || 500,
            message: eventData.message || 'Unknown error',
            name: eventData.name || 'Error',
            stack: eventData.stack,
            details: eventData.details || eventData.error || {},
          };
          
        default:
          // Handle unknown event types as info
          return {
            ...baseEvent,
            eventType: EventType.INFO,
            ...eventData,
          } as any;
      }
    } catch (error) {
      this.logger.error(`Error normalizing event: ${error.message}`, error.stack);
      
      // Create a minimal valid event
      return {
        timestamp: new Date(),
        eventType: EventType.ERROR,
        serviceId: 'event-processor',
        endpoint: '/events',
        message: `Error processing event: ${error.message}`,
        details: { originalEvent: eventData },
      } as IErrorEvent;
    }
  }

  /**
   * Format event data for logging or display
   * @param event The event to format
   * @param includeBody Whether to include request/response bodies
   * @returns Formatted event data
   */
  static formatEventForDisplay(event: IEvent, includeBody: boolean = false): Record<string, any> {
    try {
      const formatted: Record<string, any> = {
        id: (event as any).id || 'unknown',
        timestamp: event.timestamp,
        type: event.eventType,
        service: event.serviceId,
        endpoint: event.endpoint,
        method: event.method,
        correlationId: event.correlationId,
      };
      
      // Add type-specific fields
      if (event.eventType === EventType.RESPONSE && 'statusCode' in event) {
        formatted.statusCode = event.statusCode;
        formatted.executionTime = `${event.executionTime}ms`;
        
        if (includeBody && 'responseBody' in event) {
          formatted.responseBody = event.responseBody;
        }
      } else if (event.eventType === EventType.REQUEST) {
        if (includeBody && 'requestBody' in event) {
          formatted.requestBody = event.requestBody;
        }
      } else if (event.eventType === EventType.ERROR && 'message' in event) {
        formatted.statusCode = event.statusCode;
        formatted.error = {
          message: event.message,
          name: event.name,
        };
        
        if (includeBody) {
          formatted.details = event.details;
        }
      }
      
      return formatted;
    } catch (error) {
      this.logger.error(`Error formatting event: ${error.message}`, error.stack);
      return { error: 'Error formatting event data', originalEvent: event };
    }
  }

  /**
   * Extract correlation chain from an event
   * @param event The event to process
   * @returns Object with correlation information
   */
  static extractCorrelationInfo(event: IEvent): Record<string, any> {
    const correlationInfo: Record<string, any> = {};
    
    // Extract correlation ID
    if (event.correlationId) {
      correlationInfo.correlationId = event.correlationId;
    } else if (event.headers && event.headers['x-correlation-id']) {
      correlationInfo.correlationId = event.headers['x-correlation-id'];
    } else if (event.headers && event.headers['x-request-id']) {
      correlationInfo.correlationId = event.headers['x-request-id'];
    }
    
    // Extract trace ID if present
    if (event.headers && event.headers['x-trace-id']) {
      correlationInfo.traceId = event.headers['x-trace-id'];
    }
    
    // Extract span ID if present
    if (event.headers && event.headers['x-span-id']) {
      correlationInfo.spanId = event.headers['x-span-id'];
    }
    
    // Extract parent span ID if present
    if (event.headers && event.headers['x-parent-span-id']) {
      correlationInfo.parentSpanId = event.headers['x-parent-span-id'];
    }
    
    return correlationInfo;
  }

  /**
   * Get event severity level based on event type and content
   * @param event The event to analyze
   * @returns Severity level (debug, info, warn, error, critical)
   */
  static getEventSeverity(event: IEvent): 'debug' | 'info' | 'warn' | 'error' | 'critical' {
    // Default severities by event type
    const defaultSeverities = {
      [EventType.REQUEST]: 'debug',
      [EventType.RESPONSE]: 'debug',
      [EventType.ERROR]: 'error',
      [EventType.INFO]: 'info',
      [EventType.WARNING]: 'warn',
      [EventType.DEBUG]: 'debug',
    };
    
    // Start with default severity based on event type
    let severity = defaultSeverities[event.eventType] || 'info';
    
    // Escalate severity based on status code for response events
    if (event.eventType === EventType.RESPONSE && 'statusCode' in event) {
      const statusCode = event.statusCode;
      
      if (statusCode >= 400 && statusCode < 500) {
        severity = 'warn'; // Client errors
      } else if (statusCode >= 500) {
        severity = 'error'; // Server errors
      }
    }
    
    // Error events might be critical based on content
    if (event.eventType === EventType.ERROR && 'message' in event) {
      const criticalErrorPatterns = [
        'database connection',
        'out of memory',
        'connection refused',
        'critical',
        'fatal',
        'security breach',
        'unauthorized access',
      ];
      
      const message = event.message.toLowerCase();
      const isCritical = criticalErrorPatterns.some(pattern => message.includes(pattern));
      
      if (isCritical) {
        severity = 'critical';
      }
    }
    
    return severity as 'debug' | 'info' | 'warn' | 'error' | 'critical';
  }

  /**
   * Create a truncated version of an event with limited data
   * @param event The event to truncate
   * @param maxBodyLength Maximum length for bodies
   * @returns Truncated event
   */
  static truncateEventData(event: IEvent, maxBodyLength: number = 1000): IEvent {
    const truncated = { ...event };
    
    // Truncate request body if present
    if (truncated.eventType === EventType.REQUEST && 'requestBody' in truncated) {
      const requestEvent = truncated as IRequestEvent;
      if (requestEvent.requestBody && typeof requestEvent.requestBody === 'object') {
        requestEvent.requestBody = this.truncateObject(requestEvent.requestBody, maxBodyLength);
      }
    }
    
    // Truncate response body if present
    if (truncated.eventType === EventType.RESPONSE && 'responseBody' in truncated) {
      const responseEvent = truncated as IResponseEvent;
      if (responseEvent.responseBody && typeof responseEvent.responseBody === 'object') {
        responseEvent.responseBody = this.truncateObject(responseEvent.responseBody, maxBodyLength);
      }
    }
    
    // Truncate error details if present
    if (truncated.eventType === EventType.ERROR && 'details' in truncated) {
      const errorEvent = truncated as IErrorEvent;
      if (errorEvent.details && typeof errorEvent.details === 'object') {
        errorEvent.details = this.truncateObject(errorEvent.details, maxBodyLength);
      }
      
      // Truncate stack trace
      if (errorEvent.stack && errorEvent.stack.length > maxBodyLength) {
        errorEvent.stack = errorEvent.stack.substring(0, maxBodyLength) + '...';
      }
    }
    
    return truncated;
  }

  /**
   * Recursively truncate object values
   * @param obj The object to truncate
   * @param maxLength Maximum string length
   * @returns Truncated object
   */
  private static truncateObject(obj: Record<string, any>, maxLength: number): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const key in obj) {
      if (typeof obj[key] === 'string' && obj[key].length > maxLength) {
        result[key] = obj[key].substring(0, maxLength) + '...';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (Array.isArray(obj[key])) {
          if (obj[key].length > 10) {
            result[key] = [...obj[key].slice(0, 10), `...and ${obj[key].length - 10} more items`];
          } else {
            result[key] = obj[key].map((item: any) => 
              typeof item === 'object' ? this.truncateObject(item, maxLength) : item
            );
          }
        } else {
          result[key] = this.truncateObject(obj[key], maxLength);
        }
      } else {
        result[key] = obj[key];
      }
    }
    
    return result;
  }
}