import { Controller, Get, Query, Param, Post, Body, UseInterceptors, Logger, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { LogsService } from './logs.service';
import { LogQueryDto } from './dto/log-query.dto';
import { LogResponseDto, LogAggregationResponseDto } from './dto/log-response.dto';

@ApiTags('logs')
@Controller('logs')
export class LogsController {
  private readonly logger = new Logger(LogsController.name);

  constructor(private readonly logsService: LogsService) {}

  @Get()
  @ApiOperation({ summary: 'Query logs with filters, pagination, and sorting' })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns log entries matching the query criteria', 
    type: LogResponseDto 
  })
  async queryLogs(@Query() queryDto: LogQueryDto): Promise<LogResponseDto> {
    this.logger.debug(`Querying logs with filters: ${JSON.stringify(queryDto)}`);
    try {
      return await this.logsService.queryLogs(queryDto);
    } catch (error) {
      this.logger.error(`Error querying logs: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to query logs',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single log entry by ID' })
  @ApiParam({ name: 'id', description: 'Log entry ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns the log entry with the specified ID' 
  })
  @ApiResponse({ status: 404, description: 'Log entry not found' })
  async getLogById(@Param('id') id: string): Promise<any> {
    this.logger.debug(`Getting log entry with ID: ${id}`);
    try {
      const log = await this.logsService.getLogById(id);
      if (!log) {
        throw new HttpException('Log entry not found', HttpStatus.NOT_FOUND);
      }
      return log;
    } catch (error) {
      if (error.status === HttpStatus.NOT_FOUND) {
        throw error;
      }
      this.logger.error(`Error getting log entry: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to retrieve log entry',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('stats/by-endpoint')
  @ApiOperation({ summary: 'Get request count by endpoint' })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns request counts grouped by endpoint',
    type: LogAggregationResponseDto
  })
  async getRequestCountByEndpoint(@Query() queryDto: LogQueryDto): Promise<LogAggregationResponseDto> {
    try {
      return await this.logsService.getRequestCountByEndpoint(queryDto);
    } catch (error) {
      this.logger.error(`Error getting request count by endpoint: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to generate endpoint statistics',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('stats/response-time')
  @ApiOperation({ summary: 'Get average response time by endpoint' })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns average response times grouped by endpoint',
    type: LogAggregationResponseDto
  })
  async getAvgResponseTimeByEndpoint(@Query() queryDto: LogQueryDto): Promise<LogAggregationResponseDto> {
    try {
      return await this.logsService.getAvgResponseTimeByEndpoint(queryDto);
    } catch (error) {
      this.logger.error(`Error getting average response time: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to generate response time statistics',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('stats/error-rate')
  @ApiOperation({ summary: 'Get error rate by endpoint and status code' })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns error rates grouped by endpoint and status code',
    type: LogAggregationResponseDto
  })
  async getErrorRateByEndpoint(@Query() queryDto: LogQueryDto): Promise<LogAggregationResponseDto> {
    try {
      return await this.logsService.getErrorRateByEndpoint(queryDto);
    } catch (error) {
      this.logger.error(`Error getting error rate: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to generate error rate statistics',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('stats/request-volume')
  @ApiOperation({ summary: 'Get request volume over time intervals' })
  @ApiQuery({ name: 'interval', enum: ['hourly', 'daily', 'weekly'], required: true })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns request volumes over time',
    type: LogAggregationResponseDto
  })
  async getRequestVolumeOverTime(
    @Query() queryDto: LogQueryDto,
    @Query('interval') interval: 'hourly' | 'daily' | 'weekly'
  ): Promise<LogAggregationResponseDto> {
    try {
      return await this.logsService.getRequestVolumeOverTime(queryDto, interval);
    } catch (error) {
      this.logger.error(`Error getting request volume: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to generate request volume statistics',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('stats/peak-usage')
  @ApiOperation({ summary: 'Get peak usage periods' })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns peak usage periods',
    type: LogAggregationResponseDto
  })
  async getPeakUsagePeriods(@Query() queryDto: LogQueryDto): Promise<LogAggregationResponseDto> {
    try {
      return await this.logsService.getPeakUsagePeriods(queryDto);
    } catch (error) {
      this.logger.error(`Error getting peak usage periods: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to generate peak usage statistics',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  
  @Post('export')
  @ApiOperation({ summary: 'Export log data in various formats' })
  @ApiQuery({ name: 'format', enum: ['json', 'csv'], required: true })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns exported log data in the requested format'
  })
  async exportLogs(
    @Body() queryDto: LogQueryDto,
    @Query('format') format: 'json' | 'csv'
  ): Promise<any> {
    try {
      return await this.logsService.exportLogs(queryDto, format);
    } catch (error) {
      this.logger.error(`Error exporting logs: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to export logs',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}