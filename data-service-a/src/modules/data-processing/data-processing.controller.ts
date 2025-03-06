import { Controller, Post, Body, Param, HttpStatus, Logger, Res, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { DataProcessingService } from './data-processing.service';
import { RabbitMQService } from '../event-publishing/rabbitmq.service';
import { BatchProcessCitiesDto } from './dto/batch-process.dto';
import { LogLevel } from '../event-publishing/dto/log-event.dto';
import { CityIdDto } from '../data-acquisition/dto/city-id.dto';

@ApiTags('data-processing')
@Controller('data-processing')
export class DataProcessingController {
  private readonly logger = new Logger(DataProcessingController.name);

  constructor(
    private readonly dataProcessingService: DataProcessingService,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  @Post('cities/:id/process')
  @ApiOperation({ summary: 'Process a city by ID' })
  @ApiResponse({ status: 200, description: 'City processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid city ID' })
  @ApiResponse({ status: 404, description: 'City not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiParam({ name: 'id', description: 'City ID (positive integer)', type: Number })
  @UsePipes(new ValidationPipe({ transform: true }))
  async processCity(@Param() params: CityIdDto, @Res() res: Response) {
    try {
      const id = params.id;
      this.logger.log(`Received request to process city with ID: ${id}`);
      
      // Generate a correlation ID for this processing request
      const correlationId = `city-process-${id}-${Date.now()}`;
      
      // Log the operation with correlation ID
      await this.rabbitMQService.publishLogEvent({
        level: LogLevel.INFO,
        message: 'Processing city',
        metadata: { cityId: id },
        correlationId: correlationId
      });
      
      // Process the city
      const city = await this.dataProcessingService.processCity(id);
      
      // Log success with the same correlation ID
      await this.rabbitMQService.publishLogEvent({
        level: LogLevel.INFO,
        message: 'City processed successfully',
        metadata: { cityId: id },
        correlationId: correlationId
      });
      
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'City processed successfully',
        data: city,
        correlationId: correlationId
      });
    } catch (error) {
      this.logger.error(`Error processing city ${params.id}: ${error.message}`, error.stack);
      
      // Generate a correlation ID for the error flow
      const errorCorrelationId = `city-process-error-${params.id}-${Date.now()}`;
      
      // Log the error with correlation ID
      await this.rabbitMQService.publishLogEvent({
        level: LogLevel.ERROR,
        message: `Error processing city ${params.id}`,
        metadata: { cityId: params.id, error: error.message },
        correlationId: errorCorrelationId
      });
      
      // Determine the appropriate status code
      const statusCode = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.INTERNAL_SERVER_ERROR;
      
      return res.status(statusCode).json({
        success: false,
        message: error.message,
        correlationId: errorCorrelationId
      });
    }
  }

  @Post('cities/batch-process')
  @ApiOperation({ summary: 'Batch process cities' })
  @ApiResponse({ status: 200, description: 'Cities processed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async batchProcessCities(
    @Body() batchProcessDto: BatchProcessCitiesDto,
    @Res() res: Response,
  ) {
    try {
      const { filter = {}, limit = 100 } = batchProcessDto;
      
      this.logger.log(`Received request to batch process cities with filter: ${JSON.stringify(filter)}, limit: ${limit}`);
      
      // Generate a correlation ID for this batch processing request
      const correlationId = `batch-process-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      
      // Log the operation with correlation ID
      await this.rabbitMQService.publishLogEvent({
        level: LogLevel.INFO,
        message: 'Batch processing cities',
        metadata: { filter, limit },
        correlationId: correlationId
      });
      
      // Process cities
      const result = await this.dataProcessingService.batchProcessCities(filter, limit);
      
      // Log completion with the same correlation ID
      await this.rabbitMQService.publishLogEvent({
        level: LogLevel.INFO,
        message: 'Batch processing completed',
        metadata: { 
          filter, 
          limit, 
          processed: result.processed, 
          errors: result.errors 
        },
        correlationId: correlationId
      });
      
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Batch processing completed',
        data: result,
        correlationId: correlationId
      });
    } catch (error) {
      this.logger.error(`Error in batch processing: ${error.message}`, error.stack);
      
      // Generate correlation ID for error flow
      const errorCorrelationId = `batch-process-error-${Date.now()}`;
      
      // Log the error with correlation ID
      await this.rabbitMQService.publishLogEvent({
        level: LogLevel.ERROR,
        message: 'Error in batch processing',
        metadata: { error: error.message },
        correlationId: errorCorrelationId
      });
      
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error in batch processing',
        error: error.message,
        correlationId: errorCorrelationId
      });
    }
  }
} 