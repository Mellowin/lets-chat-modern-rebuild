import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';
import { ALLOWED_AVATAR_PRESETS } from '../constants/avatar-presets';

export class UpdateAvatarDto {
  @ApiProperty({
    description: 'Avatar preset URL',
    enum: ALLOWED_AVATAR_PRESETS,
  })
  @IsString()
  @IsIn(ALLOWED_AVATAR_PRESETS, {
    message: 'Invalid avatar preset',
  })
  avatarUrl!: string;
}
