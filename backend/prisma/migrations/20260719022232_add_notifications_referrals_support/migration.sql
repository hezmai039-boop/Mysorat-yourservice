-- CreateEnum
CREATE TYPE "SupportRequestStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- AlterTable
ALTER TABLE "Operation" ADD COLUMN     "creditAppliedSar" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
-- referralCode is added nullable first so existing rows (a real, already
-- populated User table in production) can be backfilled with a unique value
-- before the NOT NULL + UNIQUE constraints are applied - a bare NOT NULL ADD
-- COLUMN with no default would fail outright on any non-empty table.
ALTER TABLE "User" ADD COLUMN     "creditSar" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referralRewardGranted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "smsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "whatsappNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing users with a unique referral code before enforcing NOT NULL.
UPDATE "User" SET "referralCode" = upper(substr(md5(random()::text || "id"), 1, 8)) WHERE "referralCode" IS NULL;

ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SupportRequestStatus" NOT NULL DEFAULT 'OPEN',
    "ownerReply" TEXT,
    "ownerReplyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "SupportRequest_userId_idx" ON "SupportRequest"("userId");

-- CreateIndex
CREATE INDEX "SupportRequest_status_idx" ON "SupportRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
