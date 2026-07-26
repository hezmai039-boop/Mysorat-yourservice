import { Router } from "express";
import path from "path";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { upload } from "../lib/upload";
import { saveUploadedFile, getDownloadUrl } from "../lib/storage";
import { verifyDocument } from "../services/claude";
import { logAudit } from "../services/audit";

/**
 * The customer's own document vault ("your ID, once") - independent of any
 * single operation. Uploading here verifies and stores a document under the
 * customer's account; a new operation that needs the same docType later reads
 * it back automatically (see chat.ts's operation-creation step) instead of
 * asking the customer to upload the same file again.
 *
 * Every route is scoped to req.user!.sub - there is no owner/expert path here,
 * this is the customer's own archive, not operational data.
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

router.get("/", async (req, res, next) => {
  try {
    const documents = await prisma.customerDocument.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: "desc" },
    });
    res.json({ documents });
  } catch (err) {
    next(err);
  }
});

const uploadSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  language: z.enum(["ar", "en"]).optional(),
});

router.post("/:docType", upload.single("file"), async (req, res, next) => {
  try {
    const docType = req.params.docType.trim();
    if (!docType) throw new ApiError(400, "نوع المستند مطلوب");
    if (!req.file) throw new ApiError(400, "الرجاء إرفاق ملف");

    const { expiresAt, language } = uploadSchema.parse(req.body ?? {});

    const key = await saveUploadedFile(req.file);

    // Same loose AI plausibility check used for operation documents - fails
    // closed to UPLOADED (pending manual review) on any verifier error rather
    // than trusting an unverified file, exactly as operations.ts does.
    const mediaType = DOCUMENT_MEDIA_TYPES[path.extname(req.file.originalname).toLowerCase()];
    let status: "UPLOADED" | "VERIFIED" | "REJECTED" = "UPLOADED";
    let verificationNote: string | undefined;
    if (mediaType) {
      try {
        const result = await verifyDocument({
          docTypeAr: docType,
          language: language === "en" ? "en" : "ar",
          file: { base64: req.file.buffer.toString("base64"), mediaType },
        });
        status = result.verified ? "VERIFIED" : "REJECTED";
        verificationNote = result.reason;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("تعذّر التحقق التلقائي من مستند الخزانة", err);
        verificationNote =
          language === "en"
            ? "Could not automatically verify the file, it will be reviewed manually"
            : "تعذّر التحقق التلقائي من الملف، سيتم مراجعته يدوياً";
      }
    }

    const document = await prisma.customerDocument.upsert({
      where: { userId_docType: { userId: req.user!.sub, docType } },
      create: {
        userId: req.user!.sub,
        docType,
        fileUrl: key,
        status,
        verificationNote,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        uploadedAt: new Date(),
      },
      update: {
        fileUrl: key,
        status,
        verificationNote,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        uploadedAt: new Date(),
      },
    });

    await logAudit({
      actorType: "AUTO",
      actorId: req.user!.sub,
      action: status === "REJECTED" ? "VAULT_DOCUMENT_REJECTED" : "VAULT_DOCUMENT_UPLOADED",
      entityType: "CustomerDocument",
      entityId: document.id,
      metadata: { docType, status },
    });

    res.json({ document });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/download", async (req, res, next) => {
  try {
    const document = await prisma.customerDocument.findUnique({ where: { id: req.params.id } });
    if (!document || document.userId !== req.user!.sub) throw new ApiError(404, "المستند غير موجود");
    if (!document.fileUrl) throw new ApiError(404, "لم يُرفع الملف بعد");

    const url = await getDownloadUrl(document.fileUrl);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const document = await prisma.customerDocument.findUnique({ where: { id: req.params.id } });
    if (!document || document.userId !== req.user!.sub) throw new ApiError(404, "المستند غير موجود");

    await prisma.customerDocument.delete({ where: { id: document.id } });

    await logAudit({
      actorType: "AUTO",
      actorId: req.user!.sub,
      action: "VAULT_DOCUMENT_DELETED",
      entityType: "CustomerDocument",
      entityId: document.id,
      metadata: { docType: document.docType },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
