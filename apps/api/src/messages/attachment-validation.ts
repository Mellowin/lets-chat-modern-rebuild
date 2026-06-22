import { BadRequestException } from '@nestjs/common';

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  // images
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  // documents
  '.pdf',
  '.txt',
  '.rtf',
  // Microsoft Word
  '.doc',
  '.docx',
  // Microsoft Excel
  '.xls',
  '.xlsx',
  '.csv',
  // Microsoft PowerPoint
  '.ppt',
  '.pptx',
  // OpenDocument
  '.odt',
  '.ods',
  '.odp',
  // archives
  '.zip',
  '.7z',
  '.rar',
  // video
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  // audio
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
] as const;

export type AllowedAttachmentExtension =
  (typeof ALLOWED_ATTACHMENT_EXTENSIONS)[number];

export const DANGEROUS_ATTACHMENT_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.js',
  '.mjs',
  '.ts',
  '.html',
  '.htm',
  '.php',
  '.jar',
  '.dll',
  '.scr',
  '.svg',
  '.com',
  '.vbs',
] as const;

export const EXTENSION_TO_MIME_TYPES: Record<
  AllowedAttachmentExtension,
  readonly string[]
> = {
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
  '.pdf': ['application/pdf'],
  '.txt': ['text/plain'],
  '.rtf': ['application/rtf', 'text/rtf'],
  '.doc': ['application/msword'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  '.csv': ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  '.odt': ['application/vnd.oasis.opendocument.text'],
  '.ods': ['application/vnd.oasis.opendocument.spreadsheet'],
  '.odp': ['application/vnd.oasis.opendocument.presentation'],
  '.zip': ['application/zip'],
  '.7z': ['application/x-7z-compressed'],
  '.rar': ['application/vnd.rar', 'application/x-rar-compressed'],
  '.mp4': ['video/mp4'],
  '.webm': ['video/webm'],
  '.mov': ['video/quicktime'],
  '.avi': ['video/x-msvideo'],
  '.mkv': ['video/x-matroska'],
  '.mp3': ['audio/mpeg'],
  '.wav': ['audio/wav'],
  '.ogg': ['audio/ogg'],
  '.m4a': ['audio/mp4'],
};

export const ALLOWED_MIME_TYPES = Object.values(EXTENSION_TO_MIME_TYPES).flat();

const LEGACY_OFFICE_EXTENSIONS = new Set<AllowedAttachmentExtension>([
  '.doc',
  '.xls',
  '.ppt',
]);

const OOXML_EXTENSIONS = new Set<AllowedAttachmentExtension>([
  '.docx',
  '.xlsx',
  '.pptx',
]);

const OOXML_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const LEGACY_OFFICE_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);

export interface AttachmentValidationResult {
  allowed: boolean;
  normalizedMimeType: string;
  reason?: string;
}

export interface AttachmentFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.slice(lastDot).toLowerCase();
}

function isDangerousExtension(ext: string): boolean {
  return (DANGEROUS_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext);
}

function isAllowedExtension(ext: string): ext is AllowedAttachmentExtension {
  return (ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext);
}

function hasExecutableSignature(buffer: Buffer): boolean {
  if (buffer.length < 2) return false;
  // Windows executables / DLLs
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) return true;
  // Shell scripts
  if (buffer.slice(0, 2).toString() === '#!') return true;
  // PHP files
  if (buffer.slice(0, 5).toString().toLowerCase() === '<?php') return true;
  return false;
}

type FileTypeResult = { mime: string } | undefined;

async function detectMimeType(buffer: Buffer): Promise<string | undefined> {
  try {
    const { fileTypeFromBuffer } = (await import('file-type')) as {
      fileTypeFromBuffer: (buffer: Buffer) => Promise<FileTypeResult>;
    };
    const result = await fileTypeFromBuffer(buffer);
    return result?.mime;
  } catch {
    return undefined;
  }
}

export function validateAttachmentMetadata(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): AttachmentValidationResult {
  if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      allowed: false,
      normalizedMimeType: mimeType,
      reason: 'File exceeds maximum size of 10 MB',
    };
  }

  const ext = getExtension(filename);

  if (isDangerousExtension(ext) || !isAllowedExtension(ext)) {
    return {
      allowed: false,
      normalizedMimeType: mimeType,
      reason: 'Unsupported file type',
    };
  }

  const expectedMimes = EXTENSION_TO_MIME_TYPES[ext];
  const declared = mimeType.toLowerCase();

  if (expectedMimes.includes(declared)) {
    return { allowed: true, normalizedMimeType: declared };
  }

  // Some browsers/clients send empty or generic MIME types; accept if extension
  // is in the whitelist and the client did not send a dangerous MIME.
  if (!declared || declared === 'application/octet-stream') {
    return { allowed: true, normalizedMimeType: expectedMimes[0] };
  }

  // Legacy Office CFB/OLE files are magic-byte ambiguous; accept by extension.
  if (LEGACY_OFFICE_EXTENSIONS.has(ext)) {
    return { allowed: true, normalizedMimeType: expectedMimes[0] };
  }

  return {
    allowed: false,
    normalizedMimeType: declared,
    reason: 'Unsupported file type',
  };
}

export async function validateAttachmentFile(
  file: AttachmentFileLike,
): Promise<AttachmentValidationResult> {
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      allowed: false,
      normalizedMimeType: file.mimetype,
      reason: 'File exceeds maximum size of 10 MB',
    };
  }

  const ext = getExtension(file.originalname);

  if (isDangerousExtension(ext) || !isAllowedExtension(ext)) {
    return {
      allowed: false,
      normalizedMimeType: file.mimetype,
      reason: 'Unsupported file type',
    };
  }

  if (hasExecutableSignature(file.buffer)) {
    return {
      allowed: false,
      normalizedMimeType: file.mimetype,
      reason: 'Unsupported file type',
    };
  }

  const expectedMimes = EXTENSION_TO_MIME_TYPES[ext];
  const declared = (file.mimetype || '').toLowerCase();
  const detected = await detectMimeType(file.buffer);

  const declaredMatches = expectedMimes.includes(declared);
  const detectedMatches = detected ? expectedMimes.includes(detected) : false;

  // Images, PDF, plain text, etc. — magic bytes and declared MIME should agree
  // with the extension.
  if (detectedMatches) {
    return { allowed: true, normalizedMimeType: detected! };
  }

  // OOXML files are ZIP archives internally. file-type may identify them as the
  // specific OOXML type, as application/zip, or undefined for tiny stubs. If
  // file-type detects something else (e.g. an executable renamed to .docx),
  // reject it.
  if (OOXML_EXTENSIONS.has(ext)) {
    if (
      detected &&
      detected !== 'application/zip' &&
      !OOXML_MIME_TYPES.has(detected)
    ) {
      return {
        allowed: false,
        normalizedMimeType: declared,
        reason: 'Unsupported file type',
      };
    }
    return { allowed: true, normalizedMimeType: expectedMimes[0] };
  }

  // Legacy Office CFB/OLE containers are often mis-detected as application/msword
  // regardless of whether they are Word, Excel, or PowerPoint. Trust the
  // extension for these formats.
  if (LEGACY_OFFICE_EXTENSIONS.has(ext)) {
    if (detected && LEGACY_OFFICE_MIME_TYPES.has(detected)) {
      return { allowed: true, normalizedMimeType: expectedMimes[0] };
    }
    if (
      declaredMatches ||
      !declared ||
      declared === 'application/octet-stream'
    ) {
      return { allowed: true, normalizedMimeType: expectedMimes[0] };
    }
    return {
      allowed: false,
      normalizedMimeType: declared,
      reason: 'Unsupported file type',
    };
  }

  // Plain text formats (txt, csv, rtf) may not have reliable magic bytes.
  // Accept them when the declared MIME is reasonable or empty.
  if (
    (ext === '.txt' || ext === '.csv' || ext === '.rtf') &&
    (declaredMatches ||
      !declared ||
      declared === 'application/octet-stream' ||
      declared.startsWith('text/') ||
      declared === 'application/csv')
  ) {
    return { allowed: true, normalizedMimeType: expectedMimes[0] };
  }

  if (declaredMatches) {
    return { allowed: true, normalizedMimeType: declared };
  }

  return {
    allowed: false,
    normalizedMimeType: declared,
    reason: 'Unsupported file type',
  };
}

export function assertAttachmentAllowed(
  result: AttachmentValidationResult,
): string {
  if (!result.allowed) {
    throw new BadRequestException(
      result.reason || 'Unsupported attachment type',
    );
  }
  return result.normalizedMimeType;
}
