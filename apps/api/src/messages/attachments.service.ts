import {
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ChannelsService } from '../channels/channels.service';
import { MessagesRepository } from './messages.repository';
import { AttachmentsRepository } from './attachments.repository';
import { StorageService } from '../storage/storage.service';
import { PresignAttachmentDto } from './dto/presign-attachment.dto';
import {
  validateAttachmentFile,
  validateAttachmentMetadata,
  assertAttachmentAllowed,
} from './attachment-validation';
import { classifyAttachmentKind } from './messages.service';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditEntityType,
  AuditSeverity,
} from '../audit/audit.constants';

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
    @Optional()
    @Inject(AuditService)
    private readonly audit: AuditService | null = null,
  ) {}

  private async validateUploadedFile(
    file: Express.Multer.File,
  ): Promise<string> {
    const result = await validateAttachmentFile(file);
    return assertAttachmentAllowed(result);
  }

  async prepareUpload(
    workspaceId: string,
    channelId: string,
    dto: PresignAttachmentDto,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);

    const metadataResult = validateAttachmentMetadata(
      dto.filename,
      dto.mimeType,
      dto.sizeBytes,
    );
    assertAttachmentAllowed(metadataResult);

    const sanitized = sanitizeStorageFilename(dto.filename);
    const storageKey = `attachments/${userId}/${randomUUID()}-${sanitized}`;

    const { uploadUrl, expiresInSeconds } =
      await this.storage.getPresignedUploadUrl(storageKey, dto.mimeType, 300);

    const auditEntityId = randomUUID();
    await this.audit?.record({
      actorId: userId,
      action: AuditAction.ATTACHMENT_UPLOADED,
      entityType: AuditEntityType.ATTACHMENT,
      entityId: auditEntityId,
      workspaceId,
      channelId,
      severity: AuditSeverity.INFO,
      metadata: {
        method: 'presigned',
        storageKey,
        fileName: dto.filename,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        kind: classifyAttachmentKind(dto.mimeType),
      },
    });

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
    const normalizedMimeType = await this.validateUploadedFile(file);

    const decodedOriginalName = decodeMultipartFilename(file.originalname);
    const sanitized = sanitizeStorageFilename(decodedOriginalName);
    const storageKey = `attachments/${userId}/${randomUUID()}-${sanitized}`;

    await this.storage.putObject(storageKey, file.buffer, normalizedMimeType);

    const auditEntityId = randomUUID();
    await this.audit?.record({
      actorId: userId,
      action: AuditAction.ATTACHMENT_UPLOADED,
      entityType: AuditEntityType.ATTACHMENT,
      entityId: auditEntityId,
      workspaceId,
      channelId,
      severity: AuditSeverity.INFO,
      metadata: {
        method: 'direct',
        storageKey,
        fileName: decodedOriginalName,
        mimeType: normalizedMimeType,
        sizeBytes: file.size,
        kind: classifyAttachmentKind(normalizedMimeType),
      },
    });

    return {
      storageKey,
      fileName: decodedOriginalName,
      mimeType: normalizedMimeType,
      sizeBytes: file.size,
      kind: classifyAttachmentKind(normalizedMimeType),
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
