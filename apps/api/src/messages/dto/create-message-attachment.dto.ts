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
import { ALLOWED_MIME_TYPES } from './presign-attachment.dto';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachment-validation';

export class CreateMessageAttachmentDto {
  @ApiProperty({ example: 'attachments/user-id/uuid-file.png' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  storageKey: string;

  @ApiProperty({ example: 'file.png' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @IsIn(ALLOWED_MIME_TYPES)
  mimeType: string;

  @ApiProperty({ example: 1234 })
  @IsInt()
  @Min(1)
  @Max(MAX_ATTACHMENT_SIZE_BYTES)
  sizeBytes: number;

  @ApiProperty({ example: 'image', enum: ['image', 'file'] })
  @IsString()
  @IsIn(['image', 'file'])
  kind: 'image' | 'file';
}
