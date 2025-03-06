import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "./redis.service";

@Injectable()
export class TimeSeriesService {
  private readonly logger = new Logger(TimeSeriesService.name);

  constructor(private redisService: RedisService) {}

  /**
   * Creates a new time series
   * @param key - The key for the time series
   * @param labels - Optional labels for the time series
   * @param retentionTime - Optional retention time in milliseconds
   */
  async createTimeSeries(
    key: string,
    labels: Record<string, string> = {},
    retentionTime?: number
  ): Promise<void> {
    const client = this.redisService.getClient();

    if (!client) {
      this.logger.error(
        `Cannot create time series ${key}: Redis client is not initialized`
      );
      return;
    }

    const labelArgs = Object.entries(labels).flatMap(([name, value]) => [
      "LABELS",
      name,
      value,
    ]);
    const retentionArgs = retentionTime
      ? ["RETENTION", retentionTime.toString()]
      : [];

    try {
      await client.call("TS.CREATE", key, ...retentionArgs, ...labelArgs);
      this.logger.log(`Created time series: ${key}`);
    } catch (error) {
      // Ignore if already exists
      if (!error.message.includes("already exists")) {
        this.logger.error(
          `Error creating time series ${key}: ${error.message}`,
          error.stack
        );
        throw error;
      }
    }
  }

  /**
   * Adds a data point to a time series
   * @param key - The key for the time series
   * @param timestamp - The timestamp (in milliseconds) or '*' for automatic timestamp
   * @param value - The value to add
   */
  async addDataPoint(
    key: string,
    value: number,
    timestamp: number | "*" = "*"
  ): Promise<void> {
    const client = this.redisService.getClient();

    if (!client) {
      this.logger.error(
        `Cannot add data point to ${key}: Redis client is not initialized`
      );
      return;
    }

    try {
      await client.call("TS.ADD", key, timestamp, value.toString());
      this.logger.log(`Added data point to ${key}: ${value} at ${timestamp}`);
    } catch (error) {
      this.logger.error(
        `Error adding data point to ${key}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Retrieves data points from a time series
   * @param key - The key for the time series
   * @param fromTimestamp - Start timestamp (inclusive)
   * @param toTimestamp - End timestamp (inclusive)
   * @param count - Optional maximum number of results to return
   * @param aggregation - Optional aggregation type (e.g., 'avg', 'sum', 'min', 'max')
   * @param bucketSizeMs - Optional time bucket for aggregation in milliseconds
   */
  async getRange(
    key: string,
    fromTimestamp: number,
    toTimestamp: number,
    count?: number,
    aggregation?: "avg" | "sum" | "min" | "max" | "count",
    bucketSizeMs?: number
  ): Promise<Array<{ ts: number; val: number }>> {
    const client = this.redisService.getClient();

    if (!client) {
      this.logger.error(
        `Cannot get range for ${key}: Redis client is not initialized`
      );
      return [];
    }

    const args = [key, fromTimestamp.toString(), toTimestamp.toString()];

    if (count) {
      args.push("COUNT", count.toString());
    }

    if (aggregation && bucketSizeMs) {
      args.push("AGGREGATION", aggregation, bucketSizeMs.toString());
    }

    try {
      const result = (await client.call("TS.RANGE", ...args)) as Array<
        [string, string]
      >;

      // Parse the response
      return result.map(([ts, val]) => ({
        ts: parseInt(ts, 10),
        val: parseFloat(val),
      }));
    } catch (error) {
      this.logger.error(
        `Error getting range for ${key}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Gets information about a time series
   * @param key - The key for the time series
   */
  async getInfo(key: string): Promise<Record<string, any>> {
    const client = this.redisService.getClient();

    if (!client) {
      this.logger.error(
        `Cannot get info for ${key}: Redis client is not initialized`
      );
      return {};
    }

    try {
      const result = (await client.call("TS.INFO", key)) as Array<string>;

      // Parse the result into a structured object
      const info: Record<string, any> = {};
      for (let i = 0; i < result.length; i += 2) {
        info[result[i]] = result[i + 1];
      }

      return info;
    } catch (error) {
      this.logger.error(
        `Error getting info for ${key}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Gets the last data point from a time series
   * @param key - The key for the time series
   */
  async getLastDataPoint(
    key: string
  ): Promise<{ ts: number; val: number } | null> {
    const client = this.redisService.getClient();

    if (!client) {
      this.logger.error(
        `Cannot get last data point for ${key}: Redis client is not initialized`
      );
      return null;
    }

    try {
      const result = (await client.call("TS.GET", key)) as
        | [string, string]
        | null;

      if (!result || result.length !== 2) {
        return null;
      }

      return {
        ts: parseInt(result[0], 10),
        val: parseFloat(result[1]),
      };
    } catch (error) {
      // Return null if key doesn't exist
      if (error.message.includes("key does not exist")) {
        return null;
      }

      this.logger.error(
        `Error getting last data point for ${key}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}
