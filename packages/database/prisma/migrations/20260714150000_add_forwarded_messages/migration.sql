-- AddForwardMetadata
ALTER TABLE "Message" ADD COLUMN "forwardedFrom" JSONB;

-- AddForwardMetadata
ALTER TABLE "DirectMessage" ADD COLUMN "forwardedFrom" JSONB;

-- AddForwardMetadata
ALTER TABLE "GroupMessage" ADD COLUMN "forwardedFrom" JSONB;

-- DropUniqueStorageKey
DROP INDEX IF EXISTS "Attachment_storageKey_key";

-- CreateStorageKeyIndex
CREATE INDEX "Attachment_storageKey_idx" ON "Attachment"("storageKey");
