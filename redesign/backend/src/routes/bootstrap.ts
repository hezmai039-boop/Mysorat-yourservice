import { Request, Response, Router } from "express";
import { execSync } from "child_process";
import { prisma } from "../lib/prisma";
import { seedDatabase } from "../services/seedData";

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
    { table: "User", column: "termsAcceptedAt" },
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
