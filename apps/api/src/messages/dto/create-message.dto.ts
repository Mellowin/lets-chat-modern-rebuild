import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  MinLength,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CreateMessageAttachmentDto } from './create-message-attachment.dto';

export class CreateMessageDto {
  @ApiProperty({ example: 'Hello everyone!', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  content?: string;

  @ApiProperty({
    example: '00000000-0000-0000-0000-000000000000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ type: [CreateMessageAttachmentDto], required: false })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateMessageAttachmentDto)
  @ArrayMaxSize(5)
  attachments?: CreateMessageAttachmentDto[];
}
