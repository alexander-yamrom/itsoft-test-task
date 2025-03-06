# Logger Service B

A service that consumes events from RabbitMQ and stores them in Redis TimeSeries.

## Features

- Consumes events from RabbitMQ
- Stores logs in Redis TimeSeries
- Provides REST API for querying logs by date and date range
- Health check endpoint

## Running the Service

### With Docker Compose (Standalone)

1. Copy `.env.example` to `.env` and adjust values if needed:
   ```bash
   cp .env.example .env
   ```

2. Start the service with Docker Compose:
   ```bash
   docker-compose up -d
   ```

   This will start:
   - Logger Service B on port 3001
   - Redis (RedisTimeSeries) on port 6380 (to avoid conflicts with Service A's Redis)
   - RabbitMQ on port 5673 (to avoid conflicts with Service A's RabbitMQ)
   - RabbitMQ management UI on port 15673
   - RabbitMQ setup service to create necessary exchanges and queues

3. Check if the service is running:
   ```bash
   curl http://localhost:3001/health
   ```

### Connecting to Service A's RabbitMQ and Redis

If you want Logger Service B to consume events from Service A's RabbitMQ and store logs in Service A's Redis:

1. Update the `.env` file to point to Service A's RabbitMQ and Redis:
   ```
   REDIS_HOST=localhost
   REDIS_PORT=6379
   RABBITMQ_URL=amqp://guest:guest@localhost:5672
   ```

2. Use the simplified docker-compose.yml that only runs the Logger Service B:
   ```yaml
   version: '3.8'

   services:
     logger-service:
       build:
         context: .
         dockerfile: Dockerfile
       container_name: logger-service
       restart: unless-stopped
       ports:
         - "3001:3001"
       env_file:
         - .env
       environment:
         - NODE_ENV=development
         - PORT=3001
         - REDIS_HOST=host.docker.internal
         - REDIS_PORT=6379
         - RABBITMQ_URL=amqp://guest:guest@host.docker.internal:5672
         - RABBITMQ_EXCHANGE=data_service_events
         - RABBITMQ_QUEUE=data_service_logs
         - RABBITMQ_ROUTING_KEY_PATTERN=data.service.#
       volumes:
         - .:/app
         - node_modules:/app/node_modules
       extra_hosts:
         - "host.docker.internal:host-gateway"
       healthcheck:
         test: ["CMD", "wget", "-qO-", "http://localhost:3001/health"]
         interval: 30s
         timeout: 5s
         retries: 3
         start_period: 5s

   volumes:
     node_modules:
   ```

3. Start the service:
   ```bash
   docker-compose down --remove-orphans && docker-compose up -d
   ```

### With npm (Development)

1. Make sure Redis and RabbitMQ are running (either from the main docker-compose or standalone)

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the service in development mode:
   ```bash
   npm run start:dev
   ```

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /logs/day?date=YYYY-MM-DD` - Get logs for a specific day
- `GET /logs/range?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` - Get logs for a date range

## Integration with Service A

When running with the main docker-compose.yml file in the project root, both Service A and Service B will share the same Redis and RabbitMQ instances. Service A will publish events to RabbitMQ, and Service B will consume them.

## Environment Variables

See `.env.example` for a list of available environment variables and their default values.

## Port Configuration

When running standalone, the service uses different ports to avoid conflicts with Service A:

- Redis: 6380 (mapped to internal port 6379)
- RabbitMQ: 5673 (mapped to internal port 5672)
- RabbitMQ Management UI: 15673 (mapped to internal port 15672)

When running with the main docker-compose.yml, shared instances are used:

- Redis: 6379
- RabbitMQ: 5672
- RabbitMQ Management UI: 15672

## Troubleshooting

### No logs appearing in Redis

If you're not seeing any logs when querying the API, check the following:

1. Make sure Service A is properly sending events to RabbitMQ
2. Make sure Logger Service B is connected to the same RabbitMQ instance as Service A
3. Make sure Logger Service B is connected to the same Redis instance where you're querying logs
4. Check the logs of Logger Service B for any connection errors:
   ```bash
   docker logs logger-service
   ``` 