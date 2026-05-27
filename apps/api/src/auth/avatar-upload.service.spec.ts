import { Test } from '@nestjs/testing';
import { promises as fs } from 'fs';
import { join } from 'path';
import { AvatarUploadService } from './avatar-upload.service';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
  },
}));

describe('AvatarUploadService', () => {
  let service: AvatarUploadService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AvatarUploadService],
    }).compile();

    service = moduleRef.get(AvatarUploadService);
    jest.clearAllMocks();
  });

  it('saves file to uploads/avatars/<userId> and returns URL', async () => {
    const file = {
      buffer: Buffer.from('image-data'),
      mimetype: 'image/png',
      originalname: 'avatar.png',
      size: 1234,
    };

    const url = await service.save(file, 'user-1');

    expect(fs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining(join('uploads', 'avatars', 'user-1')),
      { recursive: true },
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(join('uploads', 'avatars', 'user-1')),
      file.buffer,
    );
    expect(url).toMatch(/^\/uploads\/avatars\/user-1\/[\w-]+\.png$/);
  });

  it('does not expose absolute filesystem path', async () => {
    const file = {
      buffer: Buffer.from('image-data'),
      mimetype: 'image/jpeg',
      originalname: 'avatar.jpg',
      size: 1234,
    };

    const url = await service.save(file, 'user-1');

    expect(url.startsWith('/uploads/')).toBe(true);
    expect(url).not.toContain('C:');
    expect(url).not.toContain('\\');
  });

  it('uses correct extension for jpeg mimetype', async () => {
    const file = {
      buffer: Buffer.from('image-data'),
      mimetype: 'image/jpeg',
      originalname: 'avatar.jpg',
      size: 1234,
    };

    const url = await service.save(file, 'user-1');

    expect(url).toMatch(/\.jpg$/);
  });

  it('uses correct extension for webp mimetype', async () => {
    const file = {
      buffer: Buffer.from('image-data'),
      mimetype: 'image/webp',
      originalname: 'avatar.webp',
      size: 1234,
    };

    const url = await service.save(file, 'user-1');

    expect(url).toMatch(/\.webp$/);
  });

  it('rejects unsupported mimetype', async () => {
    const file = {
      buffer: Buffer.from('image-data'),
      mimetype: 'image/gif',
      originalname: 'avatar.gif',
      size: 1234,
    };

    await expect(service.save(file, 'user-1')).rejects.toThrow(
      'Unsupported avatar image format',
    );
  });

  it('does not write file when mimetype is unsupported', async () => {
    const file = {
      buffer: Buffer.from('image-data'),
      mimetype: 'image/gif',
      originalname: 'avatar.gif',
      size: 1234,
    };

    await expect(service.save(file, 'user-1')).rejects.toThrow();

    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
