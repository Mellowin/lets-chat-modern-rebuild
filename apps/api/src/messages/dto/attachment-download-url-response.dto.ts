import { ApiProperty } from '@nestjs/swagger';

export class AttachmentDownloadUrlResponseDto {
  @ApiProperty({ example: 'http://localhost:9000/letschat-uploads/...' })
  downloadUrl: string;

  @ApiProperty({ example: 300 })
  expiresInSeconds: number;

  @ApiProperty({ example: 'document.pdf' })
  fileName: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 123456 })
  sizeBytes: number;

  @ApiProperty({ example: 'file', enum: ['image', 'file'] })
  kind: 'image' | 'file';

  @ApiProperty({ example: '2026-05-13T15:24:19.006Z' })
  createdAt: Date;
}
