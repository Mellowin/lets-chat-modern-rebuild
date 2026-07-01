-- AlterTable
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mentions" JSONB;

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN IF NOT EXISTS "mentions" JSONB;

-- AlterTable
ALTER TABLE "GroupMessage" ADD COLUMN IF NOT EXISTS "mentions" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mentionNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "directMessageNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "groupMessageNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "channelMessageNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
