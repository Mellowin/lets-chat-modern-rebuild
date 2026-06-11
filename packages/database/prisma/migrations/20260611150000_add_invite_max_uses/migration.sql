-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "maxUses" INTEGER,
ADD COLUMN     "usesCount" INTEGER NOT NULL DEFAULT 0;
