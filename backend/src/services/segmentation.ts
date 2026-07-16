import { prisma } from "../lib/prisma";

/**
 * Recomputes a customer's segment from their completed-operation history.
 * Skipped entirely once an owner/expert has manually overridden the segment -
 * the override is sticky until someone clears it, not just until the next
 * completion event.
 */
export async function recomputeSegment(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { segmentOverridden: true } });
  if (!user || user.segmentOverridden) return;

  const [completedCount, feedbackAgg, delayedCount] = await Promise.all([
    prisma.operation.count({ where: { userId, status: "COMPLETED" } }),
    prisma.feedback.aggregate({ where: { userId }, _avg: { rating: true } }),
    prisma.operation.count({ where: { userId, status: "COMPLETED", delayed: true } }),
  ]);

  const avgRating = feedbackAgg._avg.rating ?? 0;

  let segment: "NEW" | "REGULAR" | "VIP" | "AT_RISK" = "NEW";
  if (completedCount === 0) {
    segment = "NEW";
  } else if (avgRating > 0 && avgRating < 3) {
    segment = "AT_RISK";
  } else if (completedCount >= 5 && avgRating >= 4) {
    segment = "VIP";
  } else {
    segment = "REGULAR";
  }

  await prisma.user.update({ where: { id: userId }, data: { segment } });
  return { segment, completedCount, avgRating, delayedCount };
}
