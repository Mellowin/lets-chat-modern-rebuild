import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMessageDto } from './create-message.dto';

describe('CreateMessageDto', () => {
  async function validateDto(obj: Record<string, unknown>) {
    const dto = plainToInstance(CreateMessageDto, obj);
    return validate(dto);
  }

  it('accepts valid content', async () => {
    const errors = await validateDto({ content: 'Hello everyone!' });
    expect(errors).toHaveLength(0);
  });

  it('rejects empty content', async () => {
    const errors = await validateDto({ content: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('content');
  });

  it('rejects whitespace-only content after trim', async () => {
    const errors = await validateDto({ content: '   ' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('content');
  });

  it('rejects content longer than 4000 characters', async () => {
    const errors = await validateDto({ content: 'a'.repeat(4001) });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('content');
  });

  it('accepts content at exactly 4000 characters', async () => {
    const errors = await validateDto({ content: 'a'.repeat(4000) });
    expect(errors).toHaveLength(0);
  });

  it('accepts missing content when attachments are present', async () => {
    const errors = await validateDto({
      attachments: [
        {
          storageKey: 'attachments/user-id/uuid-file.png',
          fileName: 'file.png',
          mimeType: 'image/png',
          sizeBytes: 1234,
          kind: 'image',
        },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts valid parentId', async () => {
    const errors = await validateDto({
      content: 'Reply',
      parentId: '00000000-0000-0000-0000-000000000000',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid parentId format', async () => {
    const errors = await validateDto({
      content: 'Reply',
      parentId: 'not-a-uuid',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('parentId');
  });

  it('accepts valid attachments', async () => {
    const errors = await validateDto({
      content: 'Check this out',
      attachments: [
        {
          storageKey: 'attachments/user-id/uuid-file.png',
          fileName: 'file.png',
          mimeType: 'image/png',
          sizeBytes: 1234,
          kind: 'image',
        },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects more than 5 attachments', async () => {
    const errors = await validateDto({
      attachments: Array.from({ length: 6 }, (_, i) => ({
        storageKey: `attachments/user-id/uuid-file-${i}.png`,
        fileName: `file-${i}.png`,
        mimeType: 'image/png',
        sizeBytes: 1234,
        kind: 'image',
      })),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('attachments');
  });

  it('rejects unsupported MIME in attachment', async () => {
    const errors = await validateDto({
      attachments: [
        {
          storageKey: 'attachments/user-id/uuid-file.exe',
          fileName: 'file.exe',
          mimeType: 'application/x-msdownload',
          sizeBytes: 1234,
          kind: 'file',
        },
      ],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('attachments');
  });

  it('rejects oversized attachment', async () => {
    const errors = await validateDto({
      attachments: [
        {
          storageKey: 'attachments/user-id/uuid-file.png',
          fileName: 'file.png',
          mimeType: 'image/png',
          sizeBytes: 20 * 1024 * 1024,
          kind: 'image',
        },
      ],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('attachments');
  });
});
