import {
  validateAttachmentFile,
  validateAttachmentMetadata,
  validateAttachmentBatch,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  DANGEROUS_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
  MAX_TOTAL_ATTACHMENT_SIZE_BYTES,
} from './attachment-validation';

describe('AttachmentValidation', () => {
  describe('validateAttachmentMetadata', () => {
    it('accepts supported MIME by extension', () => {
      const result = validateAttachmentMetadata(
        'budget.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        1024,
      );
      expect(result.allowed).toBe(true);
      expect(result.normalizedMimeType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });

    it('rejects dangerous extensions', () => {
      for (const ext of DANGEROUS_ATTACHMENT_EXTENSIONS) {
        const result = validateAttachmentMetadata(
          `evil${ext}`,
          'application/octet-stream',
          1024,
        );
        expect(result.allowed).toBe(false);
        expect(result.code).toBe('UNSUPPORTED_FILE_TYPE');
      }
    });

    it('rejects unsupported extensions', () => {
      const result = validateAttachmentMetadata(
        'unknown.iso',
        'application/octet-stream',
        1024,
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('rejects files above hard cap', () => {
      const result = validateAttachmentMetadata(
        'big.pdf',
        'application/pdf',
        101 * 1024 * 1024,
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('FILE_TOO_LARGE');
    });

    it('rejects image files above category limit', () => {
      const result = validateAttachmentMetadata(
        'big.png',
        'image/png',
        26 * 1024 * 1024,
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('FILE_TOO_LARGE');
    });

    it('accepts image files within category limit', () => {
      const result = validateAttachmentMetadata(
        'photo.png',
        'image/png',
        24 * 1024 * 1024,
      );
      expect(result.allowed).toBe(true);
    });

    it('rejects document files above category limit', () => {
      const result = validateAttachmentMetadata(
        'big.pdf',
        'application/pdf',
        51 * 1024 * 1024,
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('FILE_TOO_LARGE');
    });

    it('accepts document files within category limit', () => {
      const result = validateAttachmentMetadata(
        'document.pdf',
        'application/pdf',
        49 * 1024 * 1024,
      );
      expect(result.allowed).toBe(true);
    });

    it('rejects video files above category limit', () => {
      const result = validateAttachmentMetadata(
        'big.mp4',
        'video/mp4',
        101 * 1024 * 1024,
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('FILE_TOO_LARGE');
    });

    it('accepts video files within category limit', () => {
      const result = validateAttachmentMetadata(
        'clip.mp4',
        'video/mp4',
        99 * 1024 * 1024,
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('validateAttachmentFile', () => {
    function makeFile(
      originalname: string,
      mimetype: string,
      buffer: Buffer,
      size?: number,
    ) {
      return {
        originalname,
        mimetype,
        size: size ?? buffer.length,
        buffer,
      };
    }

    it('accepts a legacy XLS even when magic bytes look like msword', async () => {
      const result = await validateAttachmentFile(
        makeFile('legacy.xls', 'application/vnd.ms-excel', Buffer.from('D0CF')),
      );
      expect(result.allowed).toBe(true);
      expect(result.normalizedMimeType).toBe('application/vnd.ms-excel');
    });

    it('accepts a valid DOCX (ZIP-based OOXML)', async () => {
      const result = await validateAttachmentFile(
        makeFile(
          'document.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          Buffer.from('PK\x03\x04'),
        ),
      );
      expect(result.allowed).toBe(true);
      expect(result.normalizedMimeType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    });

    it('accepts a PNG image by declared MIME', async () => {
      const result = await validateAttachmentFile(
        makeFile('photo.png', 'image/png', Buffer.from('png')),
      );
      expect(result.allowed).toBe(true);
      expect(result.normalizedMimeType).toBe('image/png');
    });

    it('rejects a renamed executable disguised as a document', async () => {
      const result = await validateAttachmentFile(
        makeFile(
          'malicious.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          Buffer.from('MZ executable header'),
        ),
      );
      expect(result.allowed).toBe(false);
    });

    it('rejects dangerous executable extensions', async () => {
      for (const ext of ['.exe', '.js', '.html', '.sh', '.ps1']) {
        const result = await validateAttachmentFile(
          makeFile(
            `evil${ext}`,
            'application/octet-stream',
            Buffer.from('content'),
          ),
        );
        expect(result.allowed).toBe(false);
      }
    });

    it('accepts a CSV with text/csv MIME', async () => {
      const result = await validateAttachmentFile(
        makeFile('data.csv', 'text/csv', Buffer.from('a,b,c')),
      );
      expect(result.allowed).toBe(true);
      expect(result.normalizedMimeType).toBe('text/csv');
    });

    it('rejects image files above category limit', async () => {
      const result = await validateAttachmentFile(
        makeFile('big.png', 'image/png', Buffer.from('png'), 26 * 1024 * 1024),
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('FILE_TOO_LARGE');
    });

    it('accepts image files within category limit', async () => {
      const result = await validateAttachmentFile(
        makeFile('photo.png', 'image/png', Buffer.from('png'), 24 * 1024 * 1024),
      );
      expect(result.allowed).toBe(true);
    });

    it('exports a whitelist that contains common Office formats', () => {
      expect(ALLOWED_ATTACHMENT_EXTENSIONS).toContain('.xlsx');
      expect(ALLOWED_ATTACHMENT_EXTENSIONS).toContain('.xls');
      expect(ALLOWED_ATTACHMENT_EXTENSIONS).toContain('.docx');
      expect(ALLOWED_ATTACHMENT_EXTENSIONS).toContain('.pptx');
      expect(ALLOWED_ATTACHMENT_EXTENSIONS).toContain('.zip');
      expect(ALLOWED_ATTACHMENT_EXTENSIONS).toContain('.mp4');
      expect(ALLOWED_ATTACHMENT_EXTENSIONS).toContain('.mp3');
    });
  });

  describe('validateAttachmentBatch', () => {
    function makeItem(mimeType: string, sizeBytes: number) {
      return { mimeType, sizeBytes };
    }

    it('allows up to 10 mixed attachments', () => {
      const items = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE }, () =>
        makeItem('application/pdf', 1 * 1024 * 1024),
      );
      const result = validateAttachmentBatch(items);
      expect(result.allowed).toBe(true);
    });

    it('rejects 11 mixed attachments', () => {
      const items = Array.from(
        { length: MAX_ATTACHMENTS_PER_MESSAGE + 1 },
        () => makeItem('application/pdf', 1 * 1024 * 1024),
      );
      const result = validateAttachmentBatch(items);
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('TOO_MANY_ATTACHMENTS');
    });

    it('allows up to 20 image attachments', () => {
      const items = Array.from(
        { length: MAX_IMAGE_ATTACHMENTS_PER_MESSAGE },
        () => makeItem('image/png', 1 * 1024 * 1024),
      );
      const result = validateAttachmentBatch(items);
      expect(result.allowed).toBe(true);
    });

    it('rejects 21 image attachments', () => {
      const items = Array.from(
        { length: MAX_IMAGE_ATTACHMENTS_PER_MESSAGE + 1 },
        () => makeItem('image/png', 1 * 1024 * 1024),
      );
      const result = validateAttachmentBatch(items);
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('TOO_MANY_ATTACHMENTS');
    });

    it('rejects mixed batches above 10 even when under image limit', () => {
      const items = Array.from({ length: 15 }, (_, i) =>
        makeItem(i % 2 === 0 ? 'image/png' : 'application/pdf', 1 * 1024 * 1024),
      );
      const result = validateAttachmentBatch(items);
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('TOO_MANY_ATTACHMENTS');
    });

    it('allows total size just under 150 MB', () => {
      const items = [
        makeItem('video/mp4', 60 * 1024 * 1024),
        makeItem('video/mp4', 60 * 1024 * 1024),
        makeItem('application/pdf', 29 * 1024 * 1024),
      ];
      const result = validateAttachmentBatch(items);
      expect(result.allowed).toBe(true);
    });

    it('rejects total size above 150 MB', () => {
      const items = [
        makeItem('video/mp4', 80 * 1024 * 1024),
        makeItem('video/mp4', 80 * 1024 * 1024),
      ];
      const result = validateAttachmentBatch(items);
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('TOTAL_ATTACHMENTS_TOO_LARGE');
    });

    it('allows empty batch', () => {
      const result = validateAttachmentBatch([]);
      expect(result.allowed).toBe(true);
    });
  });
});
