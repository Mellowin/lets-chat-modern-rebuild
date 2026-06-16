-- Add permanent delete timestamp to Channel
ALTER TABLE "Channel" ADD COLUMN "permanentlyDeletedAt" TIMESTAMPTZ;

-- Index for filtering active channels by workspace and permanent delete status
CREATE INDEX "idx_channel_workspace_permanently_deleted_at"
  ON "Channel" ("workspaceId", "permanentlyDeletedAt");
