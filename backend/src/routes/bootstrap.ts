import { Request, Response, Router } from "express";
import { execSync } from "child_process";
import { prisma } from "../lib/prisma";
import { seedDatabase } from "../services/seedData";

const router = Router();

const COLUMN_SAFETY_NET: string[] = [
  `ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT`,
  `ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3)`,
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

export default router;
