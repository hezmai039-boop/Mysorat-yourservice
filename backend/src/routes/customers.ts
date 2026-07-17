import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { logAudit } from "../services/audit";

const router = Router();
router.use(requireAuth, requireRole("OWNER", "EXPERT"));

async function assignedCustomerIds(expertUserId: string): Promise<string[]> {
  const expert = await prisma.expert.findUnique({ where: { userId: expertUserId } });
  if (!expert) return [];
  const operations = await prisma.operation.findMany({ where: { expertId: expert.id }, select: { userId: true } });
  return [...new Set(operations.map((o) => o.userId))];
}

router.get("/", async (req, res, next) => {
  try {
    const { sub, role } = req.user!;
    const where =
      role === "OWNER"
        ? { accountType: { not: null } }
        : { accountType: { not: null }, id: { in: await assignedCustomerIds(sub) } };

    // Paginated rather than a single unbounded findMany() - a real customer base
    // grows past what's safe to load into memory and serialize in one response.
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30));

    const [customers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          phone: true,
          accountType: true,
          segment: true,
          segmentOverridden: true,
          createdAt: true,
          individualProfile: { select: { fullName: true } },
          businessProfile: { select: { companyName: true } },
          _count: { select: { operations: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ customers, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

const segmentSchema = z.object({ segment: z.enum(["NEW", "REGULAR", "VIP", "AT_RISK"]) });

router.patch("/:id/segment", async (req, res, next) => {
  try {
    const { segment } = segmentSchema.parse(req.body);
    const { sub, role } = req.user!;

    if (role === "EXPERT") {
      const allowed = await assignedCustomerIds(sub);
      if (!allowed.includes(req.params.id)) {
        throw new ApiError(403, "لا يمكنك تعديل تصنيف عميل لم تتعامل مع عملياته");
      }
    }

    const customer = await prisma.user.update({
      where: { id: req.params.id },
      data: { segment, segmentOverridden: true },
    });

    await logAudit({
      actorType: role as "EXPERT" | "OWNER",
      actorId: sub,
      action: "SEGMENT_OVERRIDDEN",
      entityType: "User",
      entityId: customer.id,
      metadata: { segment },
    });

    res.json({ customer: { id: customer.id, segment: customer.segment, segmentOverridden: customer.segmentOverridden } });
  } catch (err) {
    next(err);
  }
});

export default router;
