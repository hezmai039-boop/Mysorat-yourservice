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

/**
 * The document types worth keeping in the vault, derived from what the live
 * service catalog actually asks for, ranked by how many services need each one.
 *
 * This is what makes the vault work at all: auto-fulfilment matches a vault
 * entry to an operation's requirement by exact docType string, so letting the
 * customer type a free-form label would produce entries that silently never
 * match anything. Offering the catalog's own vocabulary keeps the two sides in
 * lockstep, and the count tells the customer which uploads save the most work.
 */
router.get("/doc-types", async (_req, res, next) => {
  try {
    const services = await prisma.serviceCatalog.findMany({
      where: { active: true },
      select: { requiredDocs: true },
    });

    const counts = new Map<string, number>();
    for (const service of services) {
      const docs = Array.isArray(service.requiredDocs) ? service.requiredDocs : [];
      // Within one service the same doc should count once, even if the
      // catalog entry happens to list it twice.
      for (const doc of new Set(docs.map((d) => String(d).trim()).filter(Boolean))) {
        counts.set(doc, (counts.get(doc) ?? 0) + 1);
      }
    }

    const docTypes = [...counts.entries()]
      .map(([docType, serviceCount]) => ({ docType, serviceCount }))
      .sort((a, b) => b.serviceCount - a.serviceCount || a.docType.localeCompare(b.docType, "ar"));

    res.json({ docTypes });
  } catch (err) {
    next(err);
  }
});

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
  // Deliberately not z.string().datetime(): that only accepts a "Z"-suffixed
  // UTC string and rejects both a "+03:00" offset and the plain "YYYY-MM-DD"
  // an <input type="date"> yields. Any date the runtime can parse is accepted
  // and normalised here instead, so a valid expiry is never refused over
  // formatting.
  expiresAt: z
    .string()
    .trim()
    .min(1)
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "تاريخ انتهاء غير صالح" })
    .transform((v) => new Date(v))
    .optional(),
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
        expiresAt,
        uploadedAt: new Date(),
      },
      update: {
        fileUrl: key,
        status,
        verificationNote,
        expiresAt,
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
