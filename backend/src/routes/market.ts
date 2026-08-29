import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { logAudit } from "../services/audit";
import { notifyUser } from "../services/notify";

// سوق العروض — آلية inDrive: العميل ينشر طلبه بسعره المستهدف، الخبراء
// المؤهلون يرون الطلبات المفتوحة ويقدمون عروضاً مضادة (سعر + مدة تسليم)،
// والعميل يقارن (سعر/تقييم/خبرة) ويقبل عرضاً واحداً يقفل الصفقة ويُنهي البقية.
// الواجهات تستطلع كل بضع ثوانٍ (polling) — تبسيط مقصود بدل WebSockets،
// والإشعارات الفورية تصل عبر قنوات المنصة القائمة (Push/واتساب).

// عمولة المنصة (Take-Rate) - نسبة تُخصم من الخبير عند قبول عرضه، لا تُضاف
// على العميل. قابلة للضبط من البيئة دون نشر جديد (قيمة بين 0 و 0.5).
const rawRate = Number(process.env.PLATFORM_COMMISSION_RATE ?? "0.10");
export const PLATFORM_COMMISSION_RATE =
  Number.isFinite(rawRate) && rawRate >= 0 && rawRate <= 0.5 ? rawRate : 0.1;

/** عمولة المنصة من سعر عرضٍ ما، مقرّبة لهللتين */
export function commissionOf(priceSar: number): number {
  return Math.round(priceSar * PLATFORM_COMMISSION_RATE * 100) / 100;
}

const router = Router();
router.use(requireAuth);

async function loadExpertOrThrow(userId: string) {
  const expert = await prisma.expert.findUnique({ where: { userId } });
  if (!expert || !expert.active) throw new ApiError(403, "حساب الخبير غير مفعّل");
  return expert;
}

/** بطاقة الخبير كما تظهر للعميل في شاشة المفاضلة: خبرة موثقة بلا بيانات تواصل */
async function expertCard(expertId: string) {
  const expert = await prisma.expert.findUniqueOrThrow({
    where: { id: expertId },
    include: { user: { select: { email: true } } },
  });
  const [completedOps, ratingAgg] = await Promise.all([
    prisma.operation.count({ where: { expertId, status: "COMPLETED" } }),
    prisma.feedback.aggregate({
      where: { operation: { expertId } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ]);
  return {
    id: expert.id,
    // اسم عرض مشتق من البريد — يكفي للتمييز دون كشف بيانات التواصل قبل الاتفاق
    displayName: expert.user.email.split("@")[0],
    specialty: expert.specialty,
    completedOps,
    ratingAvg: ratingAgg._avg.rating ? Math.round(ratingAgg._avg.rating * 10) / 10 : null,
    ratingCount: ratingAgg._count.rating,
  };
}

// ─── رادار الخبير: الطلبات المفتوحة للمزايدة ────────────────────────────

router.get("/open", requireRole("EXPERT", "OWNER"), async (req, res, next) => {
  try {
    const expert = await prisma.expert.findUnique({ where: { userId: req.user!.sub } });
    const operations = await prisma.operation.findMany({
      where: { status: "BIDDING" },
      include: {
        service: { select: { nameAr: true, nameEn: true, category: true, estimatedDays: true } },
        bids: { where: { expertId: expert?.id ?? "__none__" } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({
      commissionRate: PLATFORM_COMMISSION_RATE,
      operations: operations.map((o) => ({
        id: o.id,
        service: o.service,
        targetPriceSar: Number(o.targetPriceSar),
        createdAt: o.createdAt,
        bidsCount: undefined, // لا يُكشف عدد المنافسين للخبراء - قرار تصميمي
        myBid:
          expert && o.bids.length
            ? {
                id: o.bids[0].id,
                priceSar: Number(o.bids[0].priceSar),
                deliveryDays: o.bids[0].deliveryDays,
                status: o.bids[0].status,
              }
            : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── تقديم/تحديث عرض (Counter-Bid) ─────────────────────────────────────

const placeBidSchema = z.object({
  priceSar: z.number().positive().max(1_000_000),
  deliveryDays: z.number().int().min(1).max(90).optional(),
  note: z.string().max(500).optional(),
});

router.post("/operations/:id/bids", requireRole("EXPERT"), async (req, res, next) => {
  try {
    const expert = await loadExpertOrThrow(req.user!.sub);
    const { priceSar, deliveryDays, note } = placeBidSchema.parse(req.body ?? {});

    const operation = await prisma.operation.findUnique({
      where: { id: req.params.id },
      include: { service: true },
    });
    if (!operation) throw new ApiError(404, "الطلب غير موجود");
    if (operation.status !== "BIDDING") throw new ApiError(409, "انتهت نافذة المزايدة لهذا الطلب");

    // عرض نشط واحد لكل خبير على كل طلب — إعادة الإرسال تحدّث السعر بدل التكرار
    const bid = await prisma.bid.upsert({
      where: { operationId_expertId: { operationId: operation.id, expertId: expert.id } },
      update: { priceSar, deliveryDays, note, status: "OFFERED" },
      create: { operationId: operation.id, expertId: expert.id, priceSar, deliveryDays, note },
    });

    await logAudit({
      operationId: operation.id,
      actorType: "EXPERT",
      actorId: req.user!.sub,
      action: "BID_PLACED",
      entityType: "Bid",
      entityId: bid.id,
      metadata: { priceSar, deliveryDays },
    });
    await notifyUser(operation.userId, {
      title: "عرض جديد على طلبك",
      body: `وصلك عرض بقيمة ${priceSar} ريال على خدمة "${operation.service.nameAr}". قارن العروض واختر الأنسب.`,
    });

    res.status(201).json({ bid: { ...bid, priceSar: Number(bid.priceSar) } });
  } catch (err) {
    next(err);
  }
});

router.delete("/bids/:id", requireRole("EXPERT"), async (req, res, next) => {
  try {
    const expert = await loadExpertOrThrow(req.user!.sub);
    const bid = await prisma.bid.findUnique({ where: { id: req.params.id } });
    if (!bid || bid.expertId !== expert.id) throw new ApiError(404, "العرض غير موجود");
    if (bid.status !== "OFFERED") throw new ApiError(409, "لا يمكن سحب هذا العرض");
    await prisma.bid.update({ where: { id: bid.id }, data: { status: "WITHDRAWN" } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── شاشة المفاضلة: عروض طلب محدد لعميله ────────────────────────────────

router.get("/operations/:id/bids", async (req, res, next) => {
  try {
    const operation = await prisma.operation.findUnique({ where: { id: req.params.id } });
    if (!operation) throw new ApiError(404, "الطلب غير موجود");
    const { sub, role } = req.user!;
    if (operation.userId !== sub && role !== "OWNER") {
      throw new ApiError(403, "ليس لديك صلاحية للوصول إلى هذه العروض");
    }

    const bids = await prisma.bid.findMany({
      where: { operationId: operation.id, status: { in: ["OFFERED", "ACCEPTED"] } },
      orderBy: { priceSar: "asc" },
    });
    const cards = await Promise.all(
      bids.map(async (b) => ({
        id: b.id,
        priceSar: Number(b.priceSar),
        deliveryDays: b.deliveryDays,
        note: b.note,
        status: b.status,
        createdAt: b.createdAt,
        expert: await expertCard(b.expertId),
      })),
    );
    res.json({
      operationStatus: operation.status,
      targetPriceSar: Number(operation.targetPriceSar),
      acceptedBidId: operation.acceptedBidId,
      bids: cards,
    });
  } catch (err) {
    next(err);
  }
});

// ─── تعديل السعر المستهدف أثناء المزايدة ────────────────────────────────

const targetSchema = z.object({ targetPriceSar: z.number().positive().max(1_000_000) });

router.post("/operations/:id/target", async (req, res, next) => {
  try {
    const { targetPriceSar } = targetSchema.parse(req.body ?? {});
    const operation = await prisma.operation.findUnique({ where: { id: req.params.id } });
    if (!operation) throw new ApiError(404, "الطلب غير موجود");
    if (operation.userId !== req.user!.sub) throw new ApiError(403, "غير مسموح");
    if (operation.status !== "BIDDING") throw new ApiError(409, "لا يمكن تعديل السعر بعد انتهاء المزايدة");
    await prisma.operation.update({ where: { id: operation.id }, data: { targetPriceSar } });
    res.json({ targetPriceSar });
  } catch (err) {
    next(err);
  }
});

// ─── قبول عرض: قفل الصفقة (Deal Lock) ───────────────────────────────────

router.post("/operations/:id/bids/:bidId/accept", async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUnique({
        where: { id: req.params.id },
        include: { service: true },
      });
      if (!operation) throw new ApiError(404, "الطلب غير موجود");
      if (operation.userId !== req.user!.sub) throw new ApiError(403, "غير مسموح");
      if (operation.status !== "BIDDING") throw new ApiError(409, "هذا الطلب لم يعد في مرحلة المزايدة");

      const bid = await tx.bid.findUnique({ where: { id: req.params.bidId }, include: { expert: true } });
      if (!bid || bid.operationId !== operation.id || bid.status !== "OFFERED") {
        throw new ApiError(409, "هذا العرض لم يعد متاحاً للقبول");
      }

      await tx.bid.update({ where: { id: bid.id }, data: { status: "ACCEPTED" } });
      const losers = await tx.bid.findMany({
        where: { operationId: operation.id, id: { not: bid.id }, status: "OFFERED" },
        include: { expert: true },
      });
      await tx.bid.updateMany({
        where: { id: { in: losers.map((l) => l.id) } },
        data: { status: "EXPIRED" },
      });

      // قفل الصفقة: سعر العرض الفائز يصبح رسوم العملية، والخبير الفائز يُسند
      // إليه الملف، ثم تكمل العملية دورتها القائمة (دفع ← مستندات ← خطوات).
      const priceSar = Number(bid.priceSar);
      const commissionSar = commissionOf(priceSar);
      const payoutSar = Math.round((priceSar - commissionSar) * 100) / 100;

      const updated = await tx.operation.update({
        where: { id: operation.id },
        data: {
          status: "PENDING_PAYMENT",
          feeAmountSar: bid.priceSar,
          platformCommissionSar: commissionSar,
          expertPayoutSar: payoutSar,
          acceptedBidId: bid.id,
          expertId: bid.expertId,
          executorType: "EXPERT",
          ...(bid.deliveryDays
            ? { expectedCompletionAt: new Date(Date.now() + bid.deliveryDays * 86400000) }
            : {}),
        },
      });
      return { operation: updated, service: operation.service, bid, losers };
    });

    await logAudit({
      operationId: result.operation.id,
      actorType: "AUTO",
      actorId: req.user!.sub,
      action: "BID_ACCEPTED",
      entityType: "Bid",
      entityId: result.bid.id,
      metadata: {
        priceSar: Number(result.bid.priceSar),
        expertId: result.bid.expertId,
        commissionRate: PLATFORM_COMMISSION_RATE,
        platformCommissionSar: Number(result.operation.platformCommissionSar),
        expertPayoutSar: Number(result.operation.expertPayoutSar),
      },
    });
    await notifyUser(result.bid.expert.userId, {
      title: "🎉 قُبل عرضك",
      body: `قبل العميل عرضك (${Number(result.bid.priceSar)} ريال) على خدمة "${result.service.nameAr}". صافيك بعد عمولة المنصة ${Math.round(PLATFORM_COMMISSION_RATE * 100)}%: ${Number(result.operation.expertPayoutSar)} ريال. سيبدأ الملف فور إتمام الدفع.`,
    });
    await Promise.all(
      result.losers.map((l) =>
        notifyUser(l.expert.userId, {
          title: "أُغلق أحد الطلبات",
          body: `اختار العميل عرضاً آخر لخدمة "${result.service.nameAr}". تابع رادار الطلبات المفتوحة.`,
        }),
      ),
    );

    res.json({ operation: result.operation });
  } catch (err) {
    next(err);
  }
});

export default router;
