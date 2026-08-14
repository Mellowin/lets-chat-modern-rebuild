import { IsNotEmpty, IsString } from 'class-validator';

export class TransferChannelOwnershipDto {
  @IsString()
  @IsNotEmpty()
  memberId!: string;
}
