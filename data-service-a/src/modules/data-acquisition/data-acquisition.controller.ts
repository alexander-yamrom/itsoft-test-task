import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  HttpStatus,
  Logger,
  UsePipes,
  ValidationPipe,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from "@nestjs/swagger";
import { Response, Request } from "express";
import { DataAcquisitionService } from "./data-acquisition.service";
import { FetchCitiesDto, OutputFormat } from "./dto/fetch-cities.dto";
import { RabbitMQService } from "../event-publishing/rabbitmq.service";
import { CityIdDto } from "./dto/city-id.dto";

@ApiTags("data-acquisition")
@Controller("data-acquisition")
export class DataAcquisitionController {
  private readonly logger = new Logger(DataAcquisitionController.name);

  constructor(
    private readonly dataAcquisitionService: DataAcquisitionService,
    private readonly rabbitMQService: RabbitMQService
  ) {}

  @Post("cities")
  @ApiOperation({ summary: "Fetch cities from GeoDB API" })
  @ApiResponse({ status: 200, description: "Cities fetched successfully" })
  @ApiResponse({ status: 400, description: "Invalid request parameters" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  async fetchCities(
    @Body() fetchCitiesDto: FetchCitiesDto,
    @Res() res: Response,
    @Req() req: Request
  ) {
    try {
      // Generate a correlation ID for current fetch operation
      const correlationId = `fetch-cities-${Date.now()}`;

      // Log the request with correlation ID
      this.logger.log(
        `Received request to fetch cities: ${JSON.stringify(fetchCitiesDto)}`
      );
      await this.rabbitMQService.publishLogEventWithRequest({
        level: "info",
        message: "Received request to fetch cities",
        metadata: { params: fetchCitiesDto },
        correlationId,
      }, req);

      const result = await this.dataAcquisitionService.fetchCities(
        fetchCitiesDto
      );

      await this.rabbitMQService.publishLogEventWithRequest({
        level: "info",
        message: "Cities fetched successfully",
        metadata: {
          count: Array.isArray(result) ? result.length : 'Excel generated',
          format: fetchCitiesDto.format
        },
        correlationId,
      }, req);

      // for Excel format
      if (fetchCitiesDto.format === OutputFormat.EXCEL) {
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=cities.xlsx"
        );
        return res.send(result);
      }

      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
        correlationId: correlationId
      });
    } catch (error) {
      this.logger.error(`Error fetching cities: ${error.message}`, error.stack);
      await this.rabbitMQService.publishLogEventWithRequest({
        level: "error",
        message: `Error fetching cities: ${error.message}`,
        metadata: { error: error.stack },
      }, req);

      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: "Failed to fetch cities", error: error.message });
    }
  }

  @Get("city/:id")
  @ApiOperation({ summary: "Get city by ID" })
  @ApiParam({ name: "id", description: "City ID" })
  @ApiResponse({ status: 200, description: "City found" })
  @ApiResponse({ status: 404, description: "City not found" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getCityById(@Param() params: CityIdDto, @Res() res: Response, @Req() req: Request) {
    try {
      const { id } = params;
      const correlationId = `city-get-${id}-${Date.now()}`;

      const city = await this.dataAcquisitionService.getCityById(id);

      // Log the result with correlation ID
      await this.rabbitMQService.publishLogEventWithRequest({
        level: "info",
        message: city ? `Successfully retrieved city ${id}` : `City ${id} not found`,
        metadata: { cityId: id, found: !!city },
        correlationId: correlationId
      }, req);

      if (!city) {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: `City with ID ${id} not found`,
          correlationId: correlationId
        });
      }

      return res.status(HttpStatus.OK).json({
        success: true,
        data: city,
        correlationId: correlationId
      });
    } catch (error) {
      this.logger.error(
        `Error getting city ${params.id}: ${error.message}`,
        error.stack
      );

      // Use same correlationId for all related error logs
      const errorCorrelationId = `city-error-${params.id}-${Date.now()}`;

      await this.rabbitMQService.publishLogEventWithRequest({
        level: "error",
        message: "Error getting city by ID",
        metadata: { cityId: params.id, error: error.message },
        correlationId: errorCorrelationId
      }, req);

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to get city",
        error: error.message,
        correlationId: errorCorrelationId
      });
    }
  }
}
