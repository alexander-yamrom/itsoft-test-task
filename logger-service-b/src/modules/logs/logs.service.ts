import { Injectable, Logger } from '@nestjs/common';
import { LogEvent } from '../../interfaces/log-event.interface';
import { RedisTimeSeriesService } from '../storage/redis-timeseries.service';

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(
    private readonly redisTimeSeriesService: RedisTimeSeriesService
  ) {}

  async getLogsByDay(date: string): Promise<{
    success: boolean;
    data: LogEvent[];
    count: number;
    date: string;
    error?: string;
  }> {
    try {
      this.logger.debug(`Getting logs for day: ${date}`);
      const logs = await this.redisTimeSeriesService.getLogsByDay(date);
      return {
        success: true,
        data: logs,
        count: logs.length,
        date
      };
    } catch (error) {
      this.logger.error(`Error getting logs for day ${date}: ${error.message}`);
      return {
        success: false,
        data: [],
        count: 0,
        date,
        error: error.message
      };
    }
  }

  async getLogsByType(type: string): Promise<{
    success: boolean;
    data: LogEvent[];
    count: number;
    type: string;
    error?: string;
  }> {
    try {
      this.logger.debug(`Getting logs for type: ${type}`);
      const logs = await this.redisTimeSeriesService.getLogsByType(type);
      return {
        success: true,
        data: logs,
        count: logs.length,
        type
      };
    } catch (error) {
      this.logger.error(`Error getting logs for type ${type}: ${error.message}`);
      return {
        success: false,
        data: [],
        count: 0,
        type,
        error: error.message
      };
    }
  }

  async getLogsByDateRange(startDate: string, endDate: string): Promise<{
    success: boolean;
    data: LogEvent[];
    count: number;
    startDate: string;
    endDate: string;
    error?: string;
  }> {
    try {
      this.logger.debug(`Getting logs for date range: ${startDate} to ${endDate}`);
      const logs = await this.redisTimeSeriesService.getLogsByDateRange(startDate, endDate);
      return {
        success: true,
        data: logs,
        count: logs.length,
        startDate,
        endDate
      };
    } catch (error) {
      this.logger.error(`Error getting logs for date range ${startDate} to ${endDate}: ${error.message}`);
      return {
        success: false,
        data: [],
        count: 0,
        startDate,
        endDate,
        error: error.message
      };
    }
  }
} 