import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
  DiskHealthIndicator,
  MemoryHealthIndicator,
  HealthIndicatorResult,
  HealthIndicatorFunction,
} from "@nestjs/terminus";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import { RedisService } from "../redis-cache/redis.service";
import { ConfigService } from "@nestjs/config";
import { TimeSeriesService } from "../redis-cache/time-series.service";

/**
 * Function for forced garbage collection if available
 */
function runGarbageCollection(): boolean {
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

@ApiTags("health")
@Controller("health")
export class HealthController {
  private isProduction: boolean;

  constructor(
    private health: HealthCheckService,
    private mongooseHealth: MongooseHealthIndicator,
    private diskHealth: DiskHealthIndicator,
    private memoryHealth: MemoryHealthIndicator,
    private redisService: RedisService,
    private configService: ConfigService,
    @InjectConnection() private readonly connection: Connection,
    private readonly timeSeriesService: TimeSeriesService
  ) {
    this.isProduction =
      this.configService.get<string>("NODE_ENV") === "production";
  }

  @Get()
  @ApiOperation({ summary: "Check service health status" })
  @ApiResponse({
    status: 200,
    description: "The service is healthy",
  })
  @ApiResponse({
    status: 503,
    description: "The service is unhealthy",
  })
  @HealthCheck()
  check() {
    // Running garbage collection before health check if possible
    runGarbageCollection();

    const healthChecks: Array<HealthIndicatorFunction> = [
      // MongoDB connection check
      () =>
        this.mongooseHealth.pingCheck("mongodb", {
          connection: this.connection,
        }),

      // Disk space check
      () =>
        this.diskHealth.checkStorage("disk", {
          path: "/",
          thresholdPercent: 0.85,
        }),

      // Redis connection check
      async () => this.checkRedisConnection(),
    ];

    return this.health.check(healthChecks);
  }

  // Warning-level health check with lower thresholds for early problem detection
  @Get("warning")
  @ApiOperation({
    summary: "Check service health status with warning thresholds",
  })
  @ApiResponse({
    status: 200,
    description: "No warnings detected",
  })
  @HealthCheck()
  checkWarning() {
    // Running garbage collection before health check if possible
    runGarbageCollection();

    return this.health.check([
      // Disk space check with warning threshold
      () =>
        this.diskHealth.checkStorage("disk_warning", {
          path: "/",
          thresholdPercent: 0.7,
        }),
    ]);
  }

  /**
   * Custom health check for Redis connection
   */
  private async checkRedisConnection(): Promise<HealthIndicatorResult> {
    try {
      const client = this.redisService.getClient();
      if (!client) {
        return {
          redis: {
            status: "down",
            message: "Redis client is not initialized",
          },
        };
      }

      // Use PING to test connection
      await client.ping();

      return {
        redis: {
          status: "up",
        },
      };
    } catch (error) {
      return {
        redis: {
          status: "down",
          message: `Redis connection error: ${error.message}`,
        },
      };
    }
  }

  /**
   * Gets metrics data from Redis TimeSeries
   * @param key - The TimeSeries key to fetch data for
   * @param from - Start timestamp in milliseconds
   * @param to - End timestamp in milliseconds
   * @param count - Maximum number of points to return
   */
  @Get("metrics")
  @ApiOperation({
    summary: "Get metrics data from TimeSeries",
  })
  @ApiResponse({
    status: 200,
    description: "Returns metrics data points",
  })
  @ApiQuery({ name: 'key', required: true, description: 'TimeSeries key (e.g., metrics:geodb:response_time)' })
  @ApiQuery({ name: 'from', required: false, description: 'Start timestamp in milliseconds' })
  @ApiQuery({ name: 'to', required: false, description: 'End timestamp in milliseconds' })
  @ApiQuery({ name: 'count', required: false, description: 'Maximum number of points to return' })
  async getMetrics(
    @Query('key') key: string,
    @Query('from') from?: number,
    @Query('to') to?: number,
    @Query('count') count?: number
  ) {
    const fromTime = from || Date.now() - 24 * 60 * 60 * 1000; // Default: last 24 hours
    const toTime = to || Date.now();
    
    try {
      // Get info about the time series
      const info = await this.timeSeriesService.getInfo(key);
      
      // Get data points
      const dataPoints = await this.timeSeriesService.getRange(
        key,
        fromTime,
        toTime,
        count || 100
      );
      
      return {
        info,
        dataPoints,
        count: dataPoints.length,
      };
    } catch (error) {
      return {
        error: error.message,
        exists: false,
      };
    }
  }
}
