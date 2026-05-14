import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WorkspaceRole } from '@lets-chat/database';

export class UpdateMemberRoleDto {
  @ApiProperty({ example: 'ADMIN', enum: ['ADMIN', 'MEMBER'] })
  @IsEnum(WorkspaceRole, {
    message: 'Role must be one of: ADMIN, MEMBER',
  })
  role: WorkspaceRole;
}
