-- CreateTable
CREATE TABLE "PinnedChannelMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "messageId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "pinnedByUserId" UUID,
    "pinnedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedChannelMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PinnedChannelMessage_messageId_key" ON "PinnedChannelMessage"("messageId");

-- CreateIndex
CREATE INDEX "PinnedChannelMessage_channelId_pinnedAt_id_idx" ON "PinnedChannelMessage"("channelId", "pinnedAt", "id");

-- CreateIndex
CREATE INDEX "PinnedChannelMessage_pinnedAt_idx" ON "PinnedChannelMessage"("pinnedAt");

-- AddForeignKey
ALTER TABLE "PinnedChannelMessage" ADD CONSTRAINT "PinnedChannelMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedChannelMessage" ADD CONSTRAINT "PinnedChannelMessage_pinnedByUserId_fkey" FOREIGN KEY ("pinnedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PinnedDirectMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "messageId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "pinnedByUserId" UUID,
    "pinnedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedDirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PinnedDirectMessage_messageId_key" ON "PinnedDirectMessage"("messageId");

-- CreateIndex
CREATE INDEX "PinnedDirectMessage_conversationId_pinnedAt_id_idx" ON "PinnedDirectMessage"("conversationId", "pinnedAt", "id");

-- CreateIndex
CREATE INDEX "PinnedDirectMessage_pinnedAt_idx" ON "PinnedDirectMessage"("pinnedAt");

-- AddForeignKey
ALTER TABLE "PinnedDirectMessage" ADD CONSTRAINT "PinnedDirectMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedDirectMessage" ADD CONSTRAINT "PinnedDirectMessage_pinnedByUserId_fkey" FOREIGN KEY ("pinnedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PinnedGroupMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "messageId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "pinnedByUserId" UUID,
    "pinnedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedGroupMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PinnedGroupMessage_messageId_key" ON "PinnedGroupMessage"("messageId");

-- CreateIndex
CREATE INDEX "PinnedGroupMessage_groupId_pinnedAt_id_idx" ON "PinnedGroupMessage"("groupId", "pinnedAt", "id");

-- CreateIndex
CREATE INDEX "PinnedGroupMessage_pinnedAt_idx" ON "PinnedGroupMessage"("pinnedAt");

-- AddForeignKey
ALTER TABLE "PinnedGroupMessage" ADD CONSTRAINT "PinnedGroupMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "GroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedGroupMessage" ADD CONSTRAINT "PinnedGroupMessage_pinnedByUserId_fkey" FOREIGN KEY ("pinnedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
