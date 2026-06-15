import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchGlobalMessagesQueryDto {
  @ApiPropertyOptional({ example: 'ку' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  q: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return 20;
    return Number(value);
  })
  limit?: number;

  @ApiPropertyOptional({
    example: '55555555-5555-5555-5555-555555555555',
    description: 'Pagination cursor (message id)',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
