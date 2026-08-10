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

  /**
   * Delete a single uploaded avatar file given its URL.
   * Only files stored under /uploads/avatars/<userId>/ are removed;
   * default or external avatars are ignored.
   */
  async deleteAvatar(avatarUrl: string, userId: string): Promise<void> {
    const prefix = `/uploads/avatars/${userId}/`;
    if (!avatarUrl.startsWith(prefix)) {
      // Not a user-uploaded avatar (e.g. default avatar or external URL).
      return;
    }

    const relativePath = avatarUrl.slice(prefix.length);
    if (relativePath.includes('..') || relativePath.includes('/')) {
      // Reject traversal or nested paths.
      return;
    }

    const filePath = join(this.uploadDir, userId, relativePath);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Already deleted: idempotent no-op.
        return;
      }
      throw error;
    }
  }

  /**
   * Delete every uploaded avatar file for a specific user.
   * The directory path is derived from a trusted userId only, so a malformed
   * userId cannot escape the avatars root. Missing directories are safe.
   */
  async deleteAllAvatarsForUser(userId: string): Promise<void> {
    if (!userId || userId.includes('..') || userId.includes('/')) {
      // Reject empty or path-like userIds.
      return;
    }

    const userDir = join(this.uploadDir, userId);
    try {
      await fs.rm(userDir, { recursive: true, force: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // No avatar directory: idempotent no-op.
        return;
      }
      throw error;
    }
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
