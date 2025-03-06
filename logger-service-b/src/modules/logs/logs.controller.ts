import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { LogsService } from './logs.service';
import { IsDateString, IsString } from 'class-validator';

class QueryLogsByDayDto {
  @IsDateString()
  date: string;
}

class QueryLogsByDateRangeDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

class QueryLogsByTypeDto {
  @IsString()
  type: string;
}

@ApiTags('logs')
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get('day')
  @ApiOperation({ summary: 'Get logs for a specific day' })
  @ApiQuery({ name: 'date', description: 'Date in YYYY-MM-DD format', required: true })
  @ApiResponse({ status: 200, description: 'Returns logs for the specified day' })
  async getLogsByDay(@Query(ValidationPipe) query: QueryLogsByDayDto) {
    return this.logsService.getLogsByDay(query.date);
  }

  @Get('range')
  @ApiOperation({ summary: 'Get logs for a date range' })
  @ApiQuery({ name: 'startDate', description: 'Start date in YYYY-MM-DD format', required: true })
  @ApiQuery({ name: 'endDate', description: 'End date in YYYY-MM-DD format', required: true })
  @ApiResponse({ status: 200, description: 'Returns logs for the specified date range' })
  async getLogsByDateRange(@Query(ValidationPipe) query: QueryLogsByDateRangeDto) {
    return this.logsService.getLogsByDateRange(query.startDate, query.endDate);
  }

  @Get('type')
  @ApiOperation({ summary: 'Get logs by type' })
  @ApiQuery({ name: 'type', description: 'Type of logs to get', required: true })
  @ApiResponse({ status: 200, description: 'Returns logs for the specified type' })
  async getLogsByType(@Query(ValidationPipe) query: QueryLogsByTypeDto) {
    return this.logsService.getLogsByType(query.type);
  }
} 