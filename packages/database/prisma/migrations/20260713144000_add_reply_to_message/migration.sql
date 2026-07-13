-- AlterTable
ALTER TABLE "Message" ADD COLUMN "replyToMessageId" UUID;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Message_replyToMessageId_idx" ON "Message"("replyToMessageId");

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN "replyToMessageId" UUID;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "DirectMessage_replyToMessageId_idx" ON "DirectMessage"("replyToMessageId");

-- AlterTable
ALTER TABLE "GroupMessage" ADD COLUMN "replyToMessageId" UUID;

-- AddForeignKey
ALTER TABLE "GroupMessage" ADD CONSTRAINT "GroupMessage_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "GroupMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "GroupMessage_replyToMessageId_idx" ON "GroupMessage"("replyToMessageId");
