import { Test } from '@nestjs/testing';
import { promises as fs } from 'fs';
import { join } from 'path';
import { AvatarUploadService } from './avatar-upload.service';

describe('AvatarUploadService', () => {
  let service: AvatarUploadService;
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AvatarUploadService],
    }).compile();
    service = moduleRef.get(AvatarUploadService);
  });

  afterEach(async () => {
    // Clean up the test user's avatar directory after each test.
    try {
      await fs.rm(join(service['uploadDir'], userId), {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore cleanup errors
    }
  });

  it('saves an avatar and returns a stable path', async () => {
    const file = {
      buffer: Buffer.from('png'),
      mimetype: 'image/png',
      originalname: 'avatar.png',
      size: 1234,
    };
    const url = await service.save(file, userId);
    expect(url).toMatch(
      new RegExp(`^/uploads/avatars/${userId}/[a-f0-9-]+\\.png$`),
    );
  });

  it('deletes a saved avatar by URL', async () => {
    const file = {
      buffer: Buffer.from('png'),
      mimetype: 'image/png',
      originalname: 'avatar.png',
      size: 1234,
    };
    const url = await service.save(file, userId);
    await service.deleteAvatar(url, userId);

    const filePath = join(
      process.cwd(),
      'uploads',
      'avatars',
      ...url.split('/').slice(3),
    );
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it('is idempotent when the avatar file is already missing', async () => {
    await expect(
      service.deleteAvatar(`/uploads/avatars/${userId}/missing.png`, userId),
    ).resolves.toBeUndefined();
  });

  it('does not delete default avatars', async () => {
    await expect(
      service.deleteAvatar('/avatars/default-avatar.svg', userId),
    ).resolves.toBeUndefined();
  });

  it('does not delete avatars belonging to another user', async () => {
    await expect(
      service.deleteAvatar('/uploads/avatars/other-user/avatar.png', userId),
    ).resolves.toBeUndefined();
  });

  it('rejects path traversal in avatar URL', async () => {
    await expect(
      service.deleteAvatar(
        `/uploads/avatars/${userId}/../other-user/avatar.png`,
        userId,
      ),
    ).resolves.toBeUndefined();
  });
});
