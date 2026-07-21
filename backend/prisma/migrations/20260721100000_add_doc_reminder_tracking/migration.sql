-- AlterTable (idempotent: production already has this via the bootstrap safety net)
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "lastDocReminderAt" TIMESTAMP(3);
