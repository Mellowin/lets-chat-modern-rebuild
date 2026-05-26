import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListMessagesQueryDto {
  @ApiProperty({ required: false, example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseInt(value, 10) : value,
  )
  limit?: number = 50;

  @ApiProperty({
    required: false,
    example: '2026-05-13T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  before?: string;
}
