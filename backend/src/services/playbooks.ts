import { prisma } from "../lib/prisma";

/**
 * The learning engine behind Mysorat's institutional memory.
 *
 * It reads ONLY what the office has actually done - real operations, their step
 * sequences, which documents got rejected, how long things really took - and
 * distils that into a "playbook" per service. Nothing here invents procedure:
 * every number is derived from the office's own history, which is why a young
 * office starts with low confidence and earns autonomy over time.
 *
 * Governance is deliberate and one-directional: this module can only ever
 * PROPOSE. Promotion up the autonomy ladder (PROPOSED -> APPROVED -> AUTO)
 * happens exclusively through an explicit owner decision recorded in
 * OwnerApproval, so the platform can never widen its own authority.
 */

/** Below this many completed operations there isn't enough signal to propose. */
const MIN_SAMPLE_TO_PROPOSE = 3;
/** Sample size at which confidence stops being discounted for thin data. */
const FULL_WEIGHT_SAMPLE = 5;
/** Bar an approved playbook must clear before autonomy is even requested. */
const AUTONOMY_MIN_SAMPLE = 5;
const AUTONOMY_MIN_CONFIDENCE = 0.8;

export interface PlaybookStepSpec {
  order: number;
  titleAr: string;
  titleEn: string;
  /** Share of analysed operations that contained this step (1 = always). */
  stability: number;
}

export interface PlaybookDocSpec {
  docType: string;
  /** Share of uploads of this document that were rejected at least once. */
  rejectionRate: number;
  /** Times this document appeared across analysed operations. */
  seen: number;
}

export interface PlaybookData {
  steps: PlaybookStepSpec[];
  documents: PlaybookDocSpec[];
  avgDurationDays: number | null;
  notesAr: string;
}

/**
 * Confidence = observed success rate, discounted while the sample is thin. Three
 * perfect operations shouldn't read as certainty, so the weight ramps up to
 * FULL_WEIGHT_SAMPLE before the raw rate is trusted at face value.
 */
export function computeConfidence(learnedFrom: number, successRate: number): number {
  if (learnedFrom <= 0) return 0;
  const weight = Math.min(1, learnedFrom / FULL_WEIGHT_SAMPLE);
  return Math.round(successRate * weight * 100) / 100;
}

/** Whether an already-approved playbook has earned the right to ask for autonomy. */
export function isAutonomyEligible(learnedFrom: number, confidence: number): boolean {
  return learnedFrom >= AUTONOMY_MIN_SAMPLE && confidence >= AUTONOMY_MIN_CONFIDENCE;
}

interface DerivedKnowledge {
  data: PlaybookData;
  learnedFrom: number;
  timesUsed: number;
  timesSucceeded: number;
  confidence: number;
}

/** Distils one service's real history into a playbook payload, or null if too thin. */
async function deriveForService(serviceId: string): Promise<DerivedKnowledge | null> {
  // Bounded window: recent history is what reflects current procedure, and it
  // keeps this analysis cheap enough to run on demand from the console.
  const ops = await prisma.operation.findMany({
    where: { serviceId },
    include: { steps: { orderBy: { stepNumber: "asc" } }, documents: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const completed = ops.filter((o) => o.status === "COMPLETED");
  const cancelled = ops.filter((o) => o.status === "CANCELLED");
  if (completed.length < MIN_SAMPLE_TO_PROPOSE) return null;

  // Canonical step sequence: take the most recent completed run as the shape,
  // then score each step by how consistently it shows up across the others -
  // a low stability score is itself useful information for the owner.
  const canonical = completed[0];
  const titleCounts = new Map<string, number>();
  for (const op of completed) {
    for (const s of op.steps) {
      titleCounts.set(s.titleAr, (titleCounts.get(s.titleAr) ?? 0) + 1);
    }
  }
  const steps: PlaybookStepSpec[] = canonical.steps.map((s, i) => ({
    order: i + 1,
    titleAr: s.titleAr,
    titleEn: s.titleEn,
    stability: Math.round(((titleCounts.get(s.titleAr) ?? 0) / completed.length) * 100) / 100,
  }));

  // Document pitfalls are measured across EVERY operation, not just completed
  // ones: a rejection that was later fixed still tells the office which paper
  // customers habitually get wrong.
  const docStats = new Map<string, { seen: number; rejected: number }>();
  for (const op of ops) {
    for (const d of op.documents) {
      const entry = docStats.get(d.docType) ?? { seen: 0, rejected: 0 };
      entry.seen += 1;
      if (d.status === "REJECTED") entry.rejected += 1;
      docStats.set(d.docType, entry);
    }
  }
  const documents: PlaybookDocSpec[] = [...docStats.entries()]
    .map(([docType, v]) => ({
      docType,
      seen: v.seen,
      rejectionRate: Math.round((v.rejected / Math.max(1, v.seen)) * 100) / 100,
    }))
    .sort((a, b) => b.rejectionRate - a.rejectionRate);

  const durations = completed
    .filter((o) => o.completedAt)
    .map((o) => (o.completedAt!.getTime() - o.createdAt.getTime()) / 86_400_000)
    .filter((d) => d >= 0);
  const avgDurationDays = durations.length
    ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
    : null;

  const timesUsed = completed.length + cancelled.length;
  const successRate = timesUsed > 0 ? completed.length / timesUsed : 0;
  const confidence = computeConfidence(completed.length, successRate);

  const riskiest = documents.find((d) => d.rejectionRate > 0);
  const notesAr = [
    `مستخلصة من ${completed.length} معاملة مكتملة`,
    avgDurationDays !== null ? `متوسط مدة الإنجاز الفعلي ${avgDurationDays} يوم` : null,
    riskiest ? `أكثر مستند يتعثّر: "${riskiest.docType}" بنسبة رفض ${Math.round(riskiest.rejectionRate * 100)}%` : null,
    cancelled.length ? `${cancelled.length} معاملة ملغاة ضمن السجل` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    data: { steps, documents, avgDurationDays, notesAr },
    learnedFrom: completed.length,
    timesUsed,
    timesSucceeded: completed.length,
    confidence,
  };
}

/** A material change means the owner approved something that no longer matches reality. */
function isMateriallyDifferent(oldData: unknown, next: PlaybookData): boolean {
  const prev = oldData as PlaybookData | null;
  if (!prev || !Array.isArray(prev.steps) || !Array.isArray(prev.documents)) return true;
  if (prev.steps.length !== next.steps.length) return true;
  const prevDocs = new Set(prev.documents.map((d) => d.docType));
  const nextDocs = new Set(next.documents.map((d) => d.docType));
  if (prevDocs.size !== nextDocs.size) return true;
  for (const d of nextDocs) if (!prevDocs.has(d)) return true;
  for (let i = 0; i < next.steps.length; i++) {
    if (prev.steps[i]?.titleAr !== next.steps[i].titleAr) return true;
  }
  return false;
}

export interface LearnSummary {
  servicesScanned: number;
  proposalsCreated: number;
  playbooksRefreshed: number;
  updatesProposed: number;
  autonomyRequested: number;
  skippedTooThin: number;
}

/**
 * Full learning sweep. Safe to run repeatedly and at any time: it only ever
 * refreshes metrics in place or files a new PROPOSED version plus a request for
 * the owner's permission - it never activates anything by itself.
 */
export async function learnPlaybooks(): Promise<LearnSummary> {
  const summary: LearnSummary = {
    servicesScanned: 0,
    proposalsCreated: 0,
    playbooksRefreshed: 0,
    updatesProposed: 0,
    autonomyRequested: 0,
    skippedTooThin: 0,
  };

  const services = await prisma.serviceCatalog.findMany({ select: { id: true, code: true, nameAr: true } });

  for (const service of services) {
    summary.servicesScanned += 1;
    const derived = await deriveForService(service.id);
    if (!derived) {
      summary.skippedTooThin += 1;
      continue;
    }

    const latest = await prisma.playbook.findFirst({
      where: { serviceId: service.id },
      orderBy: { version: "desc" },
    });

    // No live playbook yet (or the last one was retired) -> propose a fresh one.
    if (!latest || latest.status === "ARCHIVED") {
      const created = await prisma.playbook.create({
        data: {
          serviceId: service.id,
          serviceCode: service.code,
          serviceNameAr: service.nameAr,
          version: (latest?.version ?? 0) + 1,
          status: "PROPOSED",
          data: derived.data as unknown as object,
          learnedFrom: derived.learnedFrom,
          timesUsed: derived.timesUsed,
          timesSucceeded: derived.timesSucceeded,
          confidence: derived.confidence,
        },
      });
      await prisma.ownerApproval.create({
        data: {
          kind: "PLAYBOOK_PROPOSAL",
          titleAr: `خطة عمل مقترحة: ${service.nameAr}`,
          summaryAr: `تعلّم ميسوور هذه الخدمة من ${derived.learnedFrom} معاملة مكتملة (ثقة ${Math.round(
            derived.confidence * 100
          )}%). اعتمدها ليستخدمها كقالب جاهز في المعاملات القادمة.`,
          playbookId: created.id,
          payload: { version: created.version, ...derived.data } as unknown as object,
        },
      });
      summary.proposalsCreated += 1;
      continue;
    }

    // A pending proposal is still the owner's to decide - keep it current
    // instead of stacking another request on top of it.
    if (latest.status === "PROPOSED") {
      await prisma.playbook.update({
        where: { id: latest.id },
        data: {
          data: derived.data as unknown as object,
          learnedFrom: derived.learnedFrom,
          timesUsed: derived.timesUsed,
          timesSucceeded: derived.timesSucceeded,
          confidence: derived.confidence,
          serviceCode: service.code,
          serviceNameAr: service.nameAr,
        },
      });
      summary.playbooksRefreshed += 1;
      continue;
    }

    // APPROVED / AUTO: metrics may always be refreshed, but the approved
    // CONTENT is frozen. If reality drifted, file the change as a new version
    // for the owner to approve rather than editing what they already sanctioned.
    await prisma.playbook.update({
      where: { id: latest.id },
      data: {
        learnedFrom: derived.learnedFrom,
        timesUsed: derived.timesUsed,
        timesSucceeded: derived.timesSucceeded,
        confidence: derived.confidence,
      },
    });
    summary.playbooksRefreshed += 1;

    if (isMateriallyDifferent(latest.data, derived.data)) {
      const pendingUpdate = await prisma.ownerApproval.findFirst({
        where: { kind: "PLAYBOOK_PROPOSAL", status: "PENDING", playbookId: { not: null } },
      });
      const alreadyProposed = await prisma.playbook.findFirst({
        where: { serviceId: service.id, status: "PROPOSED" },
      });
      if (!alreadyProposed && !(pendingUpdate && pendingUpdate.playbookId === latest.id)) {
        const nextVersion = await prisma.playbook.create({
          data: {
            serviceId: service.id,
            serviceCode: service.code,
            serviceNameAr: service.nameAr,
            version: latest.version + 1,
            status: "PROPOSED",
            data: derived.data as unknown as object,
            learnedFrom: derived.learnedFrom,
            timesUsed: derived.timesUsed,
            timesSucceeded: derived.timesSucceeded,
            confidence: derived.confidence,
          },
        });
        await prisma.ownerApproval.create({
          data: {
            kind: "PLAYBOOK_PROPOSAL",
            titleAr: `تحديث مقترح لخطة: ${service.nameAr}`,
            summaryAr:
              "تغيّر واقع تنفيذ هذه الخدمة عمّا اعتمدته سابقاً (خطوات أو مستندات مختلفة). النسخة المعتمدة تعمل كما هي حتى تعتمد التحديث.",
            playbookId: nextVersion.id,
            payload: { version: nextVersion.version, ...derived.data } as unknown as object,
          },
        });
        summary.updatesProposed += 1;
      }
    }

    // Earned autonomy is still only ever *requested*, never taken.
    if (latest.status === "APPROVED" && isAutonomyEligible(derived.learnedFrom, derived.confidence)) {
      const pending = await prisma.ownerApproval.findFirst({
        where: { kind: "PLAYBOOK_AUTONOMY", status: "PENDING", playbookId: latest.id },
      });
      if (!pending) {
        await prisma.ownerApproval.create({
          data: {
            kind: "PLAYBOOK_AUTONOMY",
            titleAr: `طلب استقلالية: ${service.nameAr}`,
            summaryAr: `أنجزنا ${derived.learnedFrom} معاملة بثقة ${Math.round(
              derived.confidence * 100
            )}%. امنح ميسوور تنفيذ العمل الروتيني لهذه الخدمة تلقائياً (تجهيز العملية والمستندات ومراسلة العميل) مع إشعارك بكل إجراء — دون أي تنفيذ على البوابات الحكومية.`,
            playbookId: latest.id,
            payload: { learnedFrom: derived.learnedFrom, confidence: derived.confidence } as unknown as object,
          },
        });
        summary.autonomyRequested += 1;
      }
    }
  }

  return summary;
}
