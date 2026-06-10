import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { ChannelsService } from '../channels/channels.service';
import { MessagesRepository } from './messages.repository';
import { AttachmentsRepository } from './attachments.repository';
import { StorageService } from '../storage/storage.service';

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let channelsService: jest.Mocked<ChannelsService>;
  let storageService: jest.Mocked<StorageService>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const workspaceId = '22222222-2222-2222-2222-222222222222';
  const channelId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        {
          provide: ChannelsService,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: MessagesRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: AttachmentsRepository,
          useValue: {
            findById: jest.fn(),
            createAttachment: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            getPresignedUploadUrl: jest.fn(),
            headObject: jest.fn(),
            getPresignedDownloadUrl: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AttachmentsService);
    channelsService = moduleRef.get(ChannelsService);
    storageService = moduleRef.get(StorageService);
  });

  describe('prepareUpload', () => {
    it('returns presigned upload data for a valid image', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.getPresignedUploadUrl.mockResolvedValue({
        uploadUrl: 'http://minio/upload',
        objectKey:
          'attachments/11111111-1111-1111-1111-111111111111/uuid-test.png',
        expiresInSeconds: 300,
      });

      const result = await service.prepareUpload(
        workspaceId,
        channelId,
        {
          filename: 'test.png',
          mimeType: 'image/png',
          sizeBytes: 1234,
        },
        userId,
      );

      expect(result.uploadUrl).toBe('http://minio/upload');
      expect(result.fileName).toBe('test.png');
      expect(result.mimeType).toBe('image/png');
      expect(result.sizeBytes).toBe(1234);
      expect(result.kind).toBe('image');
      expect(result.expiresInSeconds).toBe(300);
      expect(result.storageKey).toContain(userId);
      expect(result.storageKey).toContain('attachments/');
      expect(result.storageKey).not.toContain('../../');
      expect(storageService.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.stringContaining('attachments/'),
        'image/png',
        300,
      );
    });

    it('returns kind file for a valid PDF', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.getPresignedUploadUrl.mockResolvedValue({
        uploadUrl: 'http://minio/upload',
        objectKey:
          'attachments/11111111-1111-1111-1111-111111111111/uuid-doc.pdf',
        expiresInSeconds: 300,
      });

      const result = await service.prepareUpload(
        workspaceId,
        channelId,
        {
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 5678,
        },
        userId,
      );

      expect(result.kind).toBe('file');
    });

    it('throws BadRequest for unsupported MIME and does not call storage', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);

      await expect(
        service.prepareUpload(
          workspaceId,
          channelId,
          {
            filename: 'evil.exe',
            mimeType: 'application/x-msdownload',
            sizeBytes: 1234,
          },
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storageService.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('throws BadRequest for oversized file and does not call storage', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);

      await expect(
        service.prepareUpload(
          workspaceId,
          channelId,
          {
            filename: 'huge.png',
            mimeType: 'image/png',
            sizeBytes: 20 * 1024 * 1024,
          },
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storageService.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('produces safe storageKey for path traversal filename', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.getPresignedUploadUrl.mockResolvedValue({
        uploadUrl: 'http://minio/upload',
        objectKey:
          'attachments/11111111-1111-1111-1111-111111111111/uuid-.._.._evil.png',
        expiresInSeconds: 300,
      });

      const result = await service.prepareUpload(
        workspaceId,
        channelId,
        {
          filename: '../../evil.png',
          mimeType: 'image/png',
          sizeBytes: 1234,
        },
        userId,
      );

      expect(result.storageKey).not.toContain('../../');
      expect(result.storageKey).not.toBe('../../evil.png');
      expect(result.storageKey).toContain('.._.._evil.png');
    });

    it('propagates NotFound when channel access is denied', async () => {
      channelsService.findById.mockRejectedValue(
        new NotFoundException('Channel not found'),
      );

      await expect(
        service.prepareUpload(
          workspaceId,
          channelId,
          {
            filename: 'test.png',
            mimeType: 'image/png',
            sizeBytes: 1234,
          },
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storageService.getPresignedUploadUrl).not.toHaveBeenCalled();
    });
  });
});
