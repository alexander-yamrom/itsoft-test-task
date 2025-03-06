export interface LogEvent {
  service: string;
  timestamp: string;
  level: string;
  message: string;
  correlationId: string;
  metadata?: Record<string, any>;
  eventId?: string;
  eventType?: string;
  serviceId?: string;
} 