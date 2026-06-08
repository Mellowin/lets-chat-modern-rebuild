-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordResetTokenHash" TEXT,
ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetSentAt" TIMESTAMP(3),
ADD COLUMN     "pendingEmail" TEXT,
ADD COLUMN     "emailChangeTokenHash" TEXT,
ADD COLUMN     "emailChangeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailChangeSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_passwordResetTokenHash_idx" ON "User"("passwordResetTokenHash");

-- CreateIndex
CREATE INDEX "User_emailChangeTokenHash_idx" ON "User"("emailChangeTokenHash");
