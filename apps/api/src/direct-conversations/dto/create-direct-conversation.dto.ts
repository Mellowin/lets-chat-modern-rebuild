import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsNotEmpty } from 'class-validator';

export class CreateDirectConversationDto {
  @ApiProperty({
    example: '00000000-0000-0000-0000-000000000000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ example: 'alice', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  usernameOrEmail?: string;
}
