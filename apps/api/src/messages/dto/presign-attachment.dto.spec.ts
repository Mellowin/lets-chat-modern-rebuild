import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PresignAttachmentDto } from './presign-attachment.dto';

describe('PresignAttachmentDto', () => {
  function createDto(overrides: Partial<PresignAttachmentDto> = {}) {
    return plainToInstance(PresignAttachmentDto, {
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      ...overrides,
    });
  }

  it('passes with valid image MIME type', async () => {
    const dto = createDto({ mimeType: 'image/png', filename: 'photo.png' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid document MIME type', async () => {
    const dto = createDto({ mimeType: 'text/plain', filename: 'notes.txt' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid Word .doc MIME type', async () => {
    const dto = createDto({
      mimeType: 'application/msword',
      filename: 'document.doc',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid Word .docx MIME type', async () => {
    const dto = createDto({
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: 'document.docx',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails with unsupported MIME type', async () => {
    const dto = createDto({ mimeType: 'application/zip' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'mimeType')).toBe(true);
  });

  it('fails when size exceeds 10 MB', async () => {
    const dto = createDto({ sizeBytes: 10 * 1024 * 1024 + 1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'sizeBytes')).toBe(true);
  });

  it('fails when size is zero', async () => {
    const dto = createDto({ sizeBytes: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'sizeBytes')).toBe(true);
  });

  it('trims filename', () => {
    const dto = createDto({ filename: '  document.pdf  ' });
    expect(dto.filename).toBe('document.pdf');
  });
});
