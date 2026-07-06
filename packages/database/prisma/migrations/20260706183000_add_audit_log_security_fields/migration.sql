-- Add security and filtering fields to the existing audit log table.

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "targetUserId" UUID,
ADD COLUMN "groupId" UUID,
ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'info',
ADD COLUMN "requestId" TEXT;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt" DESC);
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog" ("entityType");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog" ("actorId");
CREATE INDEX "AuditLog_targetUserId_idx" ON "AuditLog" ("targetUserId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog" ("action");
CREATE INDEX "AuditLog_severity_idx" ON "AuditLog" ("severity");
