
-- AlterTable (idempotent: production already has these columns via the
-- bootstrap safety net, so plain ADD COLUMN would fail and block the chain)
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
