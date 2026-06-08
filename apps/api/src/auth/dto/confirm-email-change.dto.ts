import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ConfirmEmailChangeDto {
  @ApiProperty({ example: 'abc123...' })
  @IsString()
  @MinLength(1)
  token: string;
}
