# Data Processing Service (Service A)

A comprehensive data processing service built with NestJS for acquiring, processing, and serving data from external APIs.

## Features

- **Data Acquisition**: Fetch and download data from GeoDB Cities API
- **Data Processing**: Transform and store data in MongoDB
- **Data Search**: Advanced search capabilities with filtering, pagination, and sorting
- **Event Publishing**: Publish events to RabbitMQ for consumption by other services
  - Includes original HTTP request context in all events for traceability
- **Metrics**: Track and store time-series metrics in Redis
- **Caching**: Improve performance with Redis caching
- **API Documentation**: Swagger/OpenAPI documentation

## Tech Stack

- **Framework**: NestJS (TypeScript)
- **Database**: MongoDB
- **Cache/Time-Series DB**: Redis with RedisTimeSeries module
- **Message Broker**: RabbitMQ
- **API Documentation**: Swagger
- **Logging**: Winston
- **Containerization**: Docker

## Event Publishing with Request Context

All events published to RabbitMQ include the original HTTP request context, which enables:

- End-to-end traceability across services
- Correlation of related events
- Debugging and troubleshooting
- Audit logging

The request context includes:
- HTTP method (GET, POST, etc.)
- Request path
- Query parameters
- Request body (with sensitive data filtered)
- Request headers (with sensitive headers filtered)
- Client IP address

### Example Event with Request Context

```json
{
  "service": "data-service-a",
  "correlationId": "corr-1741169754166-b0llhh",
  "timestamp": "2023-03-05T10:15:54.166Z",
  "level": "info",
  "message": "City processing completed",
  "metadata": { 
    "totalCities": 100 
  },
  "httpRequest": {
    "method": "POST",
    "path": "/data-processing/cities/batch-process",
    "query": {},
    "body": {
      "batchSize": 100,
      "processType": "population"
    },
    "headers": {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0...",
      "x-request-id": "corr-1741169754166-b0llhh"
    },
    "ip": "192.168.1.100"
  }
}
```

### Handling Request Context in Consuming Services

Other services consuming these events can access the HTTP request context to provide enhanced logging, tracing, and debugging capabilities. Here's an example of how a consuming service might handle this:

```typescript
// Example consumer in logger-service-b
@Injectable()
export class LogEventConsumer {
  private readonly logger = new Logger(LogEventConsumer.name);

  @RabbitMQSubscribe({
    exchange: 'data_service_events',
    routingKey: 'data.service.logs',
    queue: 'data_service_logs'
  })
  async handleLogEvent(message: any): Promise<void> {
    try {
      // Access the original HTTP request information
      if (message.httpRequest) {
        this.logger.log(`Processing event from HTTP ${message.httpRequest.method} ${message.httpRequest.path}`);
        
        // Extract client information
        const clientIp = message.httpRequest.ip;
        const userAgent = message.httpRequest.headers['user-agent'];
        
        // You can store this information or use it for analytics
        await this.logRepository.save({
          ...message,
          clientInfo: {
            ip: clientIp,
            userAgent: userAgent
          },
          // Original endpoint that triggered this event
          sourceEndpoint: `${message.httpRequest.method} ${message.httpRequest.path}`
        });
      } else {
        this.logger.log(`Processing event without HTTP request info: ${message.message}`);
        await this.logRepository.save(message);
      }
    } catch (error) {
      this.logger.error(`Error processing log event: ${error.message}`, error.stack);
    }
  }
}
```

## Prerequisites

- Node.js (v16+)
- Docker and Docker Compose
- MongoDB
- Redis (with RedisTimeSeries module)
- RabbitMQ

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration.

## Running the Application

### Development Mode

```bash
npm run start:dev
```

### Production Mode

```bash
npm run build
npm run start:prod
```

### Using Docker

```bash
docker-compose up -d
```

## API Endpoints

### Data Acquisition

- `POST /data-acquisition/cities` - Fetch cities from GeoDB API
- `GET /data-acquisition/cities/:id` - Get city by ID

### Data Processing

- `POST /data-processing/cities/:id/process` - Process a city by ID
- `POST /data-processing/cities/batch-process` - Batch process cities

### Data Search

- `GET /data-search/cities` - Search cities with various filters
- `GET /data-search/stats/by-country` - Get city statistics by country

### Health Check

- `GET /health` - Check service health

## API Documentation

Swagger documentation is available at `/api/docs` when the application is running.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3000 |
| NODE_ENV | Environment | development |
| MONGODB_URI | MongoDB connection string | mongodb://localhost:27017/data-service-a |
| REDIS_HOST | Redis host | localhost |
| REDIS_PORT | Redis port | 6379 |
| RABBITMQ_URL | RabbitMQ URL | amqp://guest:guest@localhost:5672 |
| RABBITMQ_EXCHANGE | RabbitMQ exchange | data_service_events |
| RABBITMQ_QUEUE | RabbitMQ queue | data_service_logs |
| RABBITMQ_ROUTING_KEY | RabbitMQ routing key | data.service.logs |
| LOG_LEVEL | Logging level | debug |
| GEODB_API_BASE_URL | GeoDB API base URL | http://geodb-free-service.wirefreethought.com/v1 |
| GEODB_API_KEY | GeoDB API key | your_api_key_here |
| GEODB_API_RATE_LIMIT | GeoDB API rate limit | 10 |
| GEODB_API_RATE_LIMIT_PERIOD | GeoDB API rate limit period (seconds) | 60 |

## Project Structure

```
data-service-a/
├── src/
│   ├── config/                 # Configuration files
│   ├── entities/               # Database entity schemas
│   ├── modules/                # Feature modules
│   │   ├── data-acquisition/   # Data acquisition module
│   │   ├── data-processing/    # Data processing module
│   │   ├── data-search/        # Data search module
│   │   ├── event-publishing/   # Event publishing module
│   │   ├── health/             # Health check module
│   │   └── redis-cache/        # Redis cache module
│   ├── app.module.ts           # Main application module
│   └── main.ts                 # Application entry point
├── .env                        # Environment variables
├── .env.example                # Example environment variables
├── Dockerfile                  # Docker configuration
├── docker-compose.yml          # Docker Compose configuration
└── package.json                # Project dependencies
```

## License

This project is licensed under the MIT License. 