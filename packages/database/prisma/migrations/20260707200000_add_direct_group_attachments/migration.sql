-- Add direct and group message attachment support

-- AddForeignKey
ALTER TABLE "Attachment" ADD COLUMN "directMessageId" UUID;

-- AddForeignKey
ALTER TABLE "Attachment" ADD COLUMN "groupMessageId" UUID;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_directMessageId_fkey" FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_groupMessageId_fkey" FOREIGN KEY ("groupMessageId") REFERENCES "GroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Attachment_directMessageId_idx" ON "Attachment"("directMessageId");

-- CreateIndex
CREATE INDEX "Attachment_groupMessageId_idx" ON "Attachment"("groupMessageId");
