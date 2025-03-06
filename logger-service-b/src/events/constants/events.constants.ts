export const RABBITMQ_EXCHANGE = 'service-a.events';
export const RABBITMQ_QUEUE = 'service-b.logging.queue';
export const RABBITMQ_ROUTING_KEY_PATTERN = 'log.*';
export const RABBITMQ_DEAD_LETTER_EXCHANGE = 'service-b.logging.dlx';
export const RABBITMQ_DEAD_LETTER_QUEUE = 'service-b.logging.dlq';

export const EVENT_TYPES = {
  REQUEST: 'request',
  RESPONSE: 'response',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning',
  DEBUG: 'debug',
};

export const EVENT_RETENTION_DAYS = {
  DEFAULT: 30,  // Most logs kept for 30 days
  ERROR: 90,    // Error logs kept for 90 days
  CRITICAL: 365, // Critical logs kept for 1 year
};

export const EVENT_PROCESSING = {
  MAX_RETRY_COUNT: 3,
  RETRY_DELAY_MS: 1000, // 1 second
  PREFETCH_COUNT: 10,   // RabbitMQ prefetch setting
  BATCH_SIZE: 100,      // For batch processing if needed
};

export const EVENT_HEALTH_CHECK = {
  EXCHANGE_CHECK_INTERVAL_MS: 60000, // 1 minute
  QUEUE_CHECK_INTERVAL_MS: 30000,    // 30 seconds
  CONNECTION_CHECK_INTERVAL_MS: 15000, // 15 seconds
};