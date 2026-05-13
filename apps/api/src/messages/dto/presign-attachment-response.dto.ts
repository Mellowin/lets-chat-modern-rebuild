import { ApiProperty } from '@nestjs/swagger';

export class PresignAttachmentResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  attachmentId: string;

  @ApiProperty({ example: 'http://localhost:9000/letschat-uploads/...' })
  uploadUrl: string;

  @ApiProperty({ example: 'workspaces/.../document.pdf' })
  objectKey: string;

  @ApiProperty({ example: 300 })
  expiresInSeconds: number;
}
