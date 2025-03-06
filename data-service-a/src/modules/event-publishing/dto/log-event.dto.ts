import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { BaseEventDto, HttpRequestDto } from '../base-event.dto';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Log levels enum for log events
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * DTO for log events
 */
export class LogEventDto extends BaseEventDto {
  /**
   * Log level
   */
  @IsEnum(LogLevel)
  @IsNotEmpty()
  @ApiProperty({
    enum: LogLevel,
    description: 'Log level (debug, info, warn, error)',
    example: LogLevel.INFO,
  })
  level: LogLevel;

  /**
   * Log message
   */
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Log message text',
    example: 'Operation completed successfully',
  })
  message: string;

  /**
   * Additional metadata for the log
   */
  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Additional metadata for the log',
    example: { userId: 123, action: 'fetch_data' },
    required: false,
  })
  metadata?: Record<string, any>;

  /**
   * Information about the HTTP request that triggered this log
   * Inherited from BaseEventDto but explicitly documented here for clarity
   */
  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Information about the HTTP request that triggered this log',
    type: HttpRequestDto,
    required: false,
  })
  httpRequest?: HttpRequestDto;
} 