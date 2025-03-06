import { IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';

/**
 * HTTP-request data storage structure
 */
export class HttpRequestDto {
  @IsString()
  @IsOptional()
  method?: string;

  @IsString()
  @IsOptional()
  path?: string;

  @IsObject()
  @IsOptional()
  query?: Record<string, any>;

  @IsObject()
  @IsOptional()
  body?: Record<string, any>;

  @IsObject()
  @IsOptional()
  params?: Record<string, any>;

  @IsObject()
  @IsOptional()
  headers?: Record<string, any>;

  @IsString()
  @IsOptional()
  ip?: string;
}

/**
 * Base DTO for all events published to RabbitMQ
 */
export class BaseEventDto {
  @IsString()
  @IsNotEmpty()
  service: string = 'data-service-a';

  @IsString()
  @IsOptional()
  correlationId?: string;

  @IsNotEmpty()
  timestamp: Date = new Date();

  @IsObject()
  @IsOptional()
  httpRequest?: HttpRequestDto;
} 