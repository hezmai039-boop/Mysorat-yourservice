import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { logAudit } from "../services/audit";
import { upload } from "../lib/upload";
import { saveUploadedFile, getDownloadUrl } from "../lib/storage";

const router = Router();
router.use(requireAuth);

async function loadOperationOrThrow(id: string) {
  const operation = await prisma.operation.findUnique({
    where: { id },
    include: { steps: { orderBy: { stepNumber: "asc" } }, documents: true, feedback: true, service: true, expert: { include: { user: true } } },
  });
  if (!operation) throw new ApiError(404, "العملية غير موجودة");
  return operation;
}

function assertCanAccess(req: any, operation: Awaited<ReturnType<typeof loadOperationOrThrow>>) {
  const { sub, role } = req.user;
  if (role === "OWNER") return;
  if (role === "EXPERT" && operation.expert?.userId === sub) return;
  if (operation.userId === sub) return;
  throw new ApiError(403, "ليس لديك صلاحية للوصول إلى هذه العملية");
}

// Whether a step ran automatically or was completed by an expert is internal
// operating detail - the spec calls for it to stay visible to owner/expert
// only. Hiding it in the frontend isn't enough on its own since a customer
// could still read it straight off the network response, so strip it here
// before the JSON ever leaves the server for a plain customer's own request.
function redactStepsForCustomer<T extends { steps: { executedBy: string; expertNote: string | null }[] }>(
  operation: T,
  role: string
): T {
  if (role === "OWNER" || role === "EXPERT") return operation;
  return {
    ...operation,
    steps: operation.steps.map((s) => ({ ...s, executedBy: undefined, expertNote: undefined })),
  };
}

router.get("/", async (req, res, next) => {
  try {
    const { sub, role } = req.user!;
    let where = {};
    if (role === "OWNER") where = {};
    else if (role === "EXPERT") {
      const expert = await prisma.expert.findUnique({ where: { userId: sub } });
      where = { expertId: expert?.id ?? "__none__" };
    } else {
      where = { userId: sub };
    }

    const operations = await prisma.operation.findMany({
      where,
      include: { service: true, steps: true, user: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ operations: operations.map((o) => redactStepsForCustomer(o, role)) });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const operation = await loadOperationOrThrow(req.params.id);
    assertCanAccess(req, operation);
    res.json({ operation: redactStepsForCustomer(operation, req.user!.role) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/pay", async (req, res, next) => {
  try {
    const operation = await loadOperationOrThrow(req.params.id);
    assertCanAccess(req, operation);
    if (operation.userId !== req.user!.sub) throw new ApiError(403, "غير مسموح");
    if (operation.feePaid) throw new ApiError(409, "تم دفع الرسوم مسبقاً");

    const updated = await prisma.operation.update({
      where: { id: operation.id },
      data: { feePaid: true, status: "DOCS_REQUIRED" },
    });

    await logAudit({ operationId: operation.id, actorType: "AUTO", actorId: req.user!.sub, action: "FEE_PAID", entityType: "Operation", entityId: operation.id });
    res.json({ operation: updated });
  } catch (err) {
    next(err);
  }
});

const advanceSchema = z.object({ note: z.string().optional() });

router.post("/:id/advance", async (req, res, next) => {
  try {
    const operation = await loadOperationOrThrow(req.params.id);
    assertCanAccess(req, operation);
    advanceSchema.parse(req.body ?? {});

    if (!operation.feePaid) throw new ApiError(409, "يجب دفع رسوم الخدمة أولاً قبل بدء الإجراء");

    const nextStep = operation.steps.find((s) => s.status !== "DONE");
    if (!nextStep) throw new ApiError(409, "جميع خطوات العملية مكتملة بالفعل");

    const isExpertActing = req.user!.role === "EXPERT" || req.user!.role === "OWNER";

    await prisma.operationStep.update({
      where: { id: nextStep.id },
      data: {
        status: "DONE",
        executedBy: isExpertActing ? "EXPERT" : "AUTO",
        expertNote: isExpertActing ? req.body?.note : undefined,
      },
    });

    const remaining = operation.steps.filter((s) => s.id !== nextStep.id && s.status !== "DONE").length;

    const updated = await prisma.operation.update({
      where: { id: operation.id },
      data: { currentStep: operation.currentStep + 1, status: "IN_PROGRESS" },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });

    await logAudit({
      operationId: operation.id,
      actorType: isExpertActing ? "EXPERT" : "AUTO",
      actorId: req.user!.sub,
      action: "STEP_COMPLETED",
      entityType: "OperationStep",
      entityId: nextStep.id,
    });

    res.json({ operation: updated, allStepsDone: remaining === 0 });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/documents/:docId", upload.single("file"), async (req, res, next) => {
  try {
    const operation = await loadOperationOrThrow(req.params.id);
    assertCanAccess(req, operation);
    if (operation.userId !== req.user!.sub) throw new ApiError(403, "غير مسموح");
    if (!operation.feePaid) throw new ApiError(409, "يجب دفع رسوم الخدمة أولاً قبل رفع المستندات");
    if (!req.file) throw new ApiError(400, "الرجاء إرفاق ملف");

    const document = operation.documents.find((d) => d.id === req.params.docId);
    if (!document) throw new ApiError(404, "المستند غير موجود ضمن هذه العملية");

    const key = await saveUploadedFile(req.file);

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: { fileUrl: key, status: "UPLOADED", uploadedAt: new Date() },
    });

    await logAudit({ operationId: operation.id, actorType: "AUTO", actorId: req.user!.sub, action: "DOCUMENT_UPLOADED", entityType: "Document", entityId: document.id });
    res.json({ document: updated });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/documents/:docId/download", async (req, res, next) => {
  try {
    const operation = await loadOperationOrThrow(req.params.id);
    assertCanAccess(req, operation);

    const document = operation.documents.find((d) => d.id === req.params.docId);
    if (!document || !document.fileUrl) throw new ApiError(404, "المستند غير موجود أو لم يُرفع بعد");

    const url = await getDownloadUrl(document.fileUrl);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/escalate", requireRole("OWNER"), async (req, res, next) => {
  try {
    const schema = z.object({ expertId: z.string().uuid(), reason: z.string().optional() });
    const { expertId, reason } = schema.parse(req.body);

    const expert = await prisma.expert.findUnique({ where: { id: expertId } });
    if (!expert || !expert.active) throw new ApiError(404, "الخبير غير موجود أو غير نشط");

    const operation = await loadOperationOrThrow(req.params.id);
    if (operation.status === "COMPLETED" || operation.status === "CANCELLED") {
      throw new ApiError(409, "لا يمكن تحويل عملية منتهية أو ملغاة");
    }
    const updated = await prisma.operation.update({
      where: { id: operation.id },
      data: {
        status: "ESCALATED_TO_EXPERT",
        executorType: "EXPERT",
        expertId,
        escalatedAt: new Date(),
        delayed: true,
        delayReason: reason ?? "تم تحويل العملية لخبير مختص لإكمال الإجراء يدوياً",
      },
    });

    await logAudit({ operationId: operation.id, actorType: "OWNER", actorId: req.user!.sub, action: "ESCALATED_TO_EXPERT", entityType: "Operation", entityId: operation.id, metadata: { expertId, reason } });
    res.json({ operation: updated });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/steps/:stepNumber", requireRole("EXPERT", "OWNER"), async (req, res, next) => {
  try {
    const schema = z.object({ status: z.enum(["PENDING", "IN_PROGRESS", "DONE"]), note: z.string().optional() });
    const { status, note } = schema.parse(req.body);
    const stepNumber = Number(req.params.stepNumber);

    const operation = await loadOperationOrThrow(req.params.id);
    assertCanAccess(req, operation);
    if (!operation.feePaid) throw new ApiError(409, "يجب دفع رسوم الخدمة أولاً قبل بدء الإجراء");

    const step = operation.steps.find((s) => s.stepNumber === stepNumber);
    if (!step) throw new ApiError(404, "الخطوة غير موجودة");

    const updatedStep = await prisma.operationStep.update({
      where: { id: step.id },
      data: { status, expertNote: note, executedBy: "EXPERT" },
    });

    const doneCount = operation.steps.filter((s) => s.id !== step.id && s.status === "DONE").length + (status === "DONE" ? 1 : 0);
    await prisma.operation.update({ where: { id: operation.id }, data: { currentStep: doneCount } });

    const actorType = req.user!.role as "EXPERT" | "OWNER";
    await logAudit({ operationId: operation.id, actorType, actorId: req.user!.sub, action: `STEP_${status}`, entityType: "OperationStep", entityId: step.id, metadata: { note } });
    res.json({ step: updatedStep });
  } catch (err) {
    next(err);
  }
});

export default router;
