import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.client = new S3Client({
      endpoint: this.config.get<string>('S3_ENDPOINT')!,
      region: this.config.get<string>('S3_REGION')!,
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY')!,
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY')!,
      },
      forcePathStyle: this.config.get<boolean>('S3_FORCE_PATH_STYLE'),
    });
    this.bucket = this.config.get<string>('S3_BUCKET')!;
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
}
