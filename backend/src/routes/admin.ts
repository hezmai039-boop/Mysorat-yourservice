import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { hashPassword } from "../lib/auth";
import { toCsv, rangeStartDate } from "../services/csv";
import { ApiError } from "../middleware/errorHandler";

const router = Router();
router.use(requireAuth, requireRole("OWNER"));

router.get("/stats", async (req, res, next) => {
  try {
    const [totalUsers, individuals, businesses, operationsByStatus, feedbackAvg, brokenLinks, expertsCount] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { accountType: "INDIVIDUAL" } }),
      prisma.user.count({ where: { accountType: "BUSINESS" } }),
      prisma.operation.groupBy({ by: ["status"], _count: true }),
      prisma.feedback.aggregate({ _avg: { rating: true }, _count: true }),
      prisma.governmentLink.count({ where: { status: "BROKEN" } }),
      prisma.expert.count({ where: { active: true } }),
    ]);

    res.json({
      totalUsers,
      individuals,
      businesses,
      operationsByStatus,
      feedbackAverage: feedbackAvg._avg.rating ?? 0,
      feedbackCount: feedbackAvg._count,
      brokenLinks,
      expertsCount,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/export", async (req, res, next) => {
  try {
    const type = String(req.query.type ?? "operations");
    const range = String(req.query.range ?? "daily");
    const since = rangeStartDate(range);

    let rows: Record<string, unknown>[] = [];

    if (type === "individuals") {
      const users = await prisma.user.findMany({
        where: { accountType: "INDIVIDUAL", createdAt: { gte: since } },
        include: { individualProfile: true },
      });
      rows = users.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        fullName: u.individualProfile?.fullName,
        createdAt: u.createdAt.toISOString(),
      }));
    } else if (type === "businesses") {
      const users = await prisma.user.findMany({
        where: { accountType: "BUSINESS", createdAt: { gte: since } },
        include: { businessProfile: true },
      });
      rows = users.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        companyName: u.businessProfile?.companyName,
        crNumber: u.businessProfile?.crNumber,
        createdAt: u.createdAt.toISOString(),
      }));
    } else {
      const operations = await prisma.operation.findMany({
        where: { createdAt: { gte: since } },
        include: { service: true, user: true },
      });
      rows = operations.map((o) => ({
        id: o.id,
        userEmail: o.user.email,
        service: o.service.nameAr,
        status: o.status,
        executorType: o.executorType,
        feeAmountSar: o.feeAmountSar.toString(),
        feePaid: o.feePaid,
        currentStep: o.currentStep,
        totalSteps: o.totalSteps,
        delayed: o.delayed,
        createdAt: o.createdAt.toISOString(),
      }));
    }

    const csv = toCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="mysorat-${type}-${range}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get("/experts", async (req, res, next) => {
  try {
    const experts = await prisma.expert.findMany({ include: { user: { select: { email: true, phone: true } }, operations: true } });
    res.json({ experts });
  } catch (err) {
    next(err);
  }
});

const promoteSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  specialty: z.string().optional(),
});

router.post("/experts", async (req, res, next) => {
  try {
    const data = promoteSchema.parse(req.body);
    let user = await prisma.user.findUnique({ where: { email: data.email } });

    if (!user) {
      if (!data.password) throw new ApiError(400, "كلمة المرور مطلوبة لإنشاء حساب خبير جديد");
      user = await prisma.user.create({
        data: { email: data.email, passwordHash: await hashPassword(data.password), role: "EXPERT" },
      });
    } else {
      user = await prisma.user.update({ where: { id: user.id }, data: { role: "EXPERT" } });
    }

    const expert = await prisma.expert.upsert({
      where: { userId: user.id },
      create: { userId: user.id, specialty: data.specialty },
      update: { specialty: data.specialty, active: true },
    });

    res.status(201).json({ expert });
  } catch (err) {
    next(err);
  }
});

router.get("/audit-log/:operationId", async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { operationId: req.params.operationId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

export default router;
