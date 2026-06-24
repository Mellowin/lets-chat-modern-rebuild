-- CreateTable
CREATE TABLE "UserContact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerUserId" UUID NOT NULL,
    "contactUserId" UUID NOT NULL,
    "nickname" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupInviteLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "groupId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "roleOnJoin" "GroupRole" NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "GroupInviteLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserContact_ownerUserId_contactUserId_key" ON "UserContact"("ownerUserId", "contactUserId");

-- CreateIndex
CREATE INDEX "UserContact_ownerUserId_idx" ON "UserContact"("ownerUserId");

-- CreateIndex
CREATE INDEX "UserContact_contactUserId_idx" ON "UserContact"("contactUserId");

-- CreateIndex
CREATE INDEX "UserContact_ownerUserId_deletedAt_idx" ON "UserContact"("ownerUserId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupInviteLink_tokenHash_key" ON "GroupInviteLink"("tokenHash");

-- CreateIndex
CREATE INDEX "GroupInviteLink_groupId_idx" ON "GroupInviteLink"("groupId");

-- CreateIndex
CREATE INDEX "GroupInviteLink_createdById_idx" ON "GroupInviteLink"("createdById");

-- CreateIndex
CREATE INDEX "GroupInviteLink_groupId_revokedAt_expiresAt_idx" ON "GroupInviteLink"("groupId", "revokedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "UserContact" ADD CONSTRAINT "UserContact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContact" ADD CONSTRAINT "UserContact_contactUserId_fkey" FOREIGN KEY ("contactUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInviteLink" ADD CONSTRAINT "GroupInviteLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInviteLink" ADD CONSTRAINT "GroupInviteLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
