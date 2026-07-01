import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportStatus } from './admin-report-query.dto';

export class UpdateAdminReportDto {
  @ApiPropertyOptional({ example: 'REVIEWED' })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ example: 'Internal moderation note' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  adminNote?: string;
}
