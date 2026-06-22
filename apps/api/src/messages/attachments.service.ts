import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ChannelsService } from '../channels/channels.service';
import { MessagesRepository } from './messages.repository';
import { AttachmentsRepository } from './attachments.repository';
import { StorageService } from '../storage/storage.service';
import {
  PresignAttachmentDto,
  ALLOWED_MIME_TYPES,
} from './dto/presign-attachment.dto';
import { classifyAttachmentKind } from './messages.service';
import { randomUUID } from 'crypto';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function decodeMultipartFilename(originalname: string): string {
  const hasLatin1Mojibake = [...originalname].some((char) => {
    const code = char.charCodeAt(0);
    return code >= 0x80 && code <= 0xff;
  });
  if (hasLatin1Mojibake) {
    return Buffer.from(originalname, 'latin1').toString('utf8');
  }
  return originalname;
}

export function sanitizeStorageFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function encodeContentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const utf8 = encodeURIComponent(filename);
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${utf8}`;
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

  private validateAttachmentFile(file: Express.Multer.File) {
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported attachment type: ${file.mimetype}`,
      );
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File exceeds maximum size of 10 MB');
    }
  }

  async prepareUpload(
    workspaceId: string,
    channelId: string,
    dto: PresignAttachmentDto,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);

    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(dto.mimeType)) {
      throw new BadRequestException(
        `Unsupported attachment type: ${dto.mimeType}`,
      );
    }

    const maxSize = 10 * 1024 * 1024;
    if (dto.sizeBytes > maxSize) {
      throw new BadRequestException('File exceeds maximum size of 10 MB');
    }

    const sanitized = sanitizeStorageFilename(dto.filename);
    const storageKey = `attachments/${userId}/${randomUUID()}-${sanitized}`;

    const { uploadUrl, expiresInSeconds } =
      await this.storage.getPresignedUploadUrl(storageKey, dto.mimeType, 300);

    return {
      uploadUrl,
      storageKey,
      fileName: dto.filename,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      kind: classifyAttachmentKind(dto.mimeType),
      expiresInSeconds,
    };
  }

  async uploadFile(
    workspaceId: string,
    channelId: string,
    file: Express.Multer.File,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);
    this.validateAttachmentFile(file);

    const decodedOriginalName = decodeMultipartFilename(file.originalname);
    const sanitized = sanitizeStorageFilename(decodedOriginalName);
    const storageKey = `attachments/${userId}/${randomUUID()}-${sanitized}`;

    await this.storage.putObject(storageKey, file.buffer, file.mimetype);

    return {
      storageKey,
      fileName: decodedOriginalName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      kind: classifyAttachmentKind(file.mimetype),
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

  async getDownloadUrl(
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

    const { downloadUrl, expiresInSeconds } =
      await this.storage.getPresignedDownloadUrl(attachment.storageKey, 300);

    return {
      downloadUrl,
      expiresInSeconds,
      fileName: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.size,
      kind: classifyAttachmentKind(attachment.mimeType),
      createdAt: attachment.createdAt,
    };
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

  async downloadFile(
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

    let object;
    try {
      object = await this.storage.getObject(attachment.storageKey);
    } catch (error) {
      if (isAwsNotFoundError(error)) {
        throw new ConflictException('Upload not completed');
      }
      throw error;
    }

    return {
      body: object.body,
      contentType: object.contentType,
      contentLength: object.contentLength,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.size,
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
