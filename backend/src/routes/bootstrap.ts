import { Request, Response, Router } from "express";
import { execSync } from "child_process";
import { prisma } from "../lib/prisma";
import { seedDatabase } from "../services/seedData";
import { notifyUser } from "../services/notify";

const router = Router();

/**
 * Idempotent safety net for the exact failure mode that broke production:
 * the backend was redeployed with a Prisma schema that expects columns a
 * migration was supposed to add, but `migrate deploy` didn't actually apply
 * that migration to the live database (e.g. it ran against an earlier build
 * during a redeploy window, or an earlier migration in the chain failed and
 * blocked the rest). Every query then 500s with P2022 "column does not
 * exist", which the UI surfaces as "operation not found".
 *
 * These ADD COLUMN IF NOT EXISTS statements are harmless when the columns
 * already exist, and self-heal the database when they don't - independent of
 * the migration history table's state. Keep this list in sync with any new
 * nullable column added to a heavily-read model (User / Operation).
 */
const COLUMN_SAFETY_NET: string[] = [
  `ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT`,
  `ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "lastDocReminderAt" TIMESTAMP(3)`,
  `ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Favorite_userId_idx" ON "Favorite"("userId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_serviceId_key" ON "Favorite"("userId", "serviceId")`,
  `CREATE INDEX IF NOT EXISTS "Feedback_featured_idx" ON "Feedback"("featured")`,
  `DO $$ BEGIN
    ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Ops Room: institutional memory (Playbook) and the owner's permission inbox
  // (OwnerApproval). Enum creation has to be guarded separately - CREATE TYPE
  // has no IF NOT EXISTS form.
  `DO $$ BEGIN
    CREATE TYPE "PlaybookStatus" AS ENUM ('PROPOSED', 'APPROVED', 'AUTO', 'ARCHIVED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE TYPE "OwnerApprovalKind" AS ENUM ('PLAYBOOK_PROPOSAL', 'PLAYBOOK_AUTONOMY', 'AUTO_ACTION_NOTICE');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE TYPE "OwnerApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ACKNOWLEDGED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "Playbook" (
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
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Playbook_serviceId_version_key" ON "Playbook"("serviceId", "version")`,
  `CREATE INDEX IF NOT EXISTS "Playbook_status_idx" ON "Playbook"("status")`,
  `CREATE TABLE IF NOT EXISTS "OwnerApproval" (
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
  )`,
  `CREATE INDEX IF NOT EXISTS "OwnerApproval_status_idx" ON "OwnerApproval"("status")`,
  `CREATE INDEX IF NOT EXISTS "OwnerApproval_kind_idx" ON "OwnerApproval"("kind")`,
  // Customer classification (residency status) + document vault, so a
  // customer's ID/Iqama/CR is uploaded once and reused across operations
  // instead of re-uploaded for every new one.
  `DO $$ BEGIN
    CREATE TYPE "ResidencyStatus" AS ENUM ('CITIZEN', 'RESIDENT', 'VISITOR');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "IndividualProfile" ADD COLUMN IF NOT EXISTS "residencyStatus" "ResidencyStatus"`,
  `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "sourceCustomerDocumentId" TEXT`,
  `CREATE TABLE IF NOT EXISTS "CustomerDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "fileUrl" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "verificationNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerDocument_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CustomerDocument_userId_idx" ON "CustomerDocument"("userId")`,
  `CREATE INDEX IF NOT EXISTS "CustomerDocument_expiresAt_idx" ON "CustomerDocument"("expiresAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustomerDocument_userId_docType_key" ON "CustomerDocument"("userId", "docType")`,
  `CREATE INDEX IF NOT EXISTS "Document_sourceCustomerDocumentId_idx" ON "Document"("sourceCustomerDocumentId")`,
  `CREATE INDEX IF NOT EXISTS "IndividualProfile_residencyStatus_idx" ON "IndividualProfile"("residencyStatus")`,
  `DO $$ BEGIN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceCustomerDocumentId_fkey" FOREIGN KEY ("sourceCustomerDocumentId") REFERENCES "CustomerDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

/**
 * One-time operational endpoint to run pending migrations and seed the
 * database on hosts without shell/job access (e.g. Render's free tier).
 * Gated by a shared secret (header or query param, so it's pasteable as a
 * plain browser-address-bar link), not JWT auth, since no user exists yet
 * on first deploy.
 */
async function handleBootstrap(req: Request, res: Response) {
  const expected = process.env.BOOTSTRAP_SECRET?.trim();
  const provided = (req.headers["x-bootstrap-secret"] as string | undefined) ?? (req.query.secret as string | undefined);

  if (!expected || provided !== expected) {
    return res.status(403).json({ error: "غير مصرح" });
  }

  let migrateOk = true;
  try {
    execSync("npx prisma migrate deploy", { stdio: "pipe" });
  } catch (err) {
    // Don't abort here - a blocked migration chain is exactly when the
    // safety net below matters most. Record it and keep going so the columns
    // still get added and the app can serve requests.
    // eslint-disable-next-line no-console
    console.error("Migration deploy reported an error (continuing to safety net):", err);
    migrateOk = false;
  }

  // Always run the idempotent safety net, whether or not migrate deploy
  // succeeded, so a partially-applied migration chain can't leave the schema
  // out of sync with the deployed Prisma client.
  const columnsEnsured: string[] = [];
  for (const sql of COLUMN_SAFETY_NET) {
    try {
      await prisma.$executeRawUnsafe(sql);
      columnsEnsured.push(sql);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Column safety-net statement failed:", sql, err);
    }
  }

  try {
    const result = await seedDatabase();
    res.json({ migrated: migrateOk, columnsEnsured: columnsEnsured.length, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", err);
    res.status(500).json({ error: "تم الترحيل لكن فشلت إضافة البيانات الأساسية، راجع سجلات الخادم" });
  }
}

router.get("/", handleBootstrap);
router.post("/", handleBootstrap);

/**
 * Self-diagnostic for exactly the failure mode above: lets anyone with the
 * bootstrap secret confirm in one request whether the deployed code and the
 * live database actually agree on the schema, without needing to reproduce
 * the bug through the UI, read server logs, or record a screen. Checks the
 * same columns the safety net above knows how to fix, plus confirms the
 * database can serve a real query end-to-end.
 */
async function handleHealthCheck(req: Request, res: Response) {
  const expected = process.env.BOOTSTRAP_SECRET?.trim();
  const provided = (req.headers["x-bootstrap-secret"] as string | undefined) ?? (req.query.secret as string | undefined);

  if (!expected || provided !== expected) {
    return res.status(403).json({ error: "غير مصرح" });
  }

  const columnChecks = [
    { table: "Operation", column: "cancelReason" },
    { table: "Operation", column: "cancelledAt" },
    { table: "Operation", column: "lastDocReminderAt" },
    { table: "User", column: "termsAcceptedAt" },
    { table: "Feedback", column: "featured" },
    { table: "Playbook", column: "status" },
    { table: "OwnerApproval", column: "kind" },
    { table: "IndividualProfile", column: "residencyStatus" },
    { table: "CustomerDocument", column: "status" },
    { table: "Document", column: "sourceCustomerDocumentId" },
  ];

  const columns: Record<string, boolean> = {};
  for (const { table, column } of columnChecks) {
    const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2) as exists`,
      table,
      column
    );
    columns[`${table}.${column}`] = rows[0]?.exists ?? false;
  }

  let canQueryOperations = true;
  let operationCount = 0;
  try {
    operationCount = await prisma.operation.count();
    // Exercises the exact include chain GET /operations/:id uses (steps,
    // documents, feedback, service, expert.user) - a plain count() only
    // touches the Operation table itself and would have missed the
    // Feedback.featured gap that caused this whole investigation.
    await prisma.operation.findFirst({
      include: { steps: true, documents: true, feedback: true, service: true, expert: { include: { user: true } } },
    });
  } catch (err) {
    canQueryOperations = false;
  }

  const allColumnsPresent = Object.values(columns).every(Boolean);
  res.json({
    healthy: allColumnsPresent && canQueryOperations,
    columns,
    canQueryOperations,
    operationCount,
    hint: !allColumnsPresent
      ? "أعمدة ناقصة - افتح /api/bootstrap?secret=... لإصلاحها تلقائياً"
      : !canQueryOperations
      ? "الأعمدة موجودة لكن الاستعلام فشل - راجع سجلات الخادم"
      : "قاعدة البيانات متوافقة تماماً مع الكود المنشور",
  });
}

router.get("/health-check", handleHealthCheck);

/**
 * Scheduled reminder job for customers who paid but still haven't uploaded
 * their required documents. Gated by the same bootstrap secret and meant to
 * be hit once a day by an external cron (e.g. cron-job.org), since Render's
 * free tier has no built-in scheduler.
 *
 * Fires for an operation only when it's paid, still awaiting documents, has
 * at least one document that was never uploaded, is past a grace window after
 * creation, and hasn't already been reminded inside the repeat window - the
 * lastDocReminderAt stamp is what stops the same customer being nudged more
 * than once every couple of days.
 */
async function handleSendReminders(req: Request, res: Response) {
  const expected = process.env.BOOTSTRAP_SECRET?.trim();
  const provided = (req.headers["x-bootstrap-secret"] as string | undefined) ?? (req.query.secret as string | undefined);

  if (!expected || provided !== expected) {
    return res.status(403).json({ error: "غير مصرح" });
  }

  const GRACE_MS = 48 * 60 * 60 * 1000;
  const REPEAT_MS = 48 * 60 * 60 * 1000;
  const now = Date.now();
  const graceCutoff = new Date(now - GRACE_MS);
  const repeatCutoff = new Date(now - REPEAT_MS);

  const candidates = await prisma.operation.findMany({
    where: {
      feePaid: true,
      status: "DOCS_REQUIRED",
      createdAt: { lt: graceCutoff },
      documents: { some: { status: "PENDING" } },
      OR: [{ lastDocReminderAt: null }, { lastDocReminderAt: { lt: repeatCutoff } }],
    },
    include: { service: true, documents: true },
  });

  let remindersSent = 0;
  for (const op of candidates) {
    const pending = op.documents.filter((d) => d.status === "PENDING").map((d) => d.docType);
    if (pending.length === 0) continue;

    await notifyUser(op.userId, {
      title: "تذكير برفع المستندات",
      body: `عملية "${op.service.nameAr}" بانتظار رفع: ${pending.join("، ")}. أكمل رفع مستنداتك حتى نتابع إجراءك.`,
    });
    await prisma.operation.update({ where: { id: op.id }, data: { lastDocReminderAt: new Date() } });
    remindersSent++;
  }

  res.json({ candidatesChecked: candidates.length, remindersSent });
}

router.get("/send-reminders", handleSendReminders);
router.post("/send-reminders", handleSendReminders);

export default router;
