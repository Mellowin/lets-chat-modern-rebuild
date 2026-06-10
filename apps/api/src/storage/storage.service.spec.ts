import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.example.com'),
}));

describe('StorageService', () => {
  let service: StorageService;
  let s3SendMock: jest.Mock;

  beforeEach(async () => {
    s3SendMock = jest.fn().mockResolvedValue({});

    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
      () =>
        ({
          send: s3SendMock,
        }) as unknown as S3Client,
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              const map: Record<string, string> = {
                S3_ENDPOINT: 'http://minio',
                S3_REGION: 'us-east-1',
                S3_ACCESS_KEY: 'key',
                S3_SECRET_KEY: 'secret',
                S3_BUCKET: 'bucket',
              };
              const value = map[key];
              if (!value) {
                throw new Error(`Config key ${key} not found`);
              }
              return value;
            }),
            get: jest.fn(() => undefined),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(StorageService);
  });

  describe('listObjects', () => {
    it('returns objects with key, lastModified and size', async () => {
      s3SendMock.mockResolvedValue({
        Contents: [
          {
            Key: 'attachments/u1/file1.png',
            LastModified: new Date('2024-01-01T00:00:00Z'),
            Size: 1234,
          },
        ],
      });

      const result = await service.listObjects('attachments/');

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('attachments/u1/file1.png');
      expect(result[0].lastModified).toEqual(new Date('2024-01-01T00:00:00Z'));
      expect(result[0].size).toBe(1234);
      expect(s3SendMock).toHaveBeenCalledWith(expect.any(ListObjectsV2Command));
    });

    it('paginates through all objects', async () => {
      s3SendMock
        .mockResolvedValueOnce({
          Contents: [
            {
              Key: 'a/1',
              LastModified: new Date('2024-01-01T00:00:00Z'),
              Size: 1,
            },
          ],
          NextContinuationToken: 'token1',
        })
        .mockResolvedValueOnce({
          Contents: [
            {
              Key: 'a/2',
              LastModified: new Date('2024-01-02T00:00:00Z'),
              Size: 2,
            },
          ],
        });

      const result = await service.listObjects('a/');

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('a/1');
      expect(result[1].key).toBe('a/2');
      expect(s3SendMock).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when no contents', async () => {
      s3SendMock.mockResolvedValue({});

      const result = await service.listObjects('empty/');

      expect(result).toEqual([]);
    });

    it('skips items without Key or LastModified', async () => {
      s3SendMock.mockResolvedValue({
        Contents: [
          { Key: 'valid', LastModified: new Date(), Size: 10 },
          { Key: undefined, LastModified: new Date(), Size: 20 },
          { Key: 'no-date', LastModified: undefined, Size: 30 },
        ],
      });

      const result = await service.listObjects('prefix/');

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('valid');
    });
  });

  describe('deleteObject', () => {
    it('sends DeleteObjectCommand', async () => {
      s3SendMock.mockResolvedValue({});

      await service.deleteObject('attachments/u1/file.png');

      expect(s3SendMock).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    });
  });

  describe('headObject', () => {
    it('sends HeadObjectCommand', async () => {
      s3SendMock.mockResolvedValue({ ContentLength: 1234 });

      const result = await service.headObject('attachments/u1/file.png');

      expect(result.ContentLength).toBe(1234);
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('returns uploadUrl and objectKey', async () => {
      const result = await service.getPresignedUploadUrl(
        'attachments/u1/file.png',
        'image/png',
        300,
      );

      expect(result.objectKey).toBe('attachments/u1/file.png');
      expect(result.expiresInSeconds).toBe(300);
      expect(typeof result.uploadUrl).toBe('string');
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('returns downloadUrl and objectKey', async () => {
      const result = await service.getPresignedDownloadUrl(
        'attachments/u1/file.png',
        300,
      );

      expect(result.objectKey).toBe('attachments/u1/file.png');
      expect(result.expiresInSeconds).toBe(300);
      expect(typeof result.downloadUrl).toBe('string');
    });
  });
});
