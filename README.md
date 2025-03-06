# Microservices Project

This project consists of two microservices:
- **Data Service A** - A service that provides data and publishes events to RabbitMQ
- **Logger Service B** - A service that consumes events from RabbitMQ and stores them in Redis TimeSeries

## Requirements

- Docker
- Docker Compose

## Configuration

Before running the project, create a `.env` file in the root directory with the following environment variables:

```
# General settings
NODE_ENV=development

# Service ports
DATA_SERVICE_PORT=3000
LOGGER_SERVICE_PORT=3001

# MongoDB settings
MONGODB_HOST=mongodb
MONGODB_PORT=27017
MONGODB_DATA_DB=data-service-a
MONGODB_LOGGER_DB=logger-service-b

# Redis settings
REDIS_HOST=redis
REDIS_PORT=6379

# RabbitMQ settings
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASS=guest
RABBITMQ_EXCHANGE=data_service_events
RABBITMQ_QUEUE=data_service_logs
RABBITMQ_ROUTING_KEY=data.service.logs

# Log level
LOG_LEVEL=debug

# API keys (fill in as needed)
GEODB_API_KEY=your_api_key_here
```

## Running Both Services Together

To run both services together with shared infrastructure:

```bash
docker-compose up -d
```

This will start:
- Data Service A on port 3000
- Logger Service B on port 3001
- Redis on port 6379
- RabbitMQ on port 5672 (management UI on port 15672)
- MongoDB on port 27017

## Running Services Separately

### Running Data Service A

```bash
cd data-service-a
docker-compose up -d
```

### Running Logger Service B

```bash
cd logger-service-b
docker-compose up -d
```

## Accessing Services

After starting the containers, the services will be available at:

- **Data Service A**: http://localhost:3000
- **Logger Service B**: http://localhost:3001
- **MongoDB**: mongodb://localhost:27017
- **Redis**: redis://localhost:6379
- **RabbitMQ Management**: http://localhost:15672 (login: guest, password: guest)

## Health Checks

Both services provide health check endpoints:

- **Data Service A**: http://localhost:3000/health
- **Logger Service B**: http://localhost:3001/health

## API Endpoints

### Data Service A

- `GET /health` - Health check
- `GET /data-search/cities` - Search cities

### Logger Service B

- `GET /health` - Health check
- `GET /logs/day?date=YYYY-MM-DD` - Get logs for a specific day
- `GET /logs/range?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` - Get logs for a date range

## Project Structure

```
.
├── data-service-a/       # Data Service A codebase
├── logger-service-b/     # Logger Service B codebase
```

## Development

Each service has its own README.md file with more detailed instructions for development:

- [Data Service A README](./data-service-a/README.md)
- [Logger Service B README](./logger-service-b/README.md)


