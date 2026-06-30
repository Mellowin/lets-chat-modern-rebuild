import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateBlockDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({ example: 'Spam' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
