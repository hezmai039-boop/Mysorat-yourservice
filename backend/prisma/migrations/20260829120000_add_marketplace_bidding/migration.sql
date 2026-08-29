-- تحويل السوق: مرحلة مزايدة قبل الدفع (آلية inDrive)
-- بصيغة idempotent عمداً — شبكة الأمان في bootstrap.ts قد تكون أنشأت هذه
-- الكائنات قبل تطبيق الترحيل، والصيغة الخام كانت ستفشل عليها (انظر CLAUDE.md).

-- AlterEnum (IF NOT EXISTS مدعوم منذ PostgreSQL 9.6)
ALTER TYPE "OperationStatus" ADD VALUE IF NOT EXISTS 'BIDDING' BEFORE 'PENDING_PAYMENT';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BidStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "targetPriceSar" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "acceptedBidId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Bid" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "priceSar" DECIMAL(10,2) NOT NULL,
    "deliveryDays" INTEGER,
    "note" TEXT,
    "status" "BidStatus" NOT NULL DEFAULT 'OFFERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Operation_acceptedBidId_key" ON "Operation"("acceptedBidId");
CREATE UNIQUE INDEX IF NOT EXISTS "Bid_operationId_expertId_key" ON "Bid"("operationId", "expertId");
CREATE INDEX IF NOT EXISTS "Bid_expertId_status_idx" ON "Bid"("expertId", "status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Bid" ADD CONSTRAINT "Bid_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Bid" ADD CONSTRAINT "Bid_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
