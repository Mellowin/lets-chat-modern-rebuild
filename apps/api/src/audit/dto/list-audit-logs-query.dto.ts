import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({ example: 50, default: 50, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  limit?: number = 50;
}
