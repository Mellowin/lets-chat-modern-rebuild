import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { ChannelsService } from '../channels/channels.service';
import { MessagesRepository } from './messages.repository';
import { AttachmentsRepository } from './attachments.repository';
import { StorageService } from '../storage/storage.service';
import { Readable } from 'stream';

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let channelsService: jest.Mocked<ChannelsService>;
  let messagesRepository: jest.Mocked<MessagesRepository>;
  let attachmentsRepository: jest.Mocked<AttachmentsRepository>;
  let storageService: jest.Mocked<StorageService>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const workspaceId = '22222222-2222-2222-2222-222222222222';
  const channelId = '33333333-3333-3333-3333-333333333333';
  const messageId = '44444444-4444-4444-4444-444444444444';
  const attachmentId = '55555555-5555-5555-5555-555555555555';

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
            putObject: jest.fn(),
            headObject: jest.fn(),
            getPresignedDownloadUrl: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AttachmentsService);
    channelsService = moduleRef.get(ChannelsService);
    messagesRepository = moduleRef.get(MessagesRepository);
    attachmentsRepository = moduleRef.get(AttachmentsRepository);
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

  describe('uploadFile', () => {
    function makeFile(
      props: Partial<Express.Multer.File> = {},
    ): Express.Multer.File {
      return {
        fieldname: 'file',
        originalname: 'test.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: 1234,
        buffer: Buffer.from('png'),
        destination: '',
        filename: '',
        path: '',
        stream: new Readable({ read() {} }),
        ...props,
      };
    }

    it('uploads a valid image and returns metadata', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({
          originalname: 'photo.png',
          mimetype: 'image/png',
          size: 1234,
        }),
        userId,
      );

      expect(result.fileName).toBe('photo.png');
      expect(result.mimeType).toBe('image/png');
      expect(result.sizeBytes).toBe(1234);
      expect(result.kind).toBe('image');
      expect(result.storageKey).toContain(userId);
      expect(result.storageKey).toContain('attachments/');
      expect(storageService.putObject).toHaveBeenCalledWith(
        expect.stringContaining('attachments/'),
        expect.any(Buffer),
        'image/png',
      );
    });

    it('uploads a valid PDF and returns kind file', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({
          originalname: 'doc.pdf',
          mimetype: 'application/pdf',
          size: 5678,
        }),
        userId,
      );

      expect(result.kind).toBe('file');
      expect(result.mimeType).toBe('application/pdf');
    });

    it('throws BadRequest for unsupported MIME and does not call storage', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);

      await expect(
        service.uploadFile(
          workspaceId,
          channelId,
          makeFile({
            originalname: 'evil.exe',
            mimetype: 'application/x-msdownload',
          }),
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storageService.putObject).not.toHaveBeenCalled();
    });

    it('throws BadRequest for oversized file and does not call storage', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);

      await expect(
        service.uploadFile(
          workspaceId,
          channelId,
          makeFile({ size: 20 * 1024 * 1024 }),
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storageService.putObject).not.toHaveBeenCalled();
    });

    it('produces safe storageKey for path traversal filename', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({ originalname: '../../evil.png' }),
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
        service.uploadFile(workspaceId, channelId, makeFile(), userId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storageService.putObject).not.toHaveBeenCalled();
    });
  });

  describe('getDownloadUrl', () => {
    it('returns downloadUrl and safe metadata for valid attachment', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        deletedAt: null,
      } as never);
      attachmentsRepository.findById.mockResolvedValue({
        id: attachmentId,
        messageId,
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        storageKey: 'internal/key/doc.pdf',
        deletedAt: null,
        createdAt: new Date('2024-01-01'),
      } as never);
      storageService.getPresignedDownloadUrl.mockResolvedValue({
        downloadUrl: 'http://minio/download',
        objectKey: 'internal/key/doc.pdf',
        expiresInSeconds: 300,
      });

      const result = await service.getDownloadUrl(
        workspaceId,
        channelId,
        messageId,
        attachmentId,
        userId,
      );

      expect(result.downloadUrl).toBe('http://minio/download');
      expect(result.fileName).toBe('doc.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.sizeBytes).toBe(1234);
      expect(result.kind).toBe('file');
      expect(result.expiresInSeconds).toBe(300);
      expect(result.createdAt).toEqual(new Date('2024-01-01'));
      expect(result).not.toHaveProperty('storageKey');
      expect(storageService.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'internal/key/doc.pdf',
        300,
      );
    });

    it('throws NotFound when attachment belongs to another message', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        deletedAt: null,
      } as never);
      attachmentsRepository.findById.mockResolvedValue({
        id: attachmentId,
        messageId: 'other-message-id',
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        storageKey: 'internal/key/doc.pdf',
        deletedAt: null,
        createdAt: new Date(),
      } as never);

      await expect(
        service.getDownloadUrl(
          workspaceId,
          channelId,
          messageId,
          attachmentId,
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('throws NotFound when message belongs to another channel', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId: 'other-channel-id',
        deletedAt: null,
      } as never);

      await expect(
        service.getDownloadUrl(
          workspaceId,
          channelId,
          messageId,
          attachmentId,
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(attachmentsRepository.findById).not.toHaveBeenCalled();
      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('throws NotFound when user has no channel access', async () => {
      channelsService.findById.mockRejectedValue(
        new NotFoundException('Channel not found'),
      );

      await expect(
        service.getDownloadUrl(
          workspaceId,
          channelId,
          messageId,
          attachmentId,
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('throws NotFound when attachment is soft-deleted', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        deletedAt: null,
      } as never);
      attachmentsRepository.findById.mockResolvedValue({
        id: attachmentId,
        messageId,
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        storageKey: 'internal/key/doc.pdf',
        deletedAt: new Date(),
        createdAt: new Date(),
      } as never);

      await expect(
        service.getDownloadUrl(
          workspaceId,
          channelId,
          messageId,
          attachmentId,
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('propagates storage provider errors', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        deletedAt: null,
      } as never);
      attachmentsRepository.findById.mockResolvedValue({
        id: attachmentId,
        messageId,
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        storageKey: 'internal/key/doc.pdf',
        deletedAt: null,
        createdAt: new Date(),
      } as never);
      storageService.getPresignedDownloadUrl.mockRejectedValue(
        new Error('Storage error'),
      );

      await expect(
        service.getDownloadUrl(
          workspaceId,
          channelId,
          messageId,
          attachmentId,
          userId,
        ),
      ).rejects.toThrow('Storage error');
    });
  });
});
