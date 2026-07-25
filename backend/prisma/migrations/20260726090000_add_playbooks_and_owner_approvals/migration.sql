-- Playbooks (institutional memory) + the owner's permission inbox.
-- Written idempotently, matching this project's convention: production may
-- already have these objects via the bootstrap safety net.

DO $$ BEGIN
  CREATE TYPE "PlaybookStatus" AS ENUM ('PROPOSED', 'APPROVED', 'AUTO', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OwnerApprovalKind" AS ENUM ('PLAYBOOK_PROPOSAL', 'PLAYBOOK_AUTONOMY', 'AUTO_ACTION_NOTICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OwnerApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ACKNOWLEDGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Playbook" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "serviceCode" TEXT NOT NULL,
  "serviceNameAr" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "PlaybookStatus" NOT NULL DEFAULT 'PROPOSED',
  "data" JSONB NOT NULL,
  "learnedFrom" INTEGER NOT NULL DEFAULT 0,
  "timesUsed" INTEGER NOT NULL DEFAULT 0,
  "timesSucceeded" INTEGER NOT NULL DEFAULT 0,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "autonomyAt" TIMESTAMP(3),
  "ownerNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Playbook_serviceId_version_key" ON "Playbook"("serviceId", "version");
CREATE INDEX IF NOT EXISTS "Playbook_status_idx" ON "Playbook"("status");

CREATE TABLE IF NOT EXISTS "OwnerApproval" (
  "id" TEXT NOT NULL,
  "kind" "OwnerApprovalKind" NOT NULL,
  "status" "OwnerApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "titleAr" TEXT NOT NULL,
  "summaryAr" TEXT NOT NULL,
  "playbookId" TEXT,
  "operationId" TEXT,
  "payload" JSONB,
  "decidedAt" TIMESTAMP(3),
  "decidedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OwnerApproval_status_idx" ON "OwnerApproval"("status");
CREATE INDEX IF NOT EXISTS "OwnerApproval_kind_idx" ON "OwnerApproval"("kind");
