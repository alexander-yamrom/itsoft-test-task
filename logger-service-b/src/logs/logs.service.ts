import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Log, LogDocument } from './entities/log.entity';
import { LogQueryDto } from './dto/log-query.dto';
import { LogResponseDto, LogAggregationResponseDto } from './dto/log-response.dto';

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(
    @InjectModel(Log.name) private logModel: Model<LogDocument>,
  ) {}

  async queryLogs(queryDto: LogQueryDto): Promise<LogResponseDto> {
    const { 
      dateRange, 
      eventTypes, 
      serviceId, 
      endpointPath, 
      statusCodes, 
      minExecutionTime, 
      maxExecutionTime, 
      correlationId,
      page = 1, 
      limit = 20, 
      sort = [{ field: 'timestamp', order: 'desc' }],
      fields,
      includeCount = true 
    } = queryDto;

    // Build query filter
    const filter: any = {};

    if (dateRange) {
      filter.timestamp = {};
      if (dateRange.startDate) {
        filter.timestamp.$gte = new Date(dateRange.startDate);
      }
      if (dateRange.endDate) {
        filter.timestamp.$lte = new Date(dateRange.endDate);
      }
    }

    if (eventTypes && eventTypes.length > 0) {
      filter.eventType = { $in: eventTypes };
    }

    if (serviceId) {
      filter.serviceId = serviceId;
    }

    if (endpointPath) {
      filter.endpointPath = { $regex: endpointPath, $options: 'i' };
    }

    if (statusCodes && statusCodes.length > 0) {
      filter.statusCode = { $in: statusCodes };
    }

    if (minExecutionTime !== undefined || maxExecutionTime !== undefined) {
      filter.executionTime = {};
      if (minExecutionTime !== undefined) {
        filter.executionTime.$gte = minExecutionTime;
      }
      if (maxExecutionTime !== undefined) {
        filter.executionTime.$lte = maxExecutionTime;
      }
    }

    if (correlationId) {
      filter.correlationId = correlationId;
    }

    // Build sort options
    const sortOptions: any = {};
    sort.forEach((sortItem) => {
      sortOptions[sortItem.field] = sortItem.order === 'asc' ? 1 : -1;
    });

    // Build projection for field selection
    const projection: any = {};
    if (fields && fields.length > 0) {
      fields.forEach((field) => {
        projection[field] = 1;
      });
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const items = await this.logModel
      .find(filter, projection)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    // Get total count if requested
    let totalItems = 0;
    if (includeCount) {
      totalItems = await this.logModel.countDocuments(filter).exec();
    } else {
      // If count not requested, estimate based on current results
      totalItems = items.length === limit ? page * limit + 1 : page * limit;
    }

    return LogResponseDto.create(items, totalItems, page, limit);
  }

  async getLogById(id: string): Promise<any> {
    return this.logModel.findById(id).lean().exec();
  }

  async getRequestCountByEndpoint(queryDto: LogQueryDto): Promise<LogAggregationResponseDto> {
    const { dateRange, serviceId } = queryDto;

    const filter: any = {
      eventType: 'request'
    };

    if (dateRange) {
      filter.timestamp = {};
      if (dateRange.startDate) {
        filter.timestamp.$gte = new Date(dateRange.startDate);
      }
      if (dateRange.endDate) {
        filter.timestamp.$lte = new Date(dateRange.endDate);
      }
    }

    if (serviceId) {
      filter.serviceId = serviceId;
    }

    const result = await this.logModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$endpointPath",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          endpointPath: "$_id",
          count: 1
        }
      },
      { $sort: { count: -1 } }
    ]).exec();

    return new LogAggregationResponseDto(result, {
      timeFrame: dateRange ? `${dateRange.startDate} to ${dateRange.endDate}` : 'all time',
      filters: { serviceId }
    });
  }

  async getAvgResponseTimeByEndpoint(queryDto: LogQueryDto): Promise<LogAggregationResponseDto> {
    const { dateRange, serviceId } = queryDto;

    const filter: any = {
      eventType: 'response',
      executionTime: { $exists: true }
    };

    if (dateRange) {
      filter.timestamp = {};
      if (dateRange.startDate) {
        filter.timestamp.$gte = new Date(dateRange.startDate);
      }
      if (dateRange.endDate) {
        filter.timestamp.$lte = new Date(dateRange.endDate);
      }
    }

    if (serviceId) {
      filter.serviceId = serviceId;
    }

    const result = await this.logModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$endpointPath",
          avgResponseTime: { $avg: "$executionTime" },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          endpointPath: "$_id",
          avgResponseTime: { $round: ["$avgResponseTime", 2] },
          count: 1
        }
      },
      { $sort: { avgResponseTime: -1 } }
    ]).exec();

    return new LogAggregationResponseDto(result, {
      timeFrame: dateRange ? `${dateRange.startDate} to ${dateRange.endDate}` : 'all time',
      filters: { serviceId }
    });
  }

  async getErrorRateByEndpoint(queryDto: LogQueryDto): Promise<LogAggregationResponseDto> {
    const { dateRange, serviceId } = queryDto;

    const filter: any = {
      eventType: 'response'
    };

    if (dateRange) {
      filter.timestamp = {};
      if (dateRange.startDate) {
        filter.timestamp.$gte = new Date(dateRange.startDate);
      }
      if (dateRange.endDate) {
        filter.timestamp.$lte = new Date(dateRange.endDate);
      }
    }

    if (serviceId) {
      filter.serviceId = serviceId;
    }

    const result = await this.logModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            endpointPath: "$endpointPath",
            statusCode: "$statusCode"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.endpointPath",
          totalRequests: { $sum: "$count" },
          statusCodes: {
            $push: {
              statusCode: "$_id.statusCode",
              count: "$count"
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          endpointPath: "$_id",
          totalRequests: 1,
          statusCodes: 1,
          errorRate: {
            $multiply: [
              {
                $divide: [
                  {
                    $sum: {
                      $filter: {
                        input: "$statusCodes",
                        as: "status",
                        cond: { $gte: ["$$status.statusCode", 400] }
                      }
                    }
                  },
                  "$totalRequests"
                ]
              },
              100
            ]
          }
        }
      },
      { $sort: { errorRate: -1 } }
    ]).exec();

    return new LogAggregationResponseDto(result, {
      timeFrame: dateRange ? `${dateRange.startDate} to ${dateRange.endDate}` : 'all time',
      filters: { serviceId }
    });
  }

  async getRequestVolumeOverTime(
    queryDto: LogQueryDto, 
    interval: 'hourly' | 'daily' | 'weekly'
  ): Promise<LogAggregationResponseDto> {
    const { dateRange, serviceId, eventTypes } = queryDto;

    const filter: any = {};

    if (eventTypes && eventTypes.length > 0) {
      filter.eventType = { $in: eventTypes };
    } else {
      filter.eventType = 'request';
    }

    if (dateRange) {
      filter.timestamp = {};
      if (dateRange.startDate) {
        filter.timestamp.$gte = new Date(dateRange.startDate);
      }
      if (dateRange.endDate) {
        filter.timestamp.$lte = new Date(dateRange.endDate);
      }
    }

    if (serviceId) {
      filter.serviceId = serviceId;
    }

    // Define time grouping format based on interval
    let timeFormat;
    let groupByFormat;

    switch (interval) {
      case 'hourly':
        timeFormat = '%Y-%m-%d %H:00';
        groupByFormat = {
          year: { $year: "$timestamp" },
          month: { $month: "$timestamp" },
          day: { $dayOfMonth: "$timestamp" },
          hour: { $hour: "$timestamp" }
        };
        break;
      case 'daily':
        timeFormat = '%Y-%m-%d';
        groupByFormat = {
          year: { $year: "$timestamp" },
          month: { $month: "$timestamp" },
          day: { $dayOfMonth: "$timestamp" }
        };
        break;
      case 'weekly':
        timeFormat = '%Y-%U';
        groupByFormat = {
          year: { $year: "$timestamp" },
          week: { $week: "$timestamp" }
        };
        break;
    }

    const result = await this.logModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: groupByFormat,
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          timeFrame: {
            $dateToString: {
              format: timeFormat,
              date: {
                $dateFromParts: {
                  ...groupByFormat
                }
              }
            }
          },
          count: 1
        }
      },
      { $sort: { timeFrame: 1 } }
    ]).exec();

    return new LogAggregationResponseDto(result, {
      timeFrame: dateRange ? `${dateRange.startDate} to ${dateRange.endDate}` : 'all time',
      interval,
      filters: { serviceId, eventTypes }
    });
  }

  async getPeakUsagePeriods(queryDto: LogQueryDto): Promise<LogAggregationResponseDto> {
    const { dateRange, serviceId } = queryDto;

    const filter: any = {
      eventType: 'request'
    };

    if (dateRange) {
      filter.timestamp = {};
      if (dateRange.startDate) {
        filter.timestamp.$gte = new Date(dateRange.startDate);
      }
      if (dateRange.endDate) {
        filter.timestamp.$lte = new Date(dateRange.endDate);
      }
    }

    if (serviceId) {
      filter.serviceId = serviceId;
    }

    // Group by hour of day and day of week to find peak usage patterns
    const result = await this.logModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            hourOfDay: { $hour: "$timestamp" },
            dayOfWeek: { $dayOfWeek: "$timestamp" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          hourOfDay: "$_id.hourOfDay",
          dayOfWeek: "$_id.dayOfWeek",
          count: 1
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).exec();

    // Convert dayOfWeek to more readable format (1=Sunday, 2=Monday, etc.)
    const daysOfWeek = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
    ];

    const formattedResult = result.map(item => ({
      ...item,
      dayOfWeek: daysOfWeek[item.dayOfWeek - 1],
      hourFormatted: `${item.hourOfDay}:00 - ${item.hourOfDay + 1}:00`
    }));

    return new LogAggregationResponseDto(formattedResult, {
      timeFrame: dateRange ? `${dateRange.startDate} to ${dateRange.endDate}` : 'all time',
      filters: { serviceId }
    });
  }

  async exportLogs(queryDto: LogQueryDto, format: 'json' | 'csv'): Promise<any> {
    // Remove pagination to get all matching logs
    const exportQueryDto = { ...queryDto, page: 1, limit: 10000 };
    const logs = await this.queryLogs(exportQueryDto);
    
    if (format === 'csv') {
      // Convert logs to CSV format
      const items = logs.items;
      if (items.length === 0) {
        return '';
      }
      
      // Get headers from first item
      const headers = Object.keys(items[0]);
      const csvRows = [
        headers.join(','),
        ...items.map(item => {
          return headers.map(header => {
            const value = item[header];
            // Handle nested objects
            if (typeof value === 'object' && value !== null) {
              return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
            }
            // Handle strings with commas
            if (typeof value === 'string' && value.includes(',')) {
              return `"${value}"`;
            }
            return value;
          }).join(',');
        })
      ];
      
      return csvRows.join('\n');
    }
    
    // Default to JSON
    return logs.items;
  }
}