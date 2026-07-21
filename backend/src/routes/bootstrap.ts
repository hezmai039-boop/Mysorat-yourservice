import { Request, Response, Router } from "express";
import { execSync } from "child_process";
import { prisma } from "../lib/prisma";
import { seedDatabase } from "../services/seedData";
import { notifyUser } from "../services/notify";

const router = Router();

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
];

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
    console.error("Migration deploy reported an error (continuing to safety net):", err);
    migrateOk = false;
  }

  const columnsEnsured: string[] = [];
  for (const sql of COLUMN_SAFETY_NET) {
    try {
      await prisma.$executeRawUnsafe(sql);
      columnsEnsured.push(sql);
    } catch (err) {
      console.error("Column safety-net statement failed:", sql, err);
    }
  }

  try {
    const result = await seedDatabase();
    res.json({ migrated: migrateOk, columnsEnsured: columnsEnsured.length, ...result });
  } catch (err) {
    console.error("Seed failed:", err);
    res.status(500).json({ error: "تم الترحيل لكن فشلت إضافة البيانات الأساسية، راجع سجلات الخادم" });
  }
}

router.get("/", handleBootstrap);
router.post("/", handleBootstrap);

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
