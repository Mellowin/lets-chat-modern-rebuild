-- B238A — Add durable idempotency storage for account deletion requests.
--
-- Stores a one-way body hash for each Idempotency-Key so retries and restarts
-- return the same scheduled deletion time without re-issuing cancellation tokens.
-- Expired rows are cleaned up by the application and by periodic maintenance.

CREATE TABLE "AccountDeletionIdempotency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountDeletionIdempotency_userId_idempotencyKey_key"
    ON "AccountDeletionIdempotency" ("userId", "idempotencyKey");

CREATE INDEX "AccountDeletionIdempotency_expiresAt_idx"
    ON "AccountDeletionIdempotency" ("expiresAt");

ALTER TABLE "AccountDeletionIdempotency"
    ADD CONSTRAINT "AccountDeletionIdempotency_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trigger to keep updatedAt current.
CREATE OR REPLACE FUNCTION update_account_deletion_idempotency_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_account_deletion_idempotency_updated_at_trigger
    BEFORE UPDATE ON "AccountDeletionIdempotency"
    FOR EACH ROW
    EXECUTE FUNCTION update_account_deletion_idempotency_updated_at();

-- Reversible down migration
-- DROP TRIGGER IF EXISTS update_account_deletion_idempotency_updated_at_trigger
--     ON "AccountDeletionIdempotency";
-- DROP FUNCTION IF EXISTS update_account_deletion_idempotency_updated_at();
-- ALTER TABLE "AccountDeletionIdempotency" DROP CONSTRAINT "AccountDeletionIdempotency_userId_fkey";
-- DROP INDEX "AccountDeletionIdempotency_expiresAt_idx";
-- DROP INDEX "AccountDeletionIdempotency_userId_idempotencyKey_key";
-- DROP TABLE "AccountDeletionIdempotency";
