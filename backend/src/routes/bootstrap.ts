import { Request, Response, Router } from "express";
import { execSync } from "child_process";
import { seedDatabase } from "../services/seedData";

const router = Router();

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

  try {
    execSync("npx prisma migrate deploy", { stdio: "pipe" });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Migration failed:", err);
    return res.status(500).json({ error: "فشل ترحيل قاعدة البيانات، راجع سجلات الخادم" });
  }

  try {
    const result = await seedDatabase();
    res.json({ migrated: true, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", err);
    res.status(500).json({ error: "تم الترحيل لكن فشلت إضافة البيانات الأساسية، راجع سجلات الخادم" });
  }
}

router.get("/", handleBootstrap);
router.post("/", handleBootstrap);

export default router;
