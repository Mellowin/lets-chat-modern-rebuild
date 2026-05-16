import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ChannelRole } from '@lets-chat/database';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddChannelMemberDto {
  @ApiProperty({ description: 'Username or email of the existing user to add' })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiPropertyOptional({ description: 'Role to assign', enum: ChannelRole, default: ChannelRole.MEMBER })
  @IsOptional()
  @IsEnum(ChannelRole)
  role?: ChannelRole;
}
