-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "UserReport" ADD COLUMN IF NOT EXISTS "adminNote" TEXT;

-- AlterTable
ALTER TABLE "UserReport" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserReport" ADD COLUMN IF NOT EXISTS "reviewedBy" UUID;

-- AddForeignKey
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reviewedBy_fkey"
  FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;