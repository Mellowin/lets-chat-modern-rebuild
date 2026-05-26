import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class SearchMessagesQueryDto {
  @ApiProperty({ example: 'hello world' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  q: string;

  @ApiPropertyOptional({ example: '19ffa642-dbb6-4bfd-be0f-c971e11a2cb0' })
  @IsOptional()
  @IsUUID()
  channelId?: string;

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
}
