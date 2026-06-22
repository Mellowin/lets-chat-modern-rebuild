import {
  validateAttachmentFile,
  validateAttachmentMetadata,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  DANGEROUS_ATTACHMENT_EXTENSIONS,
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
      }
    });

    it('rejects unsupported extensions', () => {
      const result = validateAttachmentMetadata(
        'unknown.iso',
        'application/octet-stream',
        1024,
      );
      expect(result.allowed).toBe(false);
    });

    it('rejects oversized files', () => {
      const result = validateAttachmentMetadata(
        'big.pdf',
        'application/pdf',
        20 * 1024 * 1024,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('10 MB');
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
      // A stub that does not contain real Excel magic bytes but has the .xls
      // extension. The validator must trust the extension for legacy Office.
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
});
