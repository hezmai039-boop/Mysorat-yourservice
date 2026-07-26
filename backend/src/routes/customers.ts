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
          isActive: true,
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

/**
 * Customer 360: everything the office knows about one customer, in one place -
 * classification, full request history, what's in their document vault, their
 * support thread, and lifetime totals. This is the "open the file and see the
 * whole story" screen; the list endpoint above is deliberately thin so it can
 * paginate cheaply.
 *
 * Vault documents are returned as metadata only (type, status, expiry) with no
 * file URL. Staff need to know what's on file and whether it's still current;
 * actually opening a file stays scoped to the operation it belongs to, so a
 * customer's whole private archive is never one click away from any expert who
 * ever touched one of their requests.
 */
router.get("/:id", async (req, res, next) => {
  try {
    const { sub, role } = req.user!;

    if (role === "EXPERT") {
      const allowed = await assignedCustomerIds(sub);
      if (!allowed.includes(req.params.id)) {
        throw new ApiError(403, "لا يمكنك الاطلاع على عميل لم تتعامل مع عملياته");
      }
    }

    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        accountType: true,
        segment: true,
        segmentOverridden: true,
        isActive: true,
        createdAt: true,
        termsAcceptedAt: true,
        referralCode: true,
        creditSar: true,
        individualProfile: { select: { fullName: true, nationalId: true, nationality: true, city: true, residencyStatus: true } },
        businessProfile: { select: { companyName: true, crNumber: true, city: true } },
      },
    });

    // accountType is what distinguishes a customer from staff in the list
    // endpoint above; keep the same rule here so /customers/:id can't be used
    // to read an expert's or the owner's own record.
    if (!customer || !customer.accountType) throw new ApiError(404, "العميل غير موجود");

    const [operations, vaultDocuments, supportRequests] = await Promise.all([
      prisma.operation.findMany({
        where: { userId: customer.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          feeAmountSar: true,
          govFeeEstimateSar: true,
          creditAppliedSar: true,
          feePaid: true,
          currentStep: true,
          totalSteps: true,
          delayed: true,
          expectedCompletionAt: true,
          completedAt: true,
          cancelledAt: true,
          createdAt: true,
          service: { select: { code: true, nameAr: true, nameEn: true, category: true } },
          feedback: { select: { rating: true, comment: true, createdAt: true } },
          _count: { select: { documents: true } },
        },
      }),
      prisma.customerDocument.findMany({
        where: { userId: customer.id },
        orderBy: { docType: "asc" },
        select: { id: true, docType: true, status: true, expiresAt: true, uploadedAt: true, verificationNote: true },
      }),
      prisma.supportRequest.findMany({
        where: { userId: customer.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, message: true, status: true, ownerReply: true, createdAt: true },
      }),
    ]);

    const ratings = operations.flatMap((o) => o.feedback.map((f) => f.rating));
    const stats = {
      totalOperations: operations.length,
      completed: operations.filter((o) => o.status === "COMPLETED").length,
      active: operations.filter((o) => !["COMPLETED", "CANCELLED"].includes(o.status)).length,
      cancelled: operations.filter((o) => o.status === "CANCELLED").length,
      // Cash actually collected. Two things this must not get wrong:
      //   - an unpaid operation isn't revenue, hence the feePaid filter;
      //   - referral wallet credit is not cash. payment records the offset in
      //     creditAppliedSar without reducing feeAmountSar, so summing the fee
      //     alone would report a fully credit-covered operation as if the
      //     customer had paid it in full.
      // Accumulated in halalas because these are Decimal(10,2) columns and
      // repeated float addition of values like 15.50 drifts (…29999999999998).
      lifetimePaidSar:
        operations
          .filter((o) => o.feePaid)
          .reduce((halalas, o) => halalas + Math.round((Number(o.feeAmountSar) - Number(o.creditAppliedSar)) * 100), 0) / 100,
      averageRating: ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : null,
      ratingCount: ratings.length,
    };

    res.json({ customer, operations, vaultDocuments, supportRequests, stats });
  } catch (err) {
    next(err);
  }
});

/**
 * These routes address a *customer*, and accountType is what separates a
 * customer from staff everywhere else in this file (the list query filters on
 * `accountType: { not: null }`, and GET /:id refuses anything else). Without
 * this guard the PATCH routes below would happily accept an expert's - or
 * another owner's - id and mutate their record, so one owner could suspend a
 * peer. Kept as a shared helper so both routes enforce the same rule.
 */
async function assertIsCustomer(id: string): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id }, select: { accountType: true } });
  if (!target || !target.accountType) throw new ApiError(404, "العميل غير موجود");
}

const segmentSchema = z.object({ segment: z.enum(["NEW", "REGULAR", "VIP", "AT_RISK"]) });

router.patch("/:id/segment", async (req, res, next) => {
  try {
    const { segment } = segmentSchema.parse(req.body);
    const { sub, role } = req.user!;
    await assertIsCustomer(req.params.id);

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

// Suspending an account is a business/trust-and-safety action (fraud, abuse,
// disputes) restricted to the platform owner - unlike segment overrides, an
// expert has no reason to lock a customer out of their own account.
router.patch("/:id/status", requireRole("OWNER"), async (req, res, next) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const { sub } = req.user!;

    if (req.params.id === sub) {
      throw new ApiError(400, "لا يمكنك إيقاف حسابك الخاص");
    }
    await assertIsCustomer(req.params.id);

    const customer = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive },
    });

    await logAudit({
      actorType: "OWNER",
      actorId: sub,
      action: isActive ? "ACCOUNT_REACTIVATED" : "ACCOUNT_SUSPENDED",
      entityType: "User",
      entityId: customer.id,
    });

    res.json({ customer: { id: customer.id, isActive: customer.isActive } });
  } catch (err) {
    next(err);
  }
});

export default router;
