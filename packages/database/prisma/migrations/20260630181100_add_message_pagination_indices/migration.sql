-- DropIndex
DROP INDEX IF EXISTS "DirectMessage_conversationId_createdAt_idx";

-- CreateIndex
CREATE INDEX "DirectMessage_conversationId_createdAt_id_idx" ON "DirectMessage"("conversationId", "createdAt", "id");

-- DropIndex
DROP INDEX IF EXISTS "GroupMessage_groupId_createdAt_idx";

-- CreateIndex
CREATE INDEX "GroupMessage_groupId_createdAt_id_idx" ON "GroupMessage"("groupId", "createdAt", "id");
