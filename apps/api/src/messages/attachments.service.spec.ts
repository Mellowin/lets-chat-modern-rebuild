import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
            getObject: jest.fn(),
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

    it('returns kind file for a valid DOCX', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.getPresignedUploadUrl.mockResolvedValue({
        uploadUrl: 'http://minio/upload',
        objectKey:
          'attachments/11111111-1111-1111-1111-111111111111/uuid-doc.docx',
        expiresInSeconds: 300,
      });

      const result = await service.prepareUpload(
        workspaceId,
        channelId,
        {
          filename: 'document.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sizeBytes: 1024,
        },
        userId,
      );

      expect(result.kind).toBe('file');
      expect(result.fileName).toBe('document.docx');
    });

    it('returns presigned upload data for a valid XLSX', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.getPresignedUploadUrl.mockResolvedValue({
        uploadUrl: 'http://minio/upload',
        objectKey:
          'attachments/11111111-1111-1111-1111-111111111111/uuid-sheet.xlsx',
        expiresInSeconds: 300,
      });

      const result = await service.prepareUpload(
        workspaceId,
        channelId,
        {
          filename: 'budget.xlsx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sizeBytes: 2048,
        },
        userId,
      );

      expect(result.kind).toBe('file');
      expect(result.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(storageService.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.stringContaining('attachments/'),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        300,
      );
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

    it('throws BadRequest for dangerous filename extension regardless of MIME', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);

      await expect(
        service.prepareUpload(
          workspaceId,
          channelId,
          {
            filename: 'evil.js',
            mimeType: 'text/plain',
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
            sizeBytes: 30 * 1024 * 1024,
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

    it('uploads a valid DOCX and returns kind file', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({
          originalname: 'document.docx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 1024,
        }),
        userId,
      );

      expect(result.kind).toBe('file');
      expect(result.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    });

    it('uploads a valid XLSX and returns kind file', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({
          originalname: 'budget.xlsx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 1024,
        }),
        userId,
      );

      expect(result.kind).toBe('file');
      expect(result.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });

    it('uploads a legacy XLS by extension even when magic bytes look like msword', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({
          originalname: 'legacy.xls',
          mimetype: 'application/vnd.ms-excel',
          size: 1024,
        }),
        userId,
      );

      expect(result.kind).toBe('file');
      expect(result.mimeType).toBe('application/vnd.ms-excel');
      expect(result.fileName).toBe('legacy.xls');
    });

    it('uploads a valid PPTX and returns kind file', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({
          originalname: 'slides.pptx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          size: 1024,
        }),
        userId,
      );

      expect(result.kind).toBe('file');
      expect(result.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      );
    });

    it('uploads a valid ZIP archive and returns kind file', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({
          originalname: 'archive.zip',
          mimetype: 'application/zip',
          size: 1024,
        }),
        userId,
      );

      expect(result.kind).toBe('file');
      expect(result.mimeType).toBe('application/zip');
    });

    it('uploads a valid MP4 video and returns kind file', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({
          originalname: 'clip.mp4',
          mimetype: 'video/mp4',
          size: 1024,
        }),
        userId,
      );

      expect(result.kind).toBe('file');
      expect(result.mimeType).toBe('video/mp4');
    });

    it('uploads a valid MP3 audio and returns kind file', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({
          originalname: 'song.mp3',
          mimetype: 'audio/mpeg',
          size: 1024,
        }),
        userId,
      );

      expect(result.kind).toBe('file');
      expect(result.mimeType).toBe('audio/mpeg');
    });

    it('uploads a GIF image and returns kind image', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({
          originalname: 'anim.gif',
          mimetype: 'image/gif',
          size: 1024,
        }),
        userId,
      );

      expect(result.kind).toBe('image');
      expect(result.mimeType).toBe('image/gif');
    });

    it('rejects dangerous executable extensions', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);

      for (const name of ['evil.exe', 'script.js', 'page.html', 'run.sh']) {
        await expect(
          service.uploadFile(
            workspaceId,
            channelId,
            makeFile({
              originalname: name,
              mimetype: 'application/octet-stream',
            }),
            userId,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      }

      expect(storageService.putObject).not.toHaveBeenCalled();
    });

    it('preserves Cyrillic filename decoded from multipart latin1 mojibake', async () => {
      channelsService.findById.mockResolvedValue(undefined as never);
      storageService.putObject.mockResolvedValue(undefined);

      const cyrillicName = 'Постанова про тест.pdf';
      const latin1Mojibake = Buffer.from(cyrillicName, 'utf8').toString(
        'latin1',
      );

      const result = await service.uploadFile(
        workspaceId,
        channelId,
        makeFile({
          originalname: latin1Mojibake,
          mimetype: 'application/pdf',
          size: 5678,
        }),
        userId,
      );

      expect(result.fileName).toBe(cyrillicName);
      expect(result.storageKey).not.toContain(cyrillicName);
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
          makeFile({ size: 30 * 1024 * 1024 }),
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

  describe('downloadFile', () => {
    it('returns object stream and metadata for valid attachment', async () => {
      const body = new Readable({ read() {} });
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
      storageService.getObject.mockResolvedValue({
        body,
        contentType: 'application/pdf',
        contentLength: 1234,
        contentDisposition: undefined,
      });

      const result = await service.downloadFile(
        workspaceId,
        channelId,
        messageId,
        attachmentId,
        userId,
      );

      expect(result.body).toBe(body);
      expect(result.contentType).toBe('application/pdf');
      expect(result.contentLength).toBe(1234);
      expect(result.filename).toBe('doc.pdf');
      expect(result.sizeBytes).toBe(1234);
      expect(storageService.getObject).toHaveBeenCalledWith(
        'internal/key/doc.pdf',
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
        service.downloadFile(
          workspaceId,
          channelId,
          messageId,
          attachmentId,
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storageService.getObject).not.toHaveBeenCalled();
    });

    it('throws ConflictException when storage object is missing', async () => {
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
      const error = new Error('NotFound') as unknown as Record<string, unknown>;
      error.name = 'NotFound';
      storageService.getObject.mockRejectedValue(error);

      await expect(
        service.downloadFile(
          workspaceId,
          channelId,
          messageId,
          attachmentId,
          userId,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
