import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RequestAccountDeletionDto {
  @ApiProperty({ example: 'CurrentPass123!', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ example: 'DELETE MY ACCOUNT' })
  @IsString()
  @Matches(/^DELETE MY ACCOUNT$/, {
    message: 'Confirmation phrase must be exactly "DELETE MY ACCOUNT"',
  })
  confirmationPhrase: string;
}
