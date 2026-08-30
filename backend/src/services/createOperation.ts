import { ServiceCatalog } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logAudit } from "./audit";

/**
 * Creates a marketplace operation in the BIDDING stage (inDrive-style flow).
 * Shared by the AI assistant (chat.ts) and the direct "post a request" route
 * (operations.ts) so the two entry points can never drift apart.
 *
 * Includes the vault check: a docType this customer already has VERIFIED and
 * unexpired is fulfilled instantly from their own archive instead of asking
 * them to upload the same file again for every new operation. requiredDocs is
 * trimmed on both sides deliberately - it is free-form JSON an owner can edit,
 * and a stray trailing space would make the match fail silently.
 */
export async function createBiddingOperation(
  userId: string,
  service: ServiceCatalog,
  opts?: { targetPriceSar?: number; description?: string },
) {
  const knowledge = await prisma.knowledgeBase.findUnique({
    where: { serviceId_key: { serviceId: service.id, key: "default_steps" } },
  });

  const requiredDocs = Array.isArray(service.requiredDocs) ? service.requiredDocs : [];
  const steps =
    knowledge?.data && Array.isArray((knowledge.data as any).steps)
      ? (knowledge.data as any).steps
      : requiredDocs.map((doc: unknown) => ({ titleAr: `تقديم مستند: ${doc}`, titleEn: `Submit document: ${doc}` }));

  const requiredDocTypes = requiredDocs.map((d: unknown) => String(d).trim()).filter(Boolean);
  const vaultDocs = await prisma.customerDocument.findMany({
    where: {
      userId,
      docType: { in: requiredDocTypes },
      status: "VERIFIED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  const vaultByType = new Map(vaultDocs.map((d) => [d.docType, d]));

  // نموذج السوق (آلية inDrive): الطلب يبدأ في مرحلة المزايدة بسعر مستهدف
  // (من العميل مباشرة، أو رسوم الكتالوج كاقتراح)؛ الخبراء يقدمون عروضهم،
  // وقبول عرض هو ما يحدد feeAmountSar النهائي وينقل الطلب إلى الدفع.
  const targetPrice = opts?.targetPriceSar ?? Number(service.platformFeeSar);

  const operation = await prisma.operation.create({
    data: {
      userId,
      serviceId: service.id,
      status: "BIDDING",
      targetPriceSar: targetPrice,
      feeAmountSar: targetPrice,
      govFeeEstimateSar: service.govFeeEstimateSar,
      totalSteps: steps.length || 1,
      expectedCompletionAt: new Date(Date.now() + service.estimatedDays * 86400000),
      documents: {
        create: requiredDocTypes.map((doc: string) => {
          const vaultMatch = vaultByType.get(doc);
          return vaultMatch
            ? {
                docType: doc,
                status: "VERIFIED" as const,
                fileUrl: vaultMatch.fileUrl,
                verificationNote: vaultMatch.verificationNote,
                uploadedAt: vaultMatch.uploadedAt,
                sourceCustomerDocumentId: vaultMatch.id,
              }
            : { docType: doc, status: "PENDING" as const };
        }),
      },
      steps: {
        create: steps.map((s: any, i: number) => ({
          stepNumber: i + 1,
          titleAr: s.titleAr,
          titleEn: s.titleEn ?? s.titleAr,
          status: "PENDING",
          executedBy: "AUTO",
        })),
      },
    },
  });

  await prisma.knowledgeBase.upsert({
    where: { serviceId_key: { serviceId: service.id, key: "default_steps" } },
    create: { serviceId: service.id, key: "default_steps", data: { steps }, hitCount: 1 },
    update: { hitCount: { increment: 1 } },
  });

  await logAudit({
    operationId: operation.id,
    actorType: "AUTO",
    actorId: userId,
    action: "OPERATION_CREATED",
    entityType: "Operation",
    entityId: operation.id,
    ...(opts?.description ? { metadata: { requestDescription: opts.description.slice(0, 2000) } } : {}),
  });

  return operation;
}
