import { BadRequestException } from '@nestjs/common';
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  DANGEROUS_ATTACHMENT_EXTENSIONS,
  EXTENSION_TO_MIME_TYPE,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
  MAX_TOTAL_ATTACHMENT_SIZE_BYTES,
  getAttachmentCategory,
  getAttachmentExtension,
  getCategoryMaxSizeBytes,
  isAllowedAttachmentExtension,
  isDangerousAttachmentExtension,
  type AllowedAttachmentExtension,
  type AttachmentCategory,
} from '@lets-chat/shared';

export {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_ATTACHMENT_MIME_TYPES as ALLOWED_MIME_TYPES,
  DANGEROUS_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
  MAX_TOTAL_ATTACHMENT_SIZE_BYTES,
};

const CANONICAL_EXTENSION_TO_MIME_TYPE = EXTENSION_TO_MIME_TYPE;

/**
 * Extension -> accepted MIME types, including aliases. This preserves the
 * existing validation behaviour while keeping the canonical map in one place.
 */
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
  'application/x-cfb',
]);

export type AttachmentValidationErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'TOTAL_ATTACHMENTS_TOO_LARGE'
  | 'TOO_MANY_ATTACHMENTS';

export interface AttachmentValidationResult {
  allowed: boolean;
  normalizedMimeType: string;
  code?: AttachmentValidationErrorCode;
  reason?: string;
}

export interface AttachmentFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  path?: string;
}

export interface AttachmentBatchItem {
  mimeType: string;
  sizeBytes: number;
}

function getExtension(filename: string): string {
  return getAttachmentExtension(filename);
}

function getCategoryForFile(
  filename: string,
  mimeType: string,
): AttachmentCategory {
  const declared = (mimeType || '').toLowerCase();
  if (ALLOWED_ATTACHMENT_MIME_TYPES.includes(declared)) {
    return getAttachmentCategory(declared);
  }
  const ext = getExtension(filename);
  if (isAllowedAttachmentExtension(ext)) {
    const canonical = CANONICAL_EXTENSION_TO_MIME_TYPE[ext];
    return getAttachmentCategory(canonical);
  }
  return getAttachmentCategory(declared);
}

function getCategoryMaxSizeBytesForFile(
  filename: string,
  mimeType: string,
): number {
  return getCategoryMaxSizeBytes(getCategoryForFile(filename, mimeType));
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

async function detectMimeTypeFromBuffer(
  buffer: Buffer,
): Promise<string | undefined> {
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

async function detectMimeTypeFromPath(
  filePath: string,
): Promise<string | undefined> {
  try {
    const { fileTypeFromFile } = (await import('file-type')) as {
      fileTypeFromFile: (path: string) => Promise<FileTypeResult>;
    };
    const result = await fileTypeFromFile(filePath);
    return result?.mime;
  } catch {
    return undefined;
  }
}

function getDetectedMimeType(
  file: AttachmentFileLike,
): Promise<string | undefined> {
  if (file.buffer && file.buffer.length > 0) {
    return detectMimeTypeFromBuffer(file.buffer);
  }
  if (file.path) {
    return detectMimeTypeFromPath(file.path);
  }
  return Promise.resolve(undefined);
}

function makeResult(
  allowed: boolean,
  normalizedMimeType: string,
  code?: AttachmentValidationErrorCode,
  reason?: string,
): AttachmentValidationResult {
  return { allowed, normalizedMimeType, code, reason };
}

function getHardSizeLimit(): number {
  return MAX_ATTACHMENT_SIZE_BYTES;
}

export function validateAttachmentMetadata(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): AttachmentValidationResult {
  const declared = (mimeType || '').toLowerCase();
  const ext = getExtension(filename);

  if (isDangerousAttachmentExtension(ext)) {
    return makeResult(
      false,
      declared,
      'UNSUPPORTED_FILE_TYPE',
      'Unsupported file type',
    );
  }

  if (!isAllowedAttachmentExtension(ext)) {
    return makeResult(
      false,
      declared,
      'UNSUPPORTED_FILE_TYPE',
      'Unsupported file type',
    );
  }

  // Reject files that exceed the hard cap before we do anything else.
  if (sizeBytes > getHardSizeLimit()) {
    return makeResult(
      false,
      declared,
      'FILE_TOO_LARGE',
      'File exceeds maximum allowed size',
    );
  }

  const categoryMax = getCategoryMaxSizeBytesForFile(filename, mimeType);
  if (sizeBytes > categoryMax) {
    return makeResult(
      false,
      declared,
      'FILE_TOO_LARGE',
      `File exceeds maximum size for this file type`,
    );
  }

  const expectedMimes = EXTENSION_TO_MIME_TYPES[ext];

  if (expectedMimes.includes(declared)) {
    return makeResult(true, declared);
  }

  // Some browsers/clients send empty or generic MIME types; accept if extension
  // is in the whitelist and the client did not send a dangerous MIME.
  if (!declared || declared === 'application/octet-stream') {
    return makeResult(true, expectedMimes[0]);
  }

  // Legacy Office CFB/OLE files are magic-byte ambiguous; accept by extension.
  if (LEGACY_OFFICE_EXTENSIONS.has(ext)) {
    return makeResult(true, expectedMimes[0]);
  }

  return makeResult(
    false,
    declared,
    'UNSUPPORTED_FILE_TYPE',
    'Unsupported file type',
  );
}

export async function validateAttachmentFile(
  file: AttachmentFileLike,
): Promise<AttachmentValidationResult> {
  const declared = (file.mimetype || '').toLowerCase();
  const ext = getExtension(file.originalname);

  if (isDangerousAttachmentExtension(ext)) {
    return makeResult(
      false,
      declared,
      'UNSUPPORTED_FILE_TYPE',
      'Unsupported file type',
    );
  }

  if (!isAllowedAttachmentExtension(ext)) {
    return makeResult(
      false,
      declared,
      'UNSUPPORTED_FILE_TYPE',
      'Unsupported file type',
    );
  }

  if (file.size > getHardSizeLimit()) {
    return makeResult(
      false,
      declared,
      'FILE_TOO_LARGE',
      'File exceeds maximum allowed size',
    );
  }

  const categoryMax = getCategoryMaxSizeBytesForFile(
    file.originalname,
    file.mimetype,
  );
  if (file.size > categoryMax) {
    return makeResult(
      false,
      declared,
      'FILE_TOO_LARGE',
      'File exceeds maximum size for this file type',
    );
  }

  if (file.buffer && hasExecutableSignature(file.buffer)) {
    return makeResult(
      false,
      declared,
      'UNSUPPORTED_FILE_TYPE',
      'Unsupported file type',
    );
  }

  const expectedMimes = EXTENSION_TO_MIME_TYPES[ext];
  const detected = await getDetectedMimeType(file);

  const declaredMatches = expectedMimes.includes(declared);
  const detectedMatches = detected ? expectedMimes.includes(detected) : false;

  // Images, PDF, plain text, etc. — magic bytes and declared MIME should agree
  // with the extension.
  if (detectedMatches) {
    return makeResult(true, detected!);
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
      return makeResult(
        false,
        declared,
        'UNSUPPORTED_FILE_TYPE',
        'Unsupported file type',
      );
    }
    return makeResult(true, expectedMimes[0]);
  }

  // Legacy Office CFB/OLE containers are often mis-detected as application/msword
  // or application/x-cfb regardless of whether they are Word, Excel, or
  // PowerPoint. Trust the extension for these formats.
  if (LEGACY_OFFICE_EXTENSIONS.has(ext)) {
    if (detected && LEGACY_OFFICE_MIME_TYPES.has(detected)) {
      return makeResult(true, expectedMimes[0]);
    }
    if (
      declaredMatches ||
      !declared ||
      declared === 'application/octet-stream'
    ) {
      return makeResult(true, expectedMimes[0]);
    }
    return makeResult(
      false,
      declared,
      'UNSUPPORTED_FILE_TYPE',
      'Unsupported file type',
    );
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
    return makeResult(true, expectedMimes[0]);
  }

  if (declaredMatches) {
    return makeResult(true, declared);
  }

  return makeResult(
    false,
    declared,
    'UNSUPPORTED_FILE_TYPE',
    'Unsupported file type',
  );
}

/**
 * Validate a batch of attachments for a single message.
 * Enforces count limits and total size cap.
 */
export function validateAttachmentBatch(
  items: AttachmentBatchItem[],
): AttachmentValidationResult {
  if (items.length === 0) {
    return makeResult(true, '');
  }

  const allImage = items.every(
    (item) => getAttachmentCategory(item.mimeType) === 'image',
  );
  const maxCount = allImage
    ? MAX_IMAGE_ATTACHMENTS_PER_MESSAGE
    : MAX_ATTACHMENTS_PER_MESSAGE;

  if (items.length > maxCount) {
    return makeResult(
      false,
      '',
      'TOO_MANY_ATTACHMENTS',
      allImage
        ? `You can attach up to ${MAX_IMAGE_ATTACHMENTS_PER_MESSAGE} images per message`
        : `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`,
    );
  }

  const totalSize = items.reduce((sum, item) => sum + item.sizeBytes, 0);
  if (totalSize > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
    return makeResult(
      false,
      '',
      'TOTAL_ATTACHMENTS_TOO_LARGE',
      `Total attachment size must not exceed ${MAX_TOTAL_ATTACHMENT_SIZE_BYTES / (1024 * 1024)} MB`,
    );
  }

  return makeResult(true, '');
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

export function assertAttachmentBatchAllowed(
  result: AttachmentValidationResult,
): void {
  if (!result.allowed) {
    throw new BadRequestException(result.reason || 'Invalid attachment batch');
  }
}
