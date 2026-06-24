import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateGroupDto {
  @ApiProperty({ example: 'New group name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
