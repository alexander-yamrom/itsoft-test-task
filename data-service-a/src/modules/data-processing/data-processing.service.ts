import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { City } from "../../entities/city.schema";
import { RabbitMQService } from "../event-publishing/rabbitmq.service";
import { TimeSeriesService } from "../redis-cache/time-series.service";

@Injectable()
export class DataProcessingService implements OnModuleInit {
  private readonly logger = new Logger(DataProcessingService.name);

  constructor(
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    private readonly rabbitMQService: RabbitMQService,
    private readonly timeSeriesService: TimeSeriesService
  ) {}

  async onModuleInit() {
    await this.setupMetrics();
  }

  private async setupMetrics() {
    try {
      await this.timeSeriesService.createTimeSeries(
        "metrics:data_processing:operations",
        {
          service: "data-service-a",
          metric_type: "operations",
          module: "data_processing",
        }
      );

      await this.timeSeriesService.createTimeSeries(
        "metrics:data_processing:errors",
        {
          service: "data-service-a",
          metric_type: "errors",
          module: "data_processing",
        }
      );

      await this.timeSeriesService.createTimeSeries(
        "metrics:data_processing:processing_time",
        {
          service: "data-service-a",
          metric_type: "processing_time",
          module: "data_processing",
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
   * Process city data by applying transformations
   * @param cityId - ID of the city to process
   * @returns Promise<City> - Processed city data
   */
  async processCity(cityId: number): Promise<City> {
    const startTime = Date.now();

    try {
      this.logger.log(`Processing city with ID: ${cityId}`);

      // Find the city
      const city = await this.cityModel.findOne({ cityId }).exec();

      if (!city) {
        this.logger.warn(`City with ID ${cityId} not found`);
        throw new Error(`City with ID ${cityId} not found`);
      }

      // Apply processing logic (example: enrich data)
      // In a real application, this could involve more complex transformations

      // For demonstration, we'll just update the lastUpdated field
      city.lastUpdated = new Date();

      // Save the updated city
      await city.save();

      // Record metrics
      const processingTime = Date.now() - startTime;
      await this.recordMetrics("success", processingTime);

      // Publish event
      await this.rabbitMQService.publishLogEvent({
        level: "info",
        message: "City processed successfully",
        metadata: { cityId, processingTime },
      });

      return city;
    } catch (error) {
      this.logger.error(
        `Error processing city ${cityId}: ${error.message}`,
        error.stack
      );

      // Record error metrics
      await this.recordMetrics("error", Date.now() - startTime);

      // Publish error event
      await this.rabbitMQService.publishLogEvent({
        level: "error",
        message: "Error processing city",
        metadata: { cityId, error: error.message },
      });

      throw error;
    }
  }

  /**
   * Batch process multiple cities
   * @param filter - Filter criteria for cities to process
   * @param limit - Maximum number of cities to process
   * @returns Promise<{ processed: number; errors: number }> - Processing results
   */
  async batchProcessCities(
    filter: Record<string, any> = {},
    limit: number = 100
  ): Promise<{ processed: number; errors: number }> {
    const startTime = Date.now();

    this.logger.log(
      `Batch processing cities with filter: ${JSON.stringify(
        filter
      )}, limit: ${limit}`
    );

    try {
      // Find cities matching the filter
      const cities = await this.cityModel.find(filter).limit(limit).exec();

      if (cities.length === 0) {
        this.logger.warn("No cities found matching the filter");
        return { processed: 0, errors: 0 };
      }

      this.logger.log(`Found ${cities.length} cities to process`);

      // Process cities
      let processed = 0;
      let errors = 0;

      for (const city of cities) {
        try {
          // Apply processing logic
          city.lastUpdated = new Date();
          await city.save();
          processed++;
        } catch (error) {
          this.logger.error(
            `Error processing city ${city.cityId}: ${error.message}`,
            error.stack
          );
          errors++;
        }
      }

      // Record metrics
      const processingTime = Date.now() - startTime;
      await this.recordMetrics("success", processingTime);

      // Publish event
      await this.rabbitMQService.publishLogEvent({
        level: "info",
        message: "Batch processing completed",
        metadata: {
          filter,
          limit,
          found: cities.length,
          processed,
          errors,
          processingTime,
        },
      });

      return { processed, errors };
    } catch (error) {
      this.logger.error(
        `Error in batch processing: ${error.message}`,
        error.stack
      );

      // Record error metrics
      await this.recordMetrics("error", Date.now() - startTime);

      // Publish error event
      await this.rabbitMQService.publishLogEvent({
        level: "error",
        message: "Error in batch processing",
        metadata: { filter, limit, error: error.message },
      });

      throw error;
    }
  }

  /**
   * Record metrics for data processing operations
   * @param status - Operation status (success or error)
   * @param processingTime - Processing time in milliseconds
   */
  private async recordMetrics(
    status: "success" | "error",
    processingTime: number
  ): Promise<void> {
    try {
      // Record operation count
      await this.timeSeriesService.addDataPoint(
        "metrics:data_processing:operations",
        1
      );

      // Record processing time
      await this.timeSeriesService.addDataPoint(
        "metrics:data_processing:processing_time",
        processingTime
      );

      // Record errors if applicable
      if (status === "error") {
        await this.timeSeriesService.addDataPoint(
          "metrics:data_processing:errors",
          1
        );
      }
    } catch (error) {
      this.logger.error(
        `Error recording metrics: ${error.message}`,
        error.stack
      );
    }
  }
}
