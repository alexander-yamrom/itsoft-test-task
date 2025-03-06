export interface HealthStatus {
  status: 'up' | 'down';
  details: {
    rabbitmq: {
      status: 'up' | 'down';
      connection: boolean;
      exchange: boolean;
      queue: boolean;
      deadLetterQueue: boolean;
    };
    processing: {
      status: 'up' | 'down';
      messageCount: number;
      consumerCount: number;
      deadLetterCount: number;
      lastProcessedEvent?: Date;
    };
  };
  timestamp: Date;
}