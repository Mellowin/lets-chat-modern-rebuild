import { Injectable } from '@nestjs/common';
import { PrismaService, StorageBackend } from '@lets-chat/database';

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.attachment.findUnique({
      where: { id },
    });
  }

  async createAttachment(data: {
    messageId: string;
    createdById: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    storageKey: string;
    storageBackend: StorageBackend;
  }) {
    return this.prisma.attachment.create({
      data,
    });
  }
}
