-- RestoreUniqueAttachmentStorageKey
DROP INDEX IF EXISTS "Attachment_storageKey_idx";

-- RestoreUniqueAttachmentStorageKey
CREATE UNIQUE INDEX IF NOT EXISTS "Attachment_storageKey_key" ON "Attachment"("storageKey");
