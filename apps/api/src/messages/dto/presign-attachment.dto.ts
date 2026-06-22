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
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '../attachment-validation';

export { ALLOWED_MIME_TYPES };

export class PresignAttachmentDto {
  @ApiProperty({ example: 'document.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  filename: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @IsIn(ALLOWED_MIME_TYPES)
  mimeType: string;

  @ApiProperty({ example: 123456 })
  @IsInt()
  @Min(1)
  @Max(MAX_ATTACHMENT_SIZE_BYTES)
  sizeBytes: number;
}
