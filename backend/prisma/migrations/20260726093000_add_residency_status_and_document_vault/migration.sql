-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ResidencyStatus" AS ENUM ('CITIZEN', 'RESIDENT', 'VISITOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "sourceCustomerDocumentId" TEXT;

-- AlterTable
ALTER TABLE "IndividualProfile" ADD COLUMN IF NOT EXISTS "residencyStatus" "ResidencyStatus";

-- AlterTable: @updatedAt is client-managed in Prisma and should carry no DB
-- default. Guarded like everything else here: this statement is incidental to
-- this migration (it only exists because the Playbook migration created the
-- column with a default), and this project has a documented history of the
-- Playbook migration going missing from main. Unguarded, an absent Playbook
-- table would raise 42P01 and abort the transaction before CustomerDocument
-- is ever created - taking the whole feature down over an unrelated table.
DO $$ BEGIN
  ALTER TABLE "Playbook" ALTER COLUMN "updatedAt" DROP DEFAULT;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "fileUrl" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "verificationNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerDocument_userId_idx" ON "CustomerDocument"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerDocument_expiresAt_idx" ON "CustomerDocument"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerDocument_userId_docType_key" ON "CustomerDocument"("userId", "docType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Document_sourceCustomerDocumentId_idx" ON "Document"("sourceCustomerDocumentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IndividualProfile_residencyStatus_idx" ON "IndividualProfile"("residencyStatus");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceCustomerDocumentId_fkey" FOREIGN KEY ("sourceCustomerDocumentId") REFERENCES "CustomerDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
