import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as ExcelJS from "exceljs";
import { GeoDBService } from "./geodb.service";
import { City } from "../../entities/city.schema";
import { FetchCitiesDto, OutputFormat } from "./dto/fetch-cities.dto";
import { RabbitMQService } from "../event-publishing/rabbitmq.service";

@Injectable()
export class DataAcquisitionService {
  private readonly logger = new Logger(DataAcquisitionService.name);

  constructor(
    private readonly geoDBService: GeoDBService,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    private readonly rabbitMQService: RabbitMQService
  ) {}

  /**
   * Fetch cities from GeoDB API and store in database
   * @param fetchCitiesDto - Parameters for fetching cities
   * @returns Promise<any> - Fetched cities or Excel workbook
   */
  async fetchCities(fetchCitiesDto: FetchCitiesDto): Promise<unknown> {
    const { countryCode, namePrefix, minPopulation, limit, format } =
      fetchCitiesDto;

    // Prepare query parameters for GeoDB API
    const params: Record<string, unknown> = {};

    if (countryCode) {
      params.countryIds = countryCode;
    }

    if (namePrefix) {
      params.namePrefix = namePrefix;
    }

    if (minPopulation) {
      params.minPopulation = minPopulation;
    }

    this.logger.log(
      `Fetching cities with params: ${JSON.stringify(params)}, limit: ${limit}`
    );
    await this.rabbitMQService.publishLogEvent({
      level: "info",
      message: "Fetching cities from GeoDB API",
      metadata: { params, limit },
    });

    try {
      // Сhunk processing to deal with memory consumption
      let processedCount = 0;
      let allProcessedCities = [];

      params.processChunkCallback = async (chunk) => {
        await this.processCities(chunk);
        processedCount += chunk.length;

        // For Excel output
        if (format === OutputFormat.EXCEL || format === OutputFormat.JSON) {
          allProcessedCities.push(...chunk);
        }

        this.logger.log(
          `Processed chunk of ${chunk.length} cities. Total processed: ${processedCount}`
        );
      };

      // Only keep processed data
      params.clearAfterProcessing =
        format !== OutputFormat.EXCEL && format !== OutputFormat.JSON;

      // Fetch cities from GeoDB API with streaming processing
      const cities = await this.geoDBService.getAllCities(params, limit);

      // Process remaining cities
      if (cities.length > 0 && cities.length !== processedCount) {
        await this.processCities(cities);
      }

      // Return data in requested format
      if (format === OutputFormat.EXCEL) {
        // Use the full list of cities if we kept them, otherwise use whatever we have
        const citiesToExport =
          allProcessedCities.length > 0 ? allProcessedCities : cities;
        return this.generateExcel(citiesToExport);
      }

      return {
        success: true,
        count: processedCount || cities.length,
        // Only return the actual data if we're using JSON format
        data:
          format === OutputFormat.JSON
            ? allProcessedCities.length > 0
              ? allProcessedCities
              : cities
            : [],
        message: "Note: Data is fetched from GeoDB Cities API with BASIC plan limits (10 records per request, 1 request per second). Consider using cached data for better performance.",
        // Cache info so users understand why requests may be slow
        cacheInfo: {
          isCached: cities.length > 0 && !params.clearAfterProcessing && allProcessedCities.length === 0,
          recommendation: "For faster performance, avoid requesting new data frequently."
        }
      };
    } catch (error) {
      this.logger.error(`Error fetching cities: ${error.message}`, error.stack);
      await this.rabbitMQService.publishLogEvent({
        level: "error",
        message: "Error fetching cities from GeoDB API",
        metadata: { error: error.message },
      });
      throw error;
    }
  }

  /**
   * Process and store cities in the database
   * @param cities - Cities data from GeoDB API
   */
  private async processCities(cities: any[]): Promise<void> {
    if (!cities || cities.length === 0) {
      this.logger.warn("No cities to process");
      return;
    }

    this.logger.log(`Processing ${cities.length} cities`);

    // Process in batches for better performance
    const batchSize = 100;
    const batches = Math.ceil(cities.length / batchSize);

    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, cities.length);
      const batch = cities.slice(start, end);

      this.logger.log(
        `Processing batch ${i + 1}/${batches} (${batch.length} cities)`
      );

      // Transform API data to our schema
      const cityDocuments = batch.map((cityData) =>
        this.transformCityData(cityData)
      );

      // Use bulkWrite for performance
      const bulkOps = cityDocuments.map((city) => ({
        updateOne: {
          filter: { cityId: city.cityId },
          update: { $set: city },
          upsert: true,
        },
      }));

      try {
        const result = await this.cityModel.bulkWrite(bulkOps);
        this.logger.log(
          `Batch ${i + 1} processed: ${result.upsertedCount} inserted, ${
            result.modifiedCount
          } updated`
        );
      } catch (error) {
        this.logger.error(
          `Error processing batch ${i + 1}: ${error.message}`,
          error.stack
        );
        await this.rabbitMQService.publishLogEvent({
          level: "error",
          message: "Error processing city batch",
          metadata: { batchNumber: i + 1, error: error.message },
        });
      }
    }

    this.logger.log("City processing completed");
    await this.rabbitMQService.publishLogEvent({
      level: "info",
      message: "City processing completed",
      metadata: { totalCities: cities.length },
    });
  }

  /**
   * Transform city data from API format to our schema
   * @param cityData - City data from GeoDB API
   * @returns City - Transformed city data
   */
  private transformCityData(cityData: any): Partial<City> {
    return {
      cityId: cityData.id,
      name: cityData.name,
      countryCode: cityData.countryCode,
      country: cityData.country,
      regionCode: cityData.regionCode,
      region: cityData.region,
      latitude: cityData.latitude,
      longitude: cityData.longitude,
      population: cityData.population,
      timezone: cityData.timezone,
      wikiDataId: cityData.wikiDataId,
      lastUpdated: new Date(),
    };
  }

  /**
   * Generate Excel file from cities data
   * @param cities - Cities data
   * @returns Buffer - Excel file buffer
   */
  private async generateExcel(cities: any[]): Promise<Buffer> {
    this.logger.log("Generating Excel file");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Cities");

    // Define columns
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Name", key: "name", width: 30 },
      { header: "Country", key: "country", width: 20 },
      { header: "Country Code", key: "countryCode", width: 15 },
      { header: "Region", key: "region", width: 20 },
      { header: "Region Code", key: "regionCode", width: 15 },
      { header: "Latitude", key: "latitude", width: 15 },
      { header: "Longitude", key: "longitude", width: 15 },
      { header: "Population", key: "population", width: 15 },
      { header: "Timezone", key: "timezone", width: 20 },
    ];

    // Add rows
    worksheet.addRows(cities);

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };
    // Generate buffer
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * Get a city by ID
   * @param cityId - City ID
   * @returns Promise<City> - City data
   */
  async getCityById(cityId: number): Promise<City> {
    try {
      this.logger.log(`Getting city with ID: ${cityId}`);

      // Try to get from database first
      const city = await this.cityModel.findOne({ cityId }).exec();

      if (city) {
        return city;
      }

      // If not in database, fetch from API
      this.logger.log(`City ${cityId} not found in database, fetching from API`);
      
      try {
        const apiCity = await this.geoDBService.getCityById(cityId.toString());

        if (!apiCity || !apiCity.data) {
          this.logger.warn(`City ${cityId} not found in API`);
          return null;
        }

        const cityData = this.transformCityData(apiCity.data);
        const newCity = new this.cityModel(cityData);
        await newCity.save();

        return newCity;
      } catch (apiError) {
        this.logger.error(`Error fetching city ${cityId} from API: ${apiError.message}`, apiError.stack);
        throw new Error(`Failed to fetch city data from API: ${apiError.message}`);
      }
    } catch (error) {
      this.logger.error(`Error in getCityById: ${error.message}`, error.stack);
      throw error;
    }
  }
}
