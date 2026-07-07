-- CreateEnum
CREATE TYPE "ContactPrivacySetting" AS ENUM ('EVERYONE', 'REQUESTS_ONLY', 'NOBODY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "contactPrivacySetting" "ContactPrivacySetting" NOT NULL DEFAULT 'REQUESTS_ONLY';

-- CreateEnum
CREATE TYPE "ContactRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" UUID NOT NULL,
    "fromUserId" UUID NOT NULL,
    "toUserId" UUID NOT NULL,
    "status" "ContactRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "declinedAt" TIMESTAMP(3),

    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactRequest_fromUserId_toUserId_key" ON "ContactRequest"("fromUserId", "toUserId");

-- CreateIndex
CREATE INDEX "ContactRequest_toUserId_status_idx" ON "ContactRequest"("toUserId", "status");

-- CreateIndex
CREATE INDEX "ContactRequest_fromUserId_status_idx" ON "ContactRequest"("fromUserId", "status");

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
