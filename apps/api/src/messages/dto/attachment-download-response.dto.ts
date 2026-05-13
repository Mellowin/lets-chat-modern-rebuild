import { ApiProperty } from '@nestjs/swagger';

export class AttachmentDownloadResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  attachmentId: string;

  @ApiProperty({ example: 'document.pdf' })
  filename: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 123456 })
  sizeBytes: number;

  @ApiProperty({ example: 'http://localhost:9000/letschat-uploads/...' })
  downloadUrl: string;

  @ApiProperty({ example: 300 })
  expiresInSeconds: number;
}
