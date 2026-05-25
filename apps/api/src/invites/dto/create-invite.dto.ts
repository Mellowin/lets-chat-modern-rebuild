import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateInviteDto {
  @ApiProperty({ example: 'user@example.com', required: false })
  @IsEmail()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email?: string;

  @ApiProperty({ example: 'alice', required: false })
  @IsString()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/^@/, '') : value,
  )
  identifier?: string;

  @ApiProperty({ example: 'MEMBER', enum: ['ADMIN', 'MEMBER'] })
  @IsIn(['ADMIN', 'MEMBER'])
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  role: 'ADMIN' | 'MEMBER';
}
