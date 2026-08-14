-- CreateEnum
CREATE TYPE "AccountDeletionIdempotencyStatus" AS ENUM ('PENDING', 'COMPLETED');

-- AlterTable
ALTER TABLE "AccountDeletionIdempotency" ADD COLUMN "status" "AccountDeletionIdempotencyStatus" NOT NULL DEFAULT 'COMPLETED';

-- CreateIndex
CREATE INDEX "AccountDeletionIdempotency_status_idx" ON "AccountDeletionIdempotency"("status");
