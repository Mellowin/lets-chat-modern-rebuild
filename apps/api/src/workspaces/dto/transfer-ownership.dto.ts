import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TransferOwnershipDto {
  @ApiProperty({ example: '33333333-3333-3333-3333-333333333333' })
  @IsUUID()
  memberId: string;
}
