import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateMessageDto {
  @ApiProperty({ example: 'Updated content' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content: string;
}
