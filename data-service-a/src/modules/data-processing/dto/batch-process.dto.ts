import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsPositive, Max, ValidateNested } from 'class-validator';

/**
 * DTO for batch processing cities
 */
export class BatchProcessCitiesDto {
  /**
   * Optional filter for selecting cities to process
   * @example { "country": "US" }
   */
  @ApiProperty({
    description: 'Filter to apply for selecting cities',
    required: false,
    example: { country: 'US' },
  })
  @IsObject()
  @IsOptional()
  filter?: Record<string, unknown> = {};

  /**
   * Optional limit for the number of cities to process
   * @example 100
   */
  @ApiProperty({
    description: 'Maximum number of cities to process',
    required: false,
    example: 100,
    default: 100,
  })
  @IsPositive({ message: 'Limit must be a positive number' })
  @Max(1000, { message: 'Limit cannot exceed 1000 for performance reasons' })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 100;
} 