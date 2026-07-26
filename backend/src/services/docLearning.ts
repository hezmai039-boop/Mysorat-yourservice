import { prisma } from "../lib/prisma";

/**
 * Turns real rejection history into a pre-emptive warning, instead of the
 * customer discovering the same mistake everyone before them already made.
 * Reuses the exact (serviceId, docType) pair the guided flow already knows -
 * no new schema, no new table. A small/undecided sample stays silent rather
 * than guessing: a hint is only worth showing once the pattern is real.
 */

const MIN_SAMPLE = 5;
const RISK_THRESHOLD = 0.3;

export interface RejectionRiskHint {
  rate: number;
  sampleSize: number;
  commonReason: string | null;
}

export async function getRejectionRiskHint(
  serviceId: string,
  docType: string
): Promise<RejectionRiskHint | null> {
  const rows = await prisma.document.findMany({
    where: {
      docType,
      operation: { serviceId },
      status: { in: ["VERIFIED", "REJECTED"] },
    },
    select: { status: true, verificationNote: true },
  });

  if (rows.length < MIN_SAMPLE) return null;

  const rejected = rows.filter((r) => r.status === "REJECTED");
  const rate = rejected.length / rows.length;
  if (rate < RISK_THRESHOLD) return null;

  // Most frequent rejection reason among this docType's history - a plain
  // tally over free text, since the volume here is small and the reasons
  // are short AI-generated sentences, not a fixed enum.
  const tally = new Map<string, number>();
  for (const r of rejected) {
    if (!r.verificationNote) continue;
    tally.set(r.verificationNote, (tally.get(r.verificationNote) ?? 0) + 1);
  }
  let commonReason: string | null = null;
  let best = 0;
  for (const [reason, count] of tally) {
    if (count > best) {
      best = count;
      commonReason = reason;
    }
  }

  return { rate, sampleSize: rows.length, commonReason };
}

export function formatRiskHint(hint: RejectionRiskHint, lang: "ar" | "en"): string {
  const pct = Math.round(hint.rate * 100);
  if (lang === "en") {
    return hint.commonReason
      ? `Heads up: about ${pct}% of past uploads of this document were rejected, most often because "${hint.commonReason}". Double-check that before sending.`
      : `Heads up: about ${pct}% of past uploads of this document were rejected. Please review it carefully before sending.`;
  }
  return hint.commonReason
    ? `تنبيه: نحو ${pct}٪ من مرّات رفع هذا المستند سابقاً كانت تُرفض، والسبب الأكثر تكراراً هو: "${hint.commonReason}". تأكّد من ذلك قبل الإرسال.`
    : `تنبيه: نحو ${pct}٪ من مرّات رفع هذا المستند سابقاً كانت تُرفض. راجعه جيداً قبل الإرسال.`;
}
