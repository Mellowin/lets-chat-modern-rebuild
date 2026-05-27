import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayMaxSize, IsString, MaxLength } from 'class-validator';

export class UpdateLanguagesDto {
  @ApiProperty({
    description: 'User languages',
    type: [String],
    maxLength: 5,
    example: ['English', 'Ukrainian'],
  })
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  languages!: string[];
}
