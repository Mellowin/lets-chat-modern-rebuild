-- CreateChannelInvitationTable
CREATE TABLE "ChannelInvitation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "invitedById" UUID NOT NULL,
    "role" "ChannelRole" NOT NULL DEFAULT 'MEMBER',
    "invitedEmail" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedById" UUID,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChannelInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelInvitation_tokenHash_key" ON "ChannelInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "ChannelInvitation_channelId_createdAt_idx" ON "ChannelInvitation"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "ChannelInvitation_workspaceId_createdAt_idx" ON "ChannelInvitation"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChannelInvitation" ADD CONSTRAINT "ChannelInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelInvitation" ADD CONSTRAINT "ChannelInvitation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelInvitation" ADD CONSTRAINT "ChannelInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelInvitation" ADD CONSTRAINT "ChannelInvitation_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index for active channel invitations (same email + channel cannot have multiple pending invites)
CREATE UNIQUE INDEX idx_channel_invitation_active ON "ChannelInvitation" ("channelId", "invitedEmail") WHERE "deletedAt" IS NULL;
