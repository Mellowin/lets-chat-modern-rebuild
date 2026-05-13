import { ApiProperty } from '@nestjs/swagger';

export class CompleteAttachmentResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'document.pdf' })
  filename: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 123456 })
  sizeBytes: number;

  @ApiProperty({ example: 'workspaces/.../document.pdf' })
  storageKey: string;

  @ApiProperty({ example: '2026-05-13T15:24:19.006Z' })
  createdAt: Date;
}
