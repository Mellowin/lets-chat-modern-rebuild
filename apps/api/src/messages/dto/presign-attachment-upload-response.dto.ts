import { ApiProperty } from '@nestjs/swagger';

export class PresignAttachmentUploadResponseDto {
  @ApiProperty({ example: 'http://localhost:9000/letschat-uploads/...' })
  uploadUrl: string;

  @ApiProperty({ example: 'attachments/user-id/uuid-document.pdf' })
  storageKey: string;

  @ApiProperty({ example: 'document.pdf' })
  fileName: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 123456 })
  sizeBytes: number;

  @ApiProperty({ example: 'file', enum: ['image', 'file'] })
  kind: 'image' | 'file';

  @ApiProperty({ example: 300 })
  expiresInSeconds: number;
}
