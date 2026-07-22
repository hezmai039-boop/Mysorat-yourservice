import { Router } from "express";
import path from "path";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { upload } from "../lib/upload";
import { computeGuidedState, guideStuckCustomer } from "../services/guidedFlow";

/**
 * "Guided execution" (المساعد المنفّذ) - a standalone, additive router that
 * layers an opaque, one-task-at-a-time concierge view over an EXISTING
 * operation without touching any operation/step/document logic. It mirrors the
 * same access rules used by the operations router (owner, the assigned expert,
 * or the operation's own customer) so it inherits identical security.
 *
 * GET  /api/guided/:id       -> the single next thing the customer must do now
 * POST /api/guided/:id/help  -> "I'm stuck": text + optional screenshot -> AI guidance
 */
const router = Router();
router.use(requireAuth);

const DOCUMENT_MEDIA_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp" | "application/pdf"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

async function loadOperationOrThrow(id: string) {
  const operation = await prisma.operation.findUnique({
    where: { id },
    include: { steps: { orderBy: { stepNumber: "asc" } }, documents: true, service: true, expert: true },
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

router.get("/:id", async (req, res, next) => {
  try {
    const operation = await loadOperationOrThrow(req.params.id);
    assertCanAccess(req, operation);
    const guided = computeGuidedState(operation);
    res.json({
      guided,
      status: operation.status,
      service: { nameAr: operation.service.nameAr, nameEn: operation.service.nameEn },
    });
  } catch (err) {
    next(err);
  }
});

const guidedHelpSchema = z.object({
  message: z.string().trim().min(1, "الرجاء وصف ما تواجهه").max(2000),
  language: z.enum(["ar", "en"]).optional(),
});

router.post("/:id/help", upload.single("file"), async (req, res, next) => {
  try {
    const operation = await loadOperationOrThrow(req.params.id);
    assertCanAccess(req, operation);
    const { message, language } = guidedHelpSchema.parse(req.body ?? {});

    const guided = computeGuidedState(operation);
    const currentTaskAr = guided.action?.titleAr ?? "متابعة إجراء العملية";

    let image: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" } | undefined;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const mediaType = DOCUMENT_MEDIA_TYPES[ext];
      // Only genuine images help the vision model - ignore PDFs/others rather
      // than fail the request. The screenshot is read into memory for this one
      // call and never stored.
      if (mediaType && mediaType !== "application/pdf") {
        image = { base64: req.file.buffer.toString("base64"), mediaType };
      }
    }

    const guidance = await guideStuckCustomer({
      language: language === "en" ? "en" : "ar",
      serviceNameAr: operation.service.nameAr,
      serviceNameEn: operation.service.nameEn,
      currentTaskAr,
      userMessage: message,
      image,
    });

    res.json({ guidance });
  } catch (err) {
    next(err);
  }
});

export default router;
