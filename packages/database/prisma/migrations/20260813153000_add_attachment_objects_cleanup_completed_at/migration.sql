-- AlterTable
ALTER TABLE "User" ADD COLUMN "attachmentObjectsCleanupCompletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "idx_user_status_attachmentObjectsCleanupCompletedAt" ON "User" ("status", "attachmentObjectsCleanupCompletedAt") WHERE "status" = 'ANONYMIZED';
