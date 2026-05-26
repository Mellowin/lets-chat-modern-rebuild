import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { StorageBackend } from '@lets-chat/database';
import { ChannelsService } from '../channels/channels.service';
import { MessagesRepository } from './messages.repository';
import { AttachmentsRepository } from './attachments.repository';
import { StorageService } from '../storage/storage.service';
import { PresignAttachmentDto } from './dto/presign-attachment.dto';
import { randomUUID } from 'crypto';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAwsNotFoundError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error.name === 'NotFound') return true;
  const metadata = error.$metadata;
  return isRecord(metadata) && metadata.httpStatusCode === 404;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly channels: ChannelsService,
    private readonly messages: MessagesRepository,
    private readonly attachments: AttachmentsRepository,
    private readonly storage: StorageService,
  ) {}

  async presign(
    workspaceId: string,
    channelId: string,
    messageId: string,
    dto: PresignAttachmentDto,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);
    await this.validateMessage(channelId, messageId);

    const sanitized = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `workspaces/${workspaceId}/channels/${channelId}/messages/${messageId}/${randomUUID()}-${sanitized}`;

    const attachment = await this.attachments.createAttachment({
      messageId,
      createdById: userId,
      filename: sanitized,
      originalName: dto.filename,
      mimeType: dto.mimeType,
      size: dto.sizeBytes,
      storageKey: objectKey,
      storageBackend: StorageBackend.MINIO,
    });

    const { uploadUrl, expiresInSeconds } =
      await this.storage.getPresignedUploadUrl(objectKey, dto.mimeType, 300);

    return {
      attachmentId: attachment.id,
      uploadUrl,
      objectKey,
      expiresInSeconds,
    };
  }

  async complete(
    workspaceId: string,
    channelId: string,
    messageId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);
    await this.validateMessage(channelId, messageId);

    const attachment = await this.attachments.findById(attachmentId);
    if (
      !attachment ||
      attachment.messageId !== messageId ||
      attachment.createdById !== userId ||
      attachment.deletedAt !== null
    ) {
      throw new NotFoundException('Attachment not found');
    }

    try {
      const head = await this.storage.headObject(attachment.storageKey);

      if (head.ContentLength !== attachment.size) {
        throw new UnprocessableEntityException(
          'Uploaded file size does not match expected size',
        );
      }

      if (head.ContentType && head.ContentType !== attachment.mimeType) {
        throw new UnprocessableEntityException(
          'Uploaded file type does not match expected type',
        );
      }

      return {
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.size,
        storageKey: attachment.storageKey,
        createdAt: attachment.createdAt,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      if (isAwsNotFoundError(error)) {
        throw new ConflictException('Upload not completed');
      }
      throw error;
    }
  }

  async download(
    workspaceId: string,
    channelId: string,
    messageId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);
    await this.validateMessage(channelId, messageId);

    const attachment = await this.attachments.findById(attachmentId);
    if (
      !attachment ||
      attachment.messageId !== messageId ||
      attachment.deletedAt !== null
    ) {
      throw new NotFoundException('Attachment not found');
    }

    try {
      await this.storage.headObject(attachment.storageKey);
    } catch (error) {
      if (isAwsNotFoundError(error)) {
        throw new ConflictException('Upload not completed');
      }
      throw error;
    }

    const { downloadUrl, expiresInSeconds } =
      await this.storage.getPresignedDownloadUrl(attachment.storageKey, 300);

    return {
      attachmentId: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.size,
      downloadUrl,
      expiresInSeconds,
    };
  }

  private async validateMessage(channelId: string, messageId: string) {
    const message = await this.messages.findById(messageId);
    if (
      !message ||
      message.channelId !== channelId ||
      message.deletedAt !== null
    ) {
      throw new NotFoundException('Message not found');
    }
  }
}
