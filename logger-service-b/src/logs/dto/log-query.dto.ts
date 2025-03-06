import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsDateString, IsArray, Min, Max, ValidateNested, IsBoolean } from 'class-validator';

export enum EventType {
  REQUEST = 'request',
  RESPONSE = 'response',
  ERROR = 'error',
  INFO = 'info',
  WARNING = 'warning',
  DEBUG = 'debug'
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

export class DateRangeDto {
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class SortingDto {
  @IsString()
  field: string;

  @IsEnum(SortOrder)
  order: SortOrder;
}

export class LogQueryDto {
  // Date range filtering
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeDto)
  dateRange?: DateRangeDto;

  // Event type filtering
  @IsOptional()
  @IsEnum(EventType, { each: true })
  eventTypes?: EventType[];

  // Service identifier
  @IsOptional()
  @IsString()
  serviceId?: string;

  // API endpoint path (supports partial matching)
  @IsOptional()
  @IsString()
  endpointPath?: string;

  // Response status code filtering
  @IsOptional()
  @IsInt({ each: true })
  statusCodes?: number[];

  // Execution time threshold in milliseconds
  @IsOptional()
  @IsInt()
  @Min(0)
  minExecutionTime?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxExecutionTime?: number;

  // Correlation ID for request tracing
  @IsOptional()
  @IsString()
  correlationId?: string;

  // Pagination
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  // Sorting
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SortingDto)
  sort?: SortingDto[] = [{ field: 'timestamp', order: SortOrder.DESC }];

  // Field projection - specify which fields to include in the response
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fields?: string[];

  // Include count of total matching documents
  @IsOptional()
  @IsBoolean()
  includeCount?: boolean = true;
}
