import { ApiProperty } from '@nestjs/swagger';

export class UploadAttachmentResponseDto {
  @ApiProperty({ example: 'attachments/u1/uuid-document.pdf' })
  storageKey: string;

  @ApiProperty({ example: 'document.pdf' })
  fileName: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 123456 })
  sizeBytes: number;

  @ApiProperty({ example: 'file', enum: ['image', 'file'] })
  kind: 'image' | 'file';
}
