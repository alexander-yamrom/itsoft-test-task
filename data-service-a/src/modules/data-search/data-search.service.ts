import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { City } from "../../entities/city.schema";
import { RedisService } from "../redis-cache/redis.service";
import { RabbitMQService } from "../event-publishing/rabbitmq.service";
import { TimeSeriesService } from "../redis-cache/time-series.service";

@Injectable()
export class DataSearchService implements OnModuleInit {
  private readonly logger = new Logger(DataSearchService.name);

  constructor(
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    private readonly redisService: RedisService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly timeSeriesService: TimeSeriesService
  ) {}

  async onModuleInit() {
    await this.setupMetrics();
  }

  private async setupMetrics() {
    try {
      await this.timeSeriesService.createTimeSeries(
        "metrics:data_search:queries",
        {
          service: "data-service-a",
          metric_type: "queries",
          module: "data_search",
        }
      );

      await this.timeSeriesService.createTimeSeries(
        "metrics:data_search:errors",
        {
          service: "data-service-a",
          metric_type: "errors",
          module: "data_search",
        }
      );

      await this.timeSeriesService.createTimeSeries(
        "metrics:data_search:response_time",
        {
          service: "data-service-a",
          metric_type: "response_time",
          module: "data_search",
        }
      );

      await this.timeSeriesService.createTimeSeries(
        "metrics:data_search:cache_hits",
        {
          service: "data-service-a",
          metric_type: "cache_hits",
          module: "data_search",
        }
      );

      await this.timeSeriesService.createTimeSeries(
        "metrics:data_search:cache_misses",
        {
          service: "data-service-a",
          metric_type: "cache_misses",
          module: "data_search",
        }
      );
    } catch (error) {
      this.logger.error(
        `Error setting up metrics: ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * Search cities with various filters and pagination
   * @param searchParams - Search parameters
   * @returns Promise<{ data: City[]; total: number; page: number; limit: number }> - Search results
   */
  async searchCities(searchParams: {
    name?: string;
    countryCode?: string;
    regionCode?: string;
    minPopulation?: number;
    maxPopulation?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    fields?: string[];
  }): Promise<{ data: City[]; total: number; page: number; limit: number }> {
    const startTime = Date.now();

    try {
      const {
        name,
        countryCode,
        regionCode,
        minPopulation,
        maxPopulation,
        page = 1,
        limit = 10,
        sortBy = "name",
        sortOrder = "asc",
        fields,
      } = searchParams;

      // Generate cache key based on search parameters
      const cacheKey = `search:cities:${JSON.stringify(searchParams)}`;

      // Check cache first
      const cachedResult = await this.redisService.getJson<{
        data: City[];
        total: number;
        page: number;
        limit: number;
      }>(cacheKey);

      if (cachedResult) {
        this.logger.log(`Cache hit for ${cacheKey}`);
        await this.recordMetrics("cache_hit", Date.now() - startTime);
        return cachedResult;
      }

      this.logger.log(`Cache miss for ${cacheKey}`);
      await this.recordMetrics("cache_miss", 0);

      // Build filter
      const filter: Record<string, any> = {};

      if (name) {
        filter.name = { $regex: name, $options: "i" };
      }

      if (countryCode) {
        filter.countryCode = countryCode.toUpperCase();
      }

      if (regionCode) {
        filter.regionCode = regionCode.toUpperCase();
      }

      if (minPopulation !== undefined) {
        filter.population = { ...filter.population, $gte: minPopulation };
      }

      if (maxPopulation !== undefined) {
        filter.population = { ...filter.population, $lte: maxPopulation };
      }

      // Calculate skip value for pagination
      const skip = (page - 1) * limit;

      // Build sort object
      const sort: Record<string, 1 | -1> = {
        [sortBy]: sortOrder === "asc" ? 1 : -1,
      };

      // Build projection if fields are specified
      const projection = fields
        ? fields.reduce((obj, field) => ({ ...obj, [field]: 1 }), {})
        : null;

      // Execute query
      const [data, total] = await Promise.all([
        this.cityModel
          .find(filter, projection)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .exec(),
        this.cityModel.countDocuments(filter).exec(),
      ]);

      // Prepare result
      const result = {
        data,
        total,
        page,
        limit,
      };

      // Cache result for 5 minutes
      await this.redisService.setJson(cacheKey, result, 300);

      // Record metrics
      await this.recordMetrics("success", Date.now() - startTime);

      // Log the search
      await this.rabbitMQService.publishLogEvent({
        level: "info",
        message: "City search executed",
        metadata: {
          filter,
          page,
          limit,
          sortBy,
          sortOrder,
          resultCount: data.length,
          totalCount: total,
          responseTime: Date.now() - startTime,
        },
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Error searching cities: ${error.message}`,
        error.stack
      );

      // Record error metrics
      await this.recordMetrics("error", Date.now() - startTime);

      // Log the error
      await this.rabbitMQService.publishLogEvent({
        level: "error",
        message: "Error searching cities",
        metadata: { error: error.message, params: searchParams },
      });

      throw error;
    }
  }

  /**
   * Get city statistics by country
   * @returns Promise<any[]> - City statistics by country
   */
  async getCityStatsByCountry(): Promise<any[]> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = "stats:cities:by_country";
      const cachedResult = await this.redisService.getJson<any[]>(cacheKey);

      if (cachedResult) {
        this.logger.log(`Cache hit for ${cacheKey}`);
        await this.recordMetrics("cache_hit", Date.now() - startTime);
        return cachedResult;
      }

      this.logger.log(`Cache miss for ${cacheKey}`);
      await this.recordMetrics("cache_miss", 0);

      // Execute aggregation
      const stats = await this.cityModel
        .aggregate([
          {
            $group: {
              _id: { countryCode: "$countryCode", country: "$country" },
              count: { $sum: 1 },
              totalPopulation: { $sum: "$population" },
              avgPopulation: { $avg: "$population" },
              minPopulation: { $min: "$population" },
              maxPopulation: { $max: "$population" },
            },
          },
          {
            $project: {
              _id: 0,
              countryCode: "$_id.countryCode",
              country: "$_id.country",
              count: 1,
              totalPopulation: 1,
              avgPopulation: 1,
              minPopulation: 1,
              maxPopulation: 1,
            },
          },
          {
            $sort: { count: -1 },
          },
        ])
        .exec();

      // Cache result for 1 hour
      await this.redisService.setJson(cacheKey, stats, 3600);

      // Record metrics
      await this.recordMetrics("success", Date.now() - startTime);

      return stats;
    } catch (error) {
      this.logger.error(
        `Error getting city stats by country: ${error.message}`,
        error.stack
      );

      // Record error metrics
      await this.recordMetrics("error", Date.now() - startTime);

      throw error;
    }
  }

  /**
   * Record metrics for search operations
   * @param status - Operation status or cache result
   * @param responseTime - Response time in milliseconds
   */
  private async recordMetrics(
    status: "success" | "error" | "cache_hit" | "cache_miss",
    responseTime: number
  ): Promise<void> {
    try {
      // Record query count
      await this.timeSeriesService.addDataPoint(
        "metrics:data_search:queries",
        1
      );

      // Record response time if applicable
      if (responseTime > 0) {
        await this.timeSeriesService.addDataPoint(
          "metrics:data_search:response_time",
          responseTime
        );
      }

      // Record specific metrics based on status
      switch (status) {
        case "error":
          await this.timeSeriesService.addDataPoint(
            "metrics:data_search:errors",
            1
          );
          break;
        case "cache_hit":
          await this.timeSeriesService.addDataPoint(
            "metrics:data_search:cache_hits",
            1
          );
          break;
        case "cache_miss":
          await this.timeSeriesService.addDataPoint(
            "metrics:data_search:cache_misses",
            1
          );
          break;
      }
    } catch (error) {
      this.logger.error(
        `Error recording metrics: ${error.message}`,
        error.stack
      );
    }
  }
}
