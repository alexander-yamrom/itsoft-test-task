import { Controller, Get, Query, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LogsService } from '../modules/logs/logs.service';

@ApiTags('events')
@Controller('events')
export class EventsQueryController {
  constructor(private readonly logsService: LogsService) {}

  @Get('day')
  @ApiOperation({ summary: 'Get events for a specific day' })
  @ApiQuery({ name: 'date', required: false, description: 'Date in ISO format (YYYY-MM-DD)' })
  @ApiQuery({ name: 'service', required: false, description: 'Filter by service name' })
  @ApiQuery({ name: 'level', required: false, description: 'Filter by log level' })
  @ApiResponse({ status: 200, description: 'Returns events for the specified day' })
  @ApiResponse({ status: 400, description: 'Invalid date format' })
  async getEventsForDay(
    @Query('date') dateStr?: string,
    @Query('service') service?: string,
    @Query('level') level?: string,
  ) {
    try {
      if (!dateStr) {
        // Default to today
        dateStr = new Date().toISOString().split('T')[0];
      }
      
      // Parse the date string (expected format: YYYY-MM-DD)
      const parsedDate = new Date(dateStr);
      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Invalid date format. Expected YYYY-MM-DD');
      }
      
      // Use the LogsService to get logs for the day
      return this.logsService.getLogsByDay(dateStr);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to retrieve events: ${error.message}`);
    }
  }

  @Get('range')
  @ApiOperation({ summary: 'Get events for a date range' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date in ISO format (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date in ISO format (YYYY-MM-DD)' })
  @ApiQuery({ name: 'service', required: false, description: 'Filter by service name' })
  @ApiQuery({ name: 'level', required: false, description: 'Filter by log level' })
  @ApiResponse({ status: 200, description: 'Returns events for the specified date range' })
  @ApiResponse({ status: 400, description: 'Invalid date format or range' })
  async getEventsForRange(
    @Query('startDate') startDateStr: string,
    @Query('endDate') endDateStr: string,
    @Query('service') service?: string,
    @Query('level') level?: string,
  ) {
    try {
      // Parse the date strings
      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);
      
      if (isNaN(startDate.getTime())) {
        throw new BadRequestException('Invalid start date format. Expected YYYY-MM-DD');
      }
      
      if (isNaN(endDate.getTime())) {
        throw new BadRequestException('Invalid end date format. Expected YYYY-MM-DD');
      }
      
      if (startDate > endDate) {
        throw new BadRequestException('Start date must be before end date');
      }
      
      // Use the LogsService to get logs for the date range
      return this.logsService.getLogsByDateRange(startDateStr, endDateStr);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to retrieve events: ${error.message}`);
    }
  }
} 