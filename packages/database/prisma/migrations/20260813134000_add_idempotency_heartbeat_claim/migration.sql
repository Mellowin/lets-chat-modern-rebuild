-- Add fencing claim and heartbeat to idempotency rows so a live operation cannot be reclaimed by another instance.

ALTER TABLE "AccountDeletionIdempotency" ADD COLUMN "claimToken" UUID;
ALTER TABLE "AccountDeletionIdempotency" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

CREATE INDEX "AccountDeletionIdempotency_claimToken_idx" ON "AccountDeletionIdempotency"("claimToken");
