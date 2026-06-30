import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateReportDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  @IsUUID('4')
  @IsNotEmpty()
  reportedUserId: string;

  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000000' })
  @IsOptional()
  @IsUUID('4')
  messageId?: string;

  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000000' })
  @IsOptional()
  @IsUUID('4')
  directConversationId?: string;

  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000000' })
  @IsOptional()
  @IsUUID('4')
  groupId?: string;

  @ApiProperty({ example: 'harassment' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reason: string;

  @ApiPropertyOptional({ example: 'Detailed description' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}
