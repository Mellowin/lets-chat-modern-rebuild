import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class CancelAccountDeletionDto {
  @ApiProperty({ example: '64-hex-token' })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token: string;
}
