-- Add permanent-delete timestamp to Workspace
ALTER TABLE "Workspace" ADD COLUMN "permanentlyDeletedAt" TIMESTAMP(3);

-- Index for active/archived workspace queries
CREATE INDEX "Workspace_ownerId_permanentlyDeletedAt_idx" ON "Workspace"("ownerId", "permanentlyDeletedAt");
