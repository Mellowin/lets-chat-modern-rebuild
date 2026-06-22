/**
 * Shared attachment validation constants used by both API and web.
 *
 * Keep this file free of framework-specific code so it can be imported
 * from either app without extra dependencies.
 */

export const AttachmentCategory = {
  IMAGE: 'image',
  DOCUMENT: 'document',
  ARCHIVE: 'archive',
  AUDIO: 'audio',
  VIDEO: 'video',
} as const;

export type AttachmentCategory =
  (typeof AttachmentCategory)[keyof typeof AttachmentCategory];

/** Largest allowed single upload. Used as a hard cap by middleware/DTOs. */
export const MAX_ATTACHMENT_SIZE_BYTES = 100 * 1024 * 1024;

export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_IMAGE_ATTACHMENTS_PER_MESSAGE = 20;
export const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 150 * 1024 * 1024;

export const ATTACHMENT_CATEGORY_MAX_SIZE_BYTES: Record<
  AttachmentCategory,
  number
> = {
  [AttachmentCategory.IMAGE]: 25 * 1024 * 1024,
  [AttachmentCategory.DOCUMENT]: 50 * 1024 * 1024,
  [AttachmentCategory.ARCHIVE]: 50 * 1024 * 1024,
  [AttachmentCategory.AUDIO]: 50 * 1024 * 1024,
  [AttachmentCategory.VIDEO]: 100 * 1024 * 1024,
};

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
  '.svg',
  '.php',
  '.jar',
  '.dll',
  '.scr',
  '.com',
  '.vbs',
] as const;

/**
 * Canonical MIME type for each allowed extension.
 * Used for normalization and for mapping extension-only hints.
 */
export const EXTENSION_TO_MIME_TYPE: Record<
  AllowedAttachmentExtension,
  string
> = {
  // images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  // documents
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.rtf': 'application/rtf',
  // Microsoft Word
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Microsoft Excel
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  // Microsoft PowerPoint
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // OpenDocument
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  // archives
  '.zip': 'application/zip',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
  // video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  // audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

/**
 * Full allow-list of MIME types, including aliases that browsers/clients may
 * send (e.g. text/rtf, application/x-rar-compressed).
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  ...new Set([
    ...Object.values(EXTENSION_TO_MIME_TYPE),
    'text/rtf',
    'application/csv',
    'application/x-rar-compressed',
  ]),
];

/** Map MIME types to category for per-category size limits. */
export const MIME_TYPE_TO_CATEGORY: Record<string, AttachmentCategory> = {
  // images
  'image/png': AttachmentCategory.IMAGE,
  'image/jpeg': AttachmentCategory.IMAGE,
  'image/webp': AttachmentCategory.IMAGE,
  'image/gif': AttachmentCategory.IMAGE,
  // documents
  'application/pdf': AttachmentCategory.DOCUMENT,
  'text/plain': AttachmentCategory.DOCUMENT,
  'application/rtf': AttachmentCategory.DOCUMENT,
  'text/rtf': AttachmentCategory.DOCUMENT,
  'application/msword': AttachmentCategory.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    AttachmentCategory.DOCUMENT,
  'application/vnd.ms-excel': AttachmentCategory.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    AttachmentCategory.DOCUMENT,
  'text/csv': AttachmentCategory.DOCUMENT,
  'application/csv': AttachmentCategory.DOCUMENT,
  'application/vnd.ms-powerpoint': AttachmentCategory.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    AttachmentCategory.DOCUMENT,
  'application/vnd.oasis.opendocument.text': AttachmentCategory.DOCUMENT,
  'application/vnd.oasis.opendocument.spreadsheet': AttachmentCategory.DOCUMENT,
  'application/vnd.oasis.opendocument.presentation': AttachmentCategory.DOCUMENT,
  // archives
  'application/zip': AttachmentCategory.ARCHIVE,
  'application/x-7z-compressed': AttachmentCategory.ARCHIVE,
  'application/vnd.rar': AttachmentCategory.ARCHIVE,
  'application/x-rar-compressed': AttachmentCategory.ARCHIVE,
  // video
  'video/mp4': AttachmentCategory.VIDEO,
  'video/webm': AttachmentCategory.VIDEO,
  'video/quicktime': AttachmentCategory.VIDEO,
  'video/x-msvideo': AttachmentCategory.VIDEO,
  'video/x-matroska': AttachmentCategory.VIDEO,
  // audio
  'audio/mpeg': AttachmentCategory.AUDIO,
  'audio/wav': AttachmentCategory.AUDIO,
  'audio/ogg': AttachmentCategory.AUDIO,
  'audio/mp4': AttachmentCategory.AUDIO,
};

export function getAttachmentExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.slice(lastDot).toLowerCase();
}

export function getAttachmentMimeType(
  filename: string,
  declaredType?: string,
): string {
  if (declaredType) return declaredType;
  const ext = getAttachmentExtension(filename);
  return EXTENSION_TO_MIME_TYPE[ext as AllowedAttachmentExtension] || 'application/octet-stream';
}

export function getAttachmentCategory(mimeType: string): AttachmentCategory {
  const normalized = (mimeType || '').toLowerCase().trim();
  return MIME_TYPE_TO_CATEGORY[normalized] ?? AttachmentCategory.DOCUMENT;
}

export function getCategoryMaxSizeBytes(category: AttachmentCategory): number {
  return ATTACHMENT_CATEGORY_MAX_SIZE_BYTES[category];
}

export function isDangerousAttachmentExtension(ext: string): boolean {
  return (DANGEROUS_ATTACHMENT_EXTENSIONS as readonly string[]).includes(
    ext.toLowerCase(),
  );
}

export function isAllowedAttachmentExtension(ext: string): ext is AllowedAttachmentExtension {
  return (ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(
    ext.toLowerCase() as AllowedAttachmentExtension,
  );
}
