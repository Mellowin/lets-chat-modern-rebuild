import { IsInt, IsOptional, IsPositive, Min } from 'class-validator';

export class CreateGroupInviteDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  expiresInHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;
}
