import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum OutputFormat {
  JSON = 'json',
  EXCEL = 'excel',
}

export class FetchCitiesDto {
  @ApiProperty({
    description: 'Country code filter (ISO 3166-1 alpha-2)',
    example: 'US',
    required: false,
  })
  @IsString()
  @IsOptional()
  countryCode?: string;

  @ApiProperty({
    description: 'Name prefix filter',
    example: 'New',
    required: false,
  })
  @IsString()
  @IsOptional()
  namePrefix?: string;

  @ApiProperty({
    description: 'Minimum population filter',
    example: 1000000,
    required: false,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  minPopulation?: number;

  @ApiProperty({
    description: 'Maximum number of cities to fetch (Note: BASIC plan is limited to 10 per request and 1 request/sec. Fetching many cities will be slow.)',
    example: 10,
    default: 10,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @ApiProperty({
    description: 'Output format',
    enum: OutputFormat,
    default: OutputFormat.JSON,
    required: false,
  })
  @IsEnum(OutputFormat)
  @IsOptional()
  format?: OutputFormat = OutputFormat.JSON;
} 