-- AlterTable
ALTER TABLE "User" ADD COLUMN "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
