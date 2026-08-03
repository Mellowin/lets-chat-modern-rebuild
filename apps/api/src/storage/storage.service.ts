import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  CopyObjectCommand,
  NotFound,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.client = new S3Client({
      endpoint: this.config.getOrThrow<string>('S3_ENDPOINT'),
      region: this.config.getOrThrow<string>('S3_REGION'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_KEY'),
      },
      forcePathStyle: this.config.get<boolean>('S3_FORCE_PATH_STYLE') ?? true,
    });
    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  private isAwsAuthError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const err = error as Record<string, unknown>;
    const authErrorNames = new Set([
      'Forbidden',
      'AccessDenied',
      'InvalidAccessKeyId',
      'SignatureDoesNotMatch',
      'ExpiredToken',
      'TokenRefreshRequired',
      'UnauthorizedOperation',
    ]);
    if (typeof err.name === 'string' && authErrorNames.has(err.name)) {
      return true;
    }
    const code = err.Code;
    if (typeof code === 'string' && authErrorNames.has(code)) {
      return true;
    }
    const metadata = err.$metadata;
    if (typeof metadata !== 'object' || metadata === null) return false;
    return (metadata as Record<string, unknown>).httpStatusCode === 403;
  }

  private isNotFoundError(error: unknown): boolean {
    if (error instanceof NotFound) return true;
    if (typeof error !== 'object' || error === null) return false;
    const err = error as Record<string, unknown>;
    if (err.name === 'NotFound') return true;
    if (err.Code === 'NoSuchBucket') return true;
    const metadata = err.$metadata;
    if (typeof metadata !== 'object' || metadata === null) return false;
    return (metadata as Record<string, unknown>).httpStatusCode === 404;
  }

  private async ensureBucketExists() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" exists`);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        try {
          await this.client.send(
            new CreateBucketCommand({ Bucket: this.bucket }),
          );
          this.logger.log(`Bucket "${this.bucket}" created`);
        } catch (createError) {
          this.logger.error(
            `Failed to create bucket "${this.bucket}": ${(createError as Error).message}`,
          );
          throw createError;
        }
      } else if (this.isAwsAuthError(error)) {
        this.logger.error(
          `Storage credentials are invalid or not authorized to access bucket "${this.bucket}".`,
        );
        throw error;
      } else {
        this.logger.error(
          `Failed to check bucket "${this.bucket}": ${(error as Error).message}`,
        );
        throw error;
      }
    }
  }

  async headObject(objectKey: string) {
    return this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  async checkHealth(): Promise<'ok' | 'error'> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return 'ok';
    } catch (error) {
      // Any auth/credential error, missing bucket, or network failure makes the
      // storage dependency unhealthy. We intentionally do not mask 403/Forbidden
      // because it often indicates invalid credentials (InvalidAccessKeyId,
      // SignatureDoesNotMatch, etc.) or a missing bucket in R2.
      if (this.isAwsAuthError(error)) {
        this.logger.warn('Storage health check failed: authentication error');
      } else if (this.isNotFoundError(error)) {
        this.logger.warn('Storage health check failed: bucket not found');
      } else {
        this.logger.warn('Storage health check failed');
      }
      return 'error';
    }
  }

  async getPresignedUploadUrl(
    objectKey: string,
    contentType: string,
    expiresInSeconds = 300,
  ) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

    return { uploadUrl, objectKey, expiresInSeconds };
  }

  async getPresignedDownloadUrl(objectKey: string, expiresInSeconds = 300) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });

    const downloadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

    return { downloadUrl, objectKey, expiresInSeconds };
  }

  async listObjects(prefix: string) {
    const objects: Array<{
      key: string;
      lastModified: Date;
      size: number;
    }> = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const item of response.Contents ?? []) {
        if (item.Key && item.LastModified) {
          objects.push({
            key: item.Key,
            lastModified: item.LastModified,
            size: item.Size ?? 0,
          });
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  async putObject(objectKey: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(objectKey: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );
  }

  async copyObject(sourceKey: string, destinationKey: string) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: this.encodeCopySourcePath(this.bucket, sourceKey),
        Key: destinationKey,
      }),
    );
  }

  private encodeCopySourcePath(bucket: string, key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `/${encodeURIComponent(bucket)}/${encodedKey}`;
  }

  async getObject(objectKey: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );

    return {
      body: response.Body as Readable,
      contentType: response.ContentType ?? 'application/octet-stream',
      contentLength: response.ContentLength ?? 0,
      contentDisposition: response.ContentDisposition,
    };
  }
}
