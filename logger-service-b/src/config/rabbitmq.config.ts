import { registerAs } from '@nestjs/config';

export default registerAs('rabbitmq', () => ({
  url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  exchange: process.env.RABBITMQ_EXCHANGE || 'service-a.events',
  queue: process.env.RABBITMQ_QUEUE || 'service-b.logging.queue',
  routingKeyPattern: process.env.RABBITMQ_ROUTING_KEY_PATTERN || 'log.*',
}));
