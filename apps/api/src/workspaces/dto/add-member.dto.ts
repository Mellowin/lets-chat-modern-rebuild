import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { WorkspaceRole } from '@lets-chat/database';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddMemberDto {
  @ApiProperty({ description: 'Username or email of the existing user to add' })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiPropertyOptional({ description: 'Role to assign', enum: WorkspaceRole, default: WorkspaceRole.MEMBER })
  @IsOptional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole;
}
