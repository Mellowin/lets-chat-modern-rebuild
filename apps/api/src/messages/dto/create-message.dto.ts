import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateMessageDto {
  @ApiProperty({ example: 'Hello everyone!' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  content: string;

  @ApiProperty({
    example: '00000000-0000-0000-0000-000000000000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
