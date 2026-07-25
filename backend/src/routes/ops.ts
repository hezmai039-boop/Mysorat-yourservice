import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { logAudit } from "../services/audit";
import { notifyUser } from "../services/notify";
import { learnPlaybooks, isAutonomyEligible } from "../services/playbooks";

/**
 * "Ops Room" - the operator console that lets one person run the workload of a
 * whole office. Everything here is additive and OWNER-only; it reads the same
 * operations the customer-facing app already manages and adds three things the
 * office needs and the customer never sees:
 *
 *   1. a triaged work queue, so attention goes where it is actually blocking;
 *   2. a permission inbox, where Mysorat asks before it takes on more work and
 *      reports what it already did autonomously;
 *   3. a renewals radar, turning finished work into predictable repeat revenue.
 *
 * No route here mutates an operation's business state except through the same
 * rules the rest of the app uses, and nothing escalates the platform's own
 * authority without an explicit owner decision.
 */
const router = Router();
router.use(requireAuth, requireRole("OWNER"));

/**
 * Typical validity of a renewable service, in days - used only to ESTIMATE when
 * a customer will need us again. It is deliberately conservative and clearly
 * labelled as an estimate in the UI: the platform has no live feed from the
 * agencies, so this is a prompt for outreach, never a statement of fact.
 */
const RENEWAL_CYCLE_DAYS: Record<string, number> = {
  IQAMA_RENEWAL: 365,
  NATIONAL_ID_RENEWAL: 1825,
  DRIVING_LICENSE_RENEWAL: 1825,
  VEHICLE_REGISTRATION_RENEWAL: 1095,
  VEHICLE_INSURANCE: 365,
  RESIDENT_HEALTH_INSURANCE: 365,
  EJAR_RENTAL_CONTRACT: 365,
  COMMERCIAL_REGISTRY: 365,
  BALADY_BUSINESS_LICENSE: 365,
  VAT_REGISTRATION: 365,
  ZATCA_TAX: 365,
  EXIT_REENTRY_VISA: 90,
  VISIT_VISA_EXTENSION: 90,
  VISITOR_TRAVEL_INSURANCE: 365,
  PASSPORT_VISA: 1825,
};

/** How far ahead the radar looks for upcoming renewals. */
const RENEWAL_HORIZON_DAYS = 60;

interface QueueReason {
  code: string;
  labelAr: string;
  weight: number;
}

/**
 * Triage. The score answers one question: how much is this operation costing us
 * right now? A customer who literally cannot proceed outranks internal work,
 * and anything past its promised date is pulled up regardless of category.
 */
function triage(op: {
  status: string;
  feePaid: boolean;
  delayed: boolean;
  expectedCompletionAt: Date | null;
  createdAt: Date;
  documents: { status: string }[];
  steps: { status: string }[];
}): { score: number; reasons: QueueReason[] } {
  const reasons: QueueReason[] = [];
  const now = Date.now();

  if (op.documents.some((d) => d.status === "REJECTED")) {
    reasons.push({ code: "DOC_REJECTED", labelAr: "مستند مرفوض — العميل متوقف", weight: 100 });
  }
  if (op.delayed) {
    reasons.push({ code: "DELAYED", labelAr: "معاملة متأخرة", weight: 90 });
  }
  if (op.status === "ESCALATED_TO_EXPERT") {
    reasons.push({ code: "ESCALATED", labelAr: "محوّلة إلى خبير", weight: 80 });
  }
  if (op.documents.some((d) => d.status === "UPLOADED")) {
    reasons.push({ code: "AWAITING_REVIEW", labelAr: "مستندات تنتظر مراجعتك", weight: 70 });
  }
  if (op.expectedCompletionAt && op.expectedCompletionAt.getTime() < now) {
    reasons.push({ code: "PAST_DUE", labelAr: "تجاوزت الموعد الموعود", weight: 60 });
  }
  if (op.feePaid && op.documents.some((d) => d.status === "PENDING")) {
    const ageDays = (now - op.createdAt.getTime()) / 86_400_000;
    reasons.push({
      code: "AWAITING_CUSTOMER_DOCS",
      labelAr: ageDays > 3 ? "العميل متأخر في رفع مستنداته" : "بانتظار مستندات العميل",
      weight: ageDays > 3 ? 50 : 20,
    });
  }
  if (!op.feePaid) {
    reasons.push({ code: "UNPAID", labelAr: "بانتظار الدفع", weight: 15 });
  }
  if (op.feePaid && op.steps.some((s) => s.status !== "DONE") && op.documents.every((d) => d.status === "VERIFIED")) {
    reasons.push({ code: "READY_TO_PROGRESS", labelAr: "جاهزة للتقدّم — مستنداتها مكتملة", weight: 65 });
  }

  const score = reasons.reduce((max, r) => Math.max(max, r.weight), 0);
  return { score, reasons: reasons.sort((a, b) => b.weight - a.weight) };
}

/** GET /api/ops/queue - the whole office's live workload, triaged. */
router.get("/queue", async (req, res, next) => {
  try {
    const operations = await prisma.operation.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      include: {
        service: { select: { nameAr: true, code: true } },
        user: { select: { email: true, segment: true } },
        documents: { select: { status: true, docType: true } },
        steps: { select: { status: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 300,
    });

    const items = operations
      .map((op) => {
        const { score, reasons } = triage(op);
        return {
          id: op.id,
          serviceNameAr: op.service.nameAr,
          serviceCode: op.service.code,
          customerEmail: op.user.email,
          segment: op.user.segment,
          status: op.status,
          feePaid: op.feePaid,
          delayed: op.delayed,
          currentStep: op.currentStep,
          totalSteps: op.totalSteps,
          createdAt: op.createdAt,
          expectedCompletionAt: op.expectedCompletionAt,
          ageDays: Math.floor((Date.now() - op.createdAt.getTime()) / 86_400_000),
          score,
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score || b.ageDays - a.ageDays);

    res.json({
      total: items.length,
      needsYouNow: items.filter((i) => i.score >= 60).length,
      items,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/ops/renewals - estimated upcoming renewals, for proactive outreach. */
router.get("/renewals", async (req, res, next) => {
  try {
    const codes = Object.keys(RENEWAL_CYCLE_DAYS);
    const completed = await prisma.operation.findMany({
      where: { status: "COMPLETED", service: { code: { in: codes } } },
      include: {
        service: { select: { code: true, nameAr: true, platformFeeSar: true } },
        user: { select: { id: true, email: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 500,
    });

    // An operation already in flight means the customer is being served; the
    // radar is only for people who would otherwise slip away silently.
    const active = await prisma.operation.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      select: { userId: true, serviceId: true },
    });
    const activeKeys = new Set(active.map((a) => `${a.userId}:${a.serviceId}`));

    const now = Date.now();
    const horizon = now + RENEWAL_HORIZON_DAYS * 86_400_000;
    const seen = new Set<string>();
    const items: {
      operationId: string;
      userId: string;
      customerEmail: string;
      serviceNameAr: string;
      serviceCode: string;
      feeSar: string;
      completedAt: Date | null;
      dueAt: Date;
      daysUntilDue: number;
      overdue: boolean;
    }[] = [];

    for (const op of completed) {
      const key = `${op.userId}:${op.serviceId}`;
      // Only the most recent completion per customer+service matters.
      if (seen.has(key)) continue;
      seen.add(key);
      if (activeKeys.has(key)) continue;

      const base = (op.completedAt ?? op.createdAt).getTime();
      const dueAt = base + RENEWAL_CYCLE_DAYS[op.service.code] * 86_400_000;
      if (dueAt > horizon) continue;

      items.push({
        operationId: op.id,
        userId: op.userId,
        customerEmail: op.user.email,
        serviceNameAr: op.service.nameAr,
        serviceCode: op.service.code,
        feeSar: op.service.platformFeeSar.toString(),
        completedAt: op.completedAt,
        dueAt: new Date(dueAt),
        daysUntilDue: Math.round((dueAt - now) / 86_400_000),
        overdue: dueAt < now,
      });
    }

    items.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    const pipelineSar = items.reduce((sum, i) => sum + Number(i.feeSar), 0);
    res.json({ horizonDays: RENEWAL_HORIZON_DAYS, total: items.length, pipelineSar, items });
  } catch (err) {
    next(err);
  }
});

const outreachSchema = z.object({ userId: z.string().uuid(), serviceNameAr: z.string().min(1).max(200) });

/** POST /api/ops/renewals/outreach - one-tap "your renewal is due" nudge. */
router.post("/renewals/outreach", async (req, res, next) => {
  try {
    const { userId, serviceNameAr } = outreachSchema.parse(req.body ?? {});
    await notifyUser(userId, {
      title: "تنبيه تجديد قادم",
      body: `يقترب موعد تجديد "${serviceNameAr}". يسعدنا إنجازه لك قبل انتهاء المدة — ابدأ من تطبيق ميسوور.`,
    });
    res.json({ sent: true });
  } catch (err) {
    next(err);
  }
});

/** GET /api/ops/playbooks - the institutional memory, newest first. */
router.get("/playbooks", async (req, res, next) => {
  try {
    const playbooks = await prisma.playbook.findMany({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 200,
    });
    res.json({
      total: playbooks.length,
      counts: {
        proposed: playbooks.filter((p) => p.status === "PROPOSED").length,
        approved: playbooks.filter((p) => p.status === "APPROVED").length,
        auto: playbooks.filter((p) => p.status === "AUTO").length,
        archived: playbooks.filter((p) => p.status === "ARCHIVED").length,
      },
      items: playbooks.map((p) => ({
        ...p,
        autonomyEligible: p.status === "APPROVED" && isAutonomyEligible(p.learnedFrom, p.confidence),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/ops/playbooks/learn - re-read our own history and propose updates. */
router.post("/playbooks/learn", async (req, res, next) => {
  try {
    const summary = await learnPlaybooks();
    await logAudit({
      actorType: "OWNER",
      actorId: req.user!.sub,
      action: "PLAYBOOKS_LEARNED",
      entityType: "Playbook",
      metadata: summary as unknown as Record<string, unknown>,
    });
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

const playbookDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "GRANT_AUTONOMY", "REVOKE_AUTONOMY", "ARCHIVE"]),
  note: z.string().trim().max(1000).optional(),
});

/**
 * POST /api/ops/playbooks/:id/decision - the owner's hand on the autonomy ladder.
 * This is the only way a playbook's status ever changes.
 */
router.post("/playbooks/:id/decision", async (req, res, next) => {
  try {
    const { decision, note } = playbookDecisionSchema.parse(req.body ?? {});
    const playbook = await prisma.playbook.findUnique({ where: { id: req.params.id } });
    if (!playbook) throw new ApiError(404, "خطة العمل غير موجودة");

    const now = new Date();
    let data: Record<string, unknown> = { ownerNote: note ?? playbook.ownerNote };

    if (decision === "APPROVE") {
      if (playbook.status === "AUTO") throw new ApiError(409, "هذه الخطة معتمدة ومستقلة بالفعل");
      data = { ...data, status: "APPROVED", approvedAt: now, approvedBy: req.user!.sub };
      // Approving a newer version retires the one it replaces, so exactly one
      // live playbook per service remains the source of truth.
      await prisma.playbook.updateMany({
        where: { serviceId: playbook.serviceId, id: { not: playbook.id }, status: { in: ["APPROVED", "AUTO"] } },
        data: { status: "ARCHIVED" },
      });
    } else if (decision === "GRANT_AUTONOMY") {
      if (playbook.status !== "APPROVED") throw new ApiError(409, "يجب اعتماد الخطة أولاً قبل منحها الاستقلالية");
      if (!isAutonomyEligible(playbook.learnedFrom, playbook.confidence)) {
        throw new ApiError(409, "لم تستوفِ الخطة شروط الاستقلالية بعد (عدد معاملات وثقة كافية)");
      }
      data = { ...data, status: "AUTO", autonomyAt: now };
    } else if (decision === "REVOKE_AUTONOMY") {
      if (playbook.status !== "AUTO") throw new ApiError(409, "هذه الخطة ليست مستقلة");
      data = { ...data, status: "APPROVED", autonomyAt: null };
    } else {
      data = { ...data, status: "ARCHIVED" };
    }

    const updated = await prisma.playbook.update({ where: { id: playbook.id }, data });

    // Any pending request about this playbook is now answered.
    await prisma.ownerApproval.updateMany({
      where: { playbookId: playbook.id, status: "PENDING" },
      data: { status: decision === "ARCHIVE" ? "REJECTED" : "APPROVED", decidedAt: now, decidedBy: req.user!.sub },
    });

    await logAudit({
      actorType: "OWNER",
      actorId: req.user!.sub,
      action: `PLAYBOOK_${decision}`,
      entityType: "Playbook",
      entityId: playbook.id,
      metadata: { serviceCode: playbook.serviceCode, note },
    });

    res.json({ playbook: updated });
  } catch (err) {
    next(err);
  }
});

/** GET /api/ops/approvals - Mysorat's requests and reports, pending first. */
router.get("/approvals", async (req, res, next) => {
  try {
    const approvals = await prisma.ownerApproval.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    res.json({
      pending: approvals.filter((a) => a.status === "PENDING").length,
      items: approvals,
    });
  } catch (err) {
    next(err);
  }
});

const approvalDecisionSchema = z.object({ decision: z.enum(["APPROVE", "REJECT", "ACKNOWLEDGE"]) });

/**
 * POST /api/ops/approvals/:id/decision - answer an item in the inbox. Approving a
 * playbook request routes through the same status transitions as a direct
 * decision, so the two entry points can never disagree.
 */
router.post("/approvals/:id/decision", async (req, res, next) => {
  try {
    const { decision } = approvalDecisionSchema.parse(req.body ?? {});
    const approval = await prisma.ownerApproval.findUnique({ where: { id: req.params.id } });
    if (!approval) throw new ApiError(404, "الطلب غير موجود");
    if (approval.status !== "PENDING") throw new ApiError(409, "تم اتخاذ قرار في هذا الطلب مسبقاً");

    const now = new Date();

    if (decision === "APPROVE" && approval.playbookId) {
      const playbook = await prisma.playbook.findUnique({ where: { id: approval.playbookId } });
      if (playbook) {
        if (approval.kind === "PLAYBOOK_PROPOSAL") {
          await prisma.playbook.updateMany({
            where: { serviceId: playbook.serviceId, id: { not: playbook.id }, status: { in: ["APPROVED", "AUTO"] } },
            data: { status: "ARCHIVED" },
          });
          await prisma.playbook.update({
            where: { id: playbook.id },
            data: { status: "APPROVED", approvedAt: now, approvedBy: req.user!.sub },
          });
        } else if (approval.kind === "PLAYBOOK_AUTONOMY") {
          if (!isAutonomyEligible(playbook.learnedFrom, playbook.confidence)) {
            throw new ApiError(409, "لم تستوفِ الخطة شروط الاستقلالية بعد");
          }
          await prisma.playbook.update({
            where: { id: playbook.id },
            data: { status: "AUTO", autonomyAt: now },
          });
        }
      }
    }

    const updated = await prisma.ownerApproval.update({
      where: { id: approval.id },
      data: {
        status: decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "ACKNOWLEDGED",
        decidedAt: now,
        decidedBy: req.user!.sub,
      },
    });

    await logAudit({
      actorType: "OWNER",
      actorId: req.user!.sub,
      action: `APPROVAL_${decision}`,
      entityType: "OwnerApproval",
      entityId: approval.id,
      metadata: { kind: approval.kind },
    });

    res.json({ approval: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ops/auto-run - what autonomy actually buys the office.
 *
 * For services whose playbook the owner promoted to AUTO, Mysorat handles the
 * opening move itself: it reaches out to a paid customer for the first document
 * it needs, instead of that sitting in the owner's queue. Every run is reported
 * back as an AUTO_ACTION_NOTICE so the owner sees exactly what was done on their
 * behalf, and the notice doubles as the idempotency marker so a customer is
 * never contacted twice for the same operation.
 *
 * Deliberately bounded: it only ever sends platform notifications. It performs
 * no action on any government portal, moves no operation forward, and spends no
 * money - those stay human decisions.
 */
router.post("/auto-run", async (req, res, next) => {
  try {
    const autoPlaybooks = await prisma.playbook.findMany({ where: { status: "AUTO" } });
    if (autoPlaybooks.length === 0) {
      return res.json({ autoServices: 0, actionsTaken: 0, notices: [] });
    }
    const serviceIds = autoPlaybooks.map((p) => p.serviceId);

    const candidates = await prisma.operation.findMany({
      where: {
        serviceId: { in: serviceIds },
        feePaid: true,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        documents: { some: { status: "PENDING" } },
      },
      include: { service: { select: { nameAr: true } }, documents: true },
      take: 100,
    });

    const notices: { operationId: string; docType: string }[] = [];
    for (const op of candidates) {
      const already = await prisma.ownerApproval.findFirst({
        where: { kind: "AUTO_ACTION_NOTICE", operationId: op.id },
      });
      if (already) continue;

      const pending = op.documents.find((d) => d.status === "PENDING");
      if (!pending) continue;

      await notifyUser(op.userId, {
        title: "خطوتك التالية جاهزة",
        body: `لإكمال "${op.service.nameAr}" نحتاج منك رفع: ${pending.docType}. افتح ميسوور وارفعه — وبقية الإجراء علينا.`,
      });
      await prisma.ownerApproval.create({
        data: {
          kind: "AUTO_ACTION_NOTICE",
          status: "PENDING",
          titleAr: `تنفيذ تلقائي: طلب مستند — ${op.service.nameAr}`,
          summaryAr: `راسل ميسوور العميل تلقائياً لطلب "${pending.docType}" بناءً على الاستقلالية التي منحتها لهذه الخدمة.`,
          operationId: op.id,
          payload: { docType: pending.docType } as unknown as object,
        },
      });
      notices.push({ operationId: op.id, docType: pending.docType });
    }

    await logAudit({
      actorType: "AUTO",
      actorId: req.user!.sub,
      action: "AUTO_RUN",
      entityType: "Operation",
      metadata: { actionsTaken: notices.length },
    });

    res.json({ autoServices: autoPlaybooks.length, actionsTaken: notices.length, notices });
  } catch (err) {
    next(err);
  }
});

export default router;
