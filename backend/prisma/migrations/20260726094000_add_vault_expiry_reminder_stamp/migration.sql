-- AlterTable
ALTER TABLE "CustomerDocument" ADD COLUMN IF NOT EXISTS "lastExpiryReminderAt" TIMESTAMP(3);
