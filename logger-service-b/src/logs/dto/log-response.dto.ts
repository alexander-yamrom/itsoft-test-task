import { Exclude, Expose, Transform } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export enum EventType {
  REQUEST = 'request',
  RESPONSE = 'response',
  ERROR = 'error',
  INFO = 'info',
  WARNING = 'warning',
  DEBUG = 'debug'
}

export class LogEntryDto {
  @Expose()
  @IsString()
  _id: string;

  @Expose()
  @IsDateString()
  timestamp: string;

  @Expose()
  @IsEnum(EventType)
  eventType: EventType;

  @Expose()
  @IsString()
  serviceId: string;

  @Expose()
  @IsString()
  @IsOptional()
  correlationId?: string;

  @Expose()
  @IsString()
  @IsOptional()
  endpointPath?: string;

  @Expose()
  @IsString()
  @IsOptional()
  method?: string;

  @Expose()
  @IsInt()
  @IsOptional()
  statusCode?: number;

  @Expose()
  @IsNumber()
  @IsOptional()
  executionTime?: number;

  @Expose()
  @IsObject()
  @IsOptional()
  requestData?: Record<string, any>;

  @Expose()
  @IsObject()
  @IsOptional()
  responseData?: Record<string, any>;

  @Expose()
  @IsObject()
  @IsOptional()
  errorDetails?: {
    message: string;
    stack?: string;
    code?: string;
  };

  @Expose()
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  // This constructor transforms any plain object into a LogEntryDto instance
  constructor(partial: Partial<LogEntryDto>) {
    Object.assign(this, partial);
  }
}

export class PaginationMetaDto {
  @Expose()
  @IsInt()
  totalItems: number;

  @Expose()
  @IsInt()
  itemCount: number;

  @Expose()
  @IsInt()
  itemsPerPage: number;

  @Expose()
  @IsInt()
  totalPages: number;

  @Expose()
  @IsInt()
  currentPage: number;
}

export class LogResponseDto {
  @Expose()
  @IsArray()
  @Transform(({ value }) => 
    value.map(item => new LogEntryDto(item))
  )
  items: LogEntryDto[];

  @Expose()
  @IsObject()
  meta: PaginationMetaDto;

  constructor(items: Partial<LogEntryDto>[], meta: PaginationMetaDto) {
    this.items = items.map(item => new LogEntryDto(item));
    this.meta = meta;
  }

  // Static factory method for easy creation
  static create(
    items: Partial<LogEntryDto>[], 
    totalItems: number,
    currentPage: number,
    itemsPerPage: number
  ): LogResponseDto {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    const meta: PaginationMetaDto = {
      totalItems,
      itemCount: items.length,
      itemsPerPage,
      totalPages,
      currentPage
    };

    return new LogResponseDto(items, meta);
  }
}

// Additional DTO for aggregated responses
export class LogAggregationResponseDto {
  @Expose()
  @IsArray()
  data: Record<string, any>[];

  @Expose()
  @IsObject()
  @IsOptional()
  metadata?: {
    timeFrame?: string;
    groupBy?: string;
    filters?: Record<string, any>;
  };

  constructor(data: Record<string, any>[], metadata?: Record<string, any>) {
    this.data = data;
    this.metadata = metadata;
  }
}