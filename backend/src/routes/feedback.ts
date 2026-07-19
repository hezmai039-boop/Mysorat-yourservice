import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { logAudit } from "../services/audit";
import { recomputeSegment } from "../services/segmentation";
import { notifyUser } from "../services/notify";

const router = Router();

// Public: powers the feedback counter shown on the (unauthenticated) landing page.
// Must be registered before requireAuth below, or every anonymous visitor gets a 401.
router.get("/count", async (req, res, next) => {
  try {
    const [count, avgResult] = await Promise.all([
      prisma.feedback.count(),
      prisma.feedback.aggregate({ _avg: { rating: true } }),
    ]);
    res.json({ count, averageRating: avgResult._avg.rating ?? 0 });
  } catch (err) {
    next(err);
  }
});

// Public: curated testimonials for the landing page's trust section. Only
// feedback the owner explicitly marked as "featured" is ever exposed here,
// and the display name is reduced to a first name / company name - never the
// account's actual email, which a customer never agreed to publish by rating
// an operation.
router.get("/testimonials", async (req, res, next) => {
  try {
    const testimonials = await prisma.feedback.findMany({
      where: { featured: true },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        operation: { include: { service: { select: { nameAr: true } } } },
        user: { include: { individualProfile: true, businessProfile: true } },
      },
    });

    res.json({
      testimonials: testimonials.map((t) => ({
        id: t.id,
        rating: t.rating,
        comment: t.comment,
        serviceNameAr: t.operation.service.nameAr,
        displayName:
          t.user.individualProfile?.fullName?.split(" ")[0] ??
          t.user.businessProfile?.companyName ??
          "عميل ميسوور",
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);

const feedbackSchema = z.object({
  operationId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  voiceUrl: z.string().optional(),
  transcribed: z.boolean().optional(),
});

router.post("/", async (req, res, next) => {
  try {
    const data = feedbackSchema.parse(req.body);
    const operation = await prisma.operation.findUnique({ where: { id: data.operationId }, include: { steps: true, service: true } });
    if (!operation) throw new ApiError(404, "العملية غير موجودة");
    if (operation.userId !== req.user!.sub) throw new ApiError(403, "غير مسموح");

    const existing = await prisma.feedback.findFirst({ where: { operationId: data.operationId, userId: req.user!.sub } });
    if (existing) throw new ApiError(409, "تم إرسال تقييمك مسبقاً لهذه العملية");

    const feedback = await prisma.feedback.create({
      data: {
        operationId: data.operationId,
        userId: req.user!.sub,
        rating: data.rating,
        comment: data.comment,
        voiceUrl: data.voiceUrl,
        transcribed: data.transcribed ?? false,
      },
    });

    const allStepsDone = operation.steps.every((s) => s.status === "DONE");
    if (allStepsDone) {
      await prisma.operation.update({
        where: { id: operation.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await logAudit({ operationId: operation.id, actorType: "AUTO", actorId: req.user!.sub, action: "OPERATION_COMPLETED", entityType: "Operation", entityId: operation.id });
      await recomputeSegment(operation.userId);
      await notifyUser(operation.userId, {
        title: "تم إنجاز معاملتك",
        body: `تم إنجاز معاملة "${operation.service.nameAr}" بنجاح. شكراً لتقييمك تجربتك معنا.`,
      });
    }

    res.status(201).json({ feedback, operationCompleted: allStepsDone });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireRole("OWNER"), async (req, res, next) => {
  try {
    const feedback = await prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } }, operation: { include: { service: true } } },
      take: 200,
    });
    res.json({ feedback });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/feature", requireRole("OWNER"), async (req, res, next) => {
  try {
    const { featured } = z.object({ featured: z.boolean() }).parse(req.body);
    const feedback = await prisma.feedback.update({ where: { id: req.params.id }, data: { featured } });
    res.json({ feedback: { id: feedback.id, featured: feedback.featured } });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/reply", requireRole("OWNER"), async (req, res, next) => {
  try {
    const schema = z.object({ reply: z.string().min(1) });
    const { reply } = schema.parse(req.body);
    const feedback = await prisma.feedback.update({
      where: { id: req.params.id },
      data: { ownerReply: reply, ownerReplyAt: new Date() },
    });
    res.json({ feedback });
  } catch (err) {
    next(err);
  }
});

export default router;
