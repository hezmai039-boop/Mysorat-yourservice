-- CreateEnum
CREATE TYPE "CustomerSegment" AS ENUM ('NEW', 'REGULAR', 'VIP', 'AT_RISK');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "segment" "CustomerSegment" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "segmentOverridden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "User_segment_idx" ON "User"("segment");
