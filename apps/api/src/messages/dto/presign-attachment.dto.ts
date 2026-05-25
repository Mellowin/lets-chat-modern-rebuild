import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
] as const;

export class PresignAttachmentDto {
  @ApiProperty({ example: 'document.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  filename: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @IsIn(ALLOWED_MIME_TYPES)
  mimeType: string;

  @ApiProperty({ example: 123456 })
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes: number;
}
