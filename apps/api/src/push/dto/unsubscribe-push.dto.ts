import { IsString } from 'class-validator';

export class UnsubscribePushDto {
  @IsString()
  endpoint!: string;
}
