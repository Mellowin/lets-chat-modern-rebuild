-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "permanentlyDeletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Channel_workspaceId_permanentlyDeletedAt_idx" ON "Channel"("workspaceId", "permanentlyDeletedAt");
