import { Injectable, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface AvatarFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class AvatarUploadService {
  private readonly uploadDir = join(process.cwd(), 'uploads', 'avatars');

  async save(file: AvatarFile, userId: string): Promise<string> {
    const ext = this.getExtension(file.mimetype);
    const filename = `${randomUUID()}.${ext}`;
    const userDir = join(this.uploadDir, userId);
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(join(userDir, filename), file.buffer);
    return `/uploads/avatars/${userId}/${filename}`;
  }

  private getExtension(mimetype: string): string {
    switch (mimetype) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        throw new BadRequestException('Unsupported avatar image format');
    }
  }
}
