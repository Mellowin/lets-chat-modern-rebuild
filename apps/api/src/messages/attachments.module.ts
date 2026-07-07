import { Module } from '@nestjs/common';
import { AttachmentsRepository } from './attachments.repository';

@Module({
  providers: [AttachmentsRepository],
  exports: [AttachmentsRepository],
})
export class AttachmentsModule {}
