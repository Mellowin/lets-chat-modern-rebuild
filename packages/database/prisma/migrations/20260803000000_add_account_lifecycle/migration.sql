-- B238A — Account lifecycle, data export and public-beta privacy

-- Create the user status enum. B238B will add SUSPENDED/BANNED values.
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING_DELETION', 'ANONYMIZED');

-- Add status column with default ACTIVE for existing users.
ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- Account deletion lifecycle fields.
ALTER TABLE "User"
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionScheduledFor" TIMESTAMP(3),
  ADD COLUMN "deletionCancellationTokenHash" TEXT,
  ADD COLUMN "deletionCancellationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "anonymizedAt" TIMESTAMP(3);

-- Indexes to support the finalizer and cancellation lookup.
CREATE INDEX "idx_user_status_deletionScheduledFor" ON "User" ("status", "deletionScheduledFor");
CREATE INDEX "idx_user_deletionCancellationTokenHash" ON "User" ("deletionCancellationTokenHash");
CREATE INDEX "idx_user_anonymizedAt" ON "User" ("anonymizedAt");

-- Partial unique index so cancellation token hashes cannot collide.
CREATE UNIQUE INDEX "idx_user_deletionCancellationTokenHash_unique"
  ON "User" ("deletionCancellationTokenHash")
  WHERE "deletionCancellationTokenHash" IS NOT NULL;

-- Reversible down migration
-- DROP INDEX "idx_user_deletionCancellationTokenHash_unique";
-- DROP INDEX "idx_user_anonymizedAt";
-- DROP INDEX "idx_user_deletionCancellationTokenHash";
-- DROP INDEX "idx_user_status_deletionScheduledFor";
-- ALTER TABLE "User" DROP COLUMN "anonymizedAt";
-- ALTER TABLE "User" DROP COLUMN "deletionCancellationExpiresAt";
-- ALTER TABLE "User" DROP COLUMN "deletionCancellationTokenHash";
-- ALTER TABLE "User" DROP COLUMN "deletionScheduledFor";
-- ALTER TABLE "User" DROP COLUMN "deletionRequestedAt";
-- ALTER TABLE "User" DROP COLUMN "status";
-- DROP TYPE "UserStatus";
