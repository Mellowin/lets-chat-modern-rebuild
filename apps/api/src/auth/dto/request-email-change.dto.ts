import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class RequestEmailChangeDto {
  @ApiProperty({ example: 'newemail@example.com' })
  @IsEmail()
  newEmail: string;
}
