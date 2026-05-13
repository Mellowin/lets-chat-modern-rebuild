import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateWorkspaceDto {
  @ApiProperty({ example: 'Updated Workspace Name' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name: string;
}
