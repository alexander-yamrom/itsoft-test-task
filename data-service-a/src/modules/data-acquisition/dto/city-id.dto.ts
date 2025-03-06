import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CityIdDto {
  @ApiProperty({
    description: 'City ID',
    example: 12345,
    type: Number,
  })
  @IsInt({ message: 'City ID must be an integer' })
  @Min(1, { message: 'City ID must be a positive number' })
  @IsNotEmpty({ message: 'City ID is required' })
  @Type(() => Number)
  id: number;
} 