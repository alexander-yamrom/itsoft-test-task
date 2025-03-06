import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { WinstonModule } from "nest-winston";
import * as compression from "compression";
import { AppModule } from "./app.module";
import { configureWinston } from "./config/winston.config";
import { ConfigService } from "@nestjs/config";

// forcing GC if available
function runGarbageCollection() {
  if (global.gc) {
    try {
      global.gc();
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

async function bootstrap() {
  const logger = WinstonModule.createLogger(configureWinston());
  const appLogger = new Logger("Application");

  // memory cleanup
  setupMemoryManagement(appLogger);

  const app = await NestFactory.create(AppModule, {
    logger,
    // no request body logging
    rawBody: false,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT", 3000);

  app.enableCors();

  // Enable compression
  app.use(
    compression({
      level: 6,
      threshold: 0,
      memLevel: 8,
    })
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      stopAtFirstError: true,
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Data Processing Service API")
    .setDescription(
      "API for data acquisition, processing, and search capabilities"
    )
    .setVersion("1.0")
    .addTag("data")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    deepScanRoutes: false,
  });
  SwaggerModule.setup("api/docs", app, document);

  setupGracefulShutdown(app, appLogger);

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}

// memory cleanup
function setupMemoryManagement(logger: Logger) {
  // GC every 5 minutes
  const gcInterval = setInterval(() => {
    const before = process.memoryUsage();

    if (runGarbageCollection()) {
      const after = process.memoryUsage();
      const freedHeap = (before.heapUsed - after.heapUsed) / (1024 * 1024);

      if (freedHeap > 5) {
        // If more than 5 MB was freed
        logger.log(
          `Garbage collection freed ${freedHeap.toFixed(2)} MB of heap memory`
        );
      }
    }
  }, 5 * 60 * 1000); // 5 minutes

  const memoryMonitorInterval = setInterval(() => {
    const memoryUsage = process.memoryUsage();

    logger.log(
      `Memory usage - RSS: ${(memoryUsage.rss / (1024 * 1024)).toFixed(
        2
      )} MB, ` +
        `Heap: ${(memoryUsage.heapUsed / (1024 * 1024)).toFixed(2)}/${(
          memoryUsage.heapTotal /
          (1024 * 1024)
        ).toFixed(2)} MB, ` +
        `External: ${(memoryUsage.external / (1024 * 1024)).toFixed(2)} MB`
    );
  }, 15 * 60 * 1000); // 15 minutes

  // Clear intervals on exit
  process.on("exit", () => {
    clearInterval(gcInterval);
    clearInterval(memoryMonitorInterval);
  });
}

function setupGracefulShutdown(app, logger: Logger) {
  const shutdownSignals = ["SIGTERM", "SIGINT"];

  for (const signal of shutdownSignals) {
    process.on(signal, async () => {
      logger.log(`Received ${signal}, gracefully shutting down...`);

      try {
        logger.log("Application closed successfully");

        // Force memory release before exit
        runGarbageCollection();

        process.exit(0);
      } catch (error) {
        logger.error(`Error during shutdown: ${error.message}`);
        process.exit(1);
      }
    });
  }
}

bootstrap();
