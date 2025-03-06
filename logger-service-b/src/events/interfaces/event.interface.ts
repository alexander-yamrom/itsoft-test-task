export enum EventType {
  REQUEST = 'request',
  RESPONSE = 'response',
  ERROR = 'error',
  INFO = 'info',
  WARNING = 'warning',
  DEBUG = 'debug',
}

export interface IBaseEvent {
  timestamp?: string | Date;
  serviceId?: string;
  endpoint?: string;
  method?: string;
  correlationId?: string;
  headers?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface IRequestEvent extends IBaseEvent {
  eventType: EventType.REQUEST;
  requestBody?: Record<string, any>;
}

export interface IResponseEvent extends IBaseEvent {
  eventType: EventType.RESPONSE;
  statusCode?: number;
  executionTime?: number;
  responseBody?: Record<string, any>;
}

export interface IErrorEvent extends IBaseEvent {
  eventType: EventType.ERROR;
  statusCode?: number;
  message: string;
  name?: string;
  stack?: string;
  details?: Record<string, any>;
}

export type IEvent = IRequestEvent | IResponseEvent | IErrorEvent;

// Message pattern structure for RabbitMQ
export interface IRabbitMqMessage {
  pattern: string;
  data: IEvent;
}

// Log storage specific interface
export interface ILogEventStorage extends IBaseEvent {
  eventType: string;
  statusCode?: number;
  executionTime?: number;
  requestBody?: Record<string, any>;
  responseBody?: Record<string, any>;
  error?: {
    message?: string;
    name?: string;
    stack?: string;
    details?: Record<string, any>;
  };
}