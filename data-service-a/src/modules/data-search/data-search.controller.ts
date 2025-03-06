import {
  Controller,
  Get,
  Query,
  Res,
  HttpStatus,
  Logger,
  ValidationPipe,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from "@nestjs/swagger";
import { Response } from "express";
import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from "class-validator";
import { Type } from "class-transformer";
import { DataSearchService } from "./data-search.service";
import { RabbitMQService } from "../event-publishing/rabbitmq.service";

class SearchCitiesDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  countryCode?: string;

  @IsString()
  @IsOptional()
  regionCode?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minPopulation?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxPopulation?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit: number = 10;

  @IsString()
  @IsOptional()
  sortBy: string = "name";

  @IsEnum(["asc", "desc"])
  @IsOptional()
  sortOrder: "asc" | "desc" = "asc";

  @IsString()
  @IsOptional()
  fields?: string;
}

@ApiTags("data-search")
@Controller("data-search")
export class DataSearchController {
  private readonly logger = new Logger(DataSearchController.name);

  constructor(
    private readonly dataSearchService: DataSearchService,
    private readonly rabbitMQService: RabbitMQService
  ) {}

  @Get("cities")
  @ApiOperation({ summary: "Search cities with various filters" })
  @ApiResponse({ status: 200, description: "Cities found" })
  @ApiResponse({ status: 400, description: "Invalid request parameters" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @ApiQuery({
    name: "name",
    description: "City name (partial match)",
    required: false,
  })
  @ApiQuery({
    name: "countryCode",
    description: "Country code (ISO 3166-1 alpha-2)",
    required: false,
  })
  @ApiQuery({ name: "regionCode", description: "Region code", required: false })
  @ApiQuery({
    name: "minPopulation",
    description: "Minimum population",
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: "maxPopulation",
    description: "Maximum population",
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: "page",
    description: "Page number",
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: "limit",
    description: "Results per page",
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: "sortBy",
    description: "Field to sort by",
    required: false,
  })
  @ApiQuery({
    name: "sortOrder",
    description: "Sort order",
    required: false,
    enum: ["asc", "desc"],
  })
  @ApiQuery({
    name: "fields",
    description: "Fields to include in the response (comma-separated)",
    required: false,
  })
  async searchCities(
    @Query(new ValidationPipe({ transform: true })) query: SearchCitiesDto,
    @Res() res: Response
  ) {
    try {
      this.logger.log(
        `Received search request with params: ${JSON.stringify(query)}`
      );

      // Log the operation
      await this.rabbitMQService.publishLogEvent({
        level: "info",
        message: "City search request received",
        metadata: { params: query },
      });

      // Parse fields if provided
      const fields = query.fields ? query.fields.split(",") : undefined;

      // Search cities
      const result = await this.dataSearchService.searchCities({
        ...query,
        fields,
      });

      return res.status(HttpStatus.OK).json({
        success: true,
        ...result,
      });
    } catch (error) {
      this.logger.error(
        `Error searching cities: ${error.message}`,
        error.stack
      );

      // Log the error
      await this.rabbitMQService.publishLogEvent({
        level: "error",
        message: "Error searching cities",
        metadata: { error: error.message, params: query },
      });

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Error searching cities",
        error: error.message,
      });
    }
  }

  @Get("stats/by-country")
  @ApiOperation({ summary: "Get city statistics by country" })
  @ApiResponse({
    status: 200,
    description: "Statistics retrieved successfully",
  })
  @ApiResponse({ status: 500, description: "Internal server error" })
  async getCityStatsByCountry(@Res() res: Response) {
    try {
      this.logger.log("Received request for city statistics by country");

      // Log the operation
      await this.rabbitMQService.publishLogEvent({
        level: "info",
        message: "City statistics request received",
      });

      // Get statistics
      const stats = await this.dataSearchService.getCityStatsByCountry();

      return res.status(HttpStatus.OK).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      this.logger.error(
        `Error getting city statistics: ${error.message}`,
        error.stack
      );

      // Log the error
      await this.rabbitMQService.publishLogEvent({
        level: "error",
        message: "Error getting city statistics",
        metadata: { error: error.message },
      });

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Error getting city statistics",
        error: error.message,
      });
    }
  }
}
