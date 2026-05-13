import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateReactionDto {
  @ApiProperty({ example: '👍' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  emoji: string;
}
