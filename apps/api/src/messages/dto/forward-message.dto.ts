import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, MaxLength, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export type ForwardSourceType = 'channel' | 'direct' | 'group';
export type ForwardDestinationType = 'channel' | 'direct' | 'group';

export class ForwardMessageDto {
  @ApiProperty({ example: 'channel', enum: ['channel', 'direct', 'group'] })
  @IsIn(['channel', 'direct', 'group'])
  sourceType: ForwardSourceType;

  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  @IsUUID()
  sourceMessageId: string;

  @ApiProperty({ example: 'direct', enum: ['channel', 'direct', 'group'] })
  @IsIn(['channel', 'direct', 'group'])
  destinationType: ForwardDestinationType;

  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  @IsUUID()
  destinationId: string;

  @ApiProperty({ example: 'Check this out', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  comment?: string;
}
