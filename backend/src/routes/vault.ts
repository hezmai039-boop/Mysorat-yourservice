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
 * The vault's document-type vocabulary, derived from what the live service
 * catalog actually asks for, with how many services need each one.
 *
 * This is the single source of truth for both listing types to the customer
 * and validating an upload, and it is a security boundary, not just a
 * convenience - see the whitelist check in POST /:docType below.
 */
async function catalogDocTypes(): Promise<Map<string, number>> {
  const services = await prisma.serviceCatalog.findMany({
    where: { active: true },
    select: { requiredDocs: true },
  });

  const counts = new Map<string, number>();
  for (const service of services) {
    const docs = Array.isArray(service.requiredDocs) ? service.requiredDocs : [];
    // Within one service the same doc should count once, even if the catalog
    // entry happens to list it twice.
    for (const doc of new Set(docs.map((d) => String(d).trim()).filter(Boolean))) {
      counts.set(doc, (counts.get(doc) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Types worth keeping in the vault, most widely required first - the count
 * tells the customer which uploads save them the most work later.
 */
router.get("/doc-types", async (_req, res, next) => {
  try {
    const docTypes = [...(await catalogDocTypes()).entries()]
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

    // SECURITY: docType must be one the catalog actually asks for. It is not
    // merely a label - it is interpolated into the Claude verification prompt
    // (services/claude.ts), and that call's verdict is what writes VERIFIED
    // here. An unconstrained value would let a customer smuggle instructions
    // into the prompt, force a VERIFIED verdict on an arbitrary file, have
    // chat.ts copy it into a new operation pre-verified, and walk straight
    // through the "all documents verified" gate in operations.ts that exists
    // to stop exactly that. Constraining it to the server-owned vocabulary
    // removes the injection surface, and incidentally bounds how many rows and
    // stored files one account can create. The frontend <select> already only
    // offers these values; this is the enforcement behind it.
    if (!(await catalogDocTypes()).has(docType)) {
      throw new ApiError(400, "نوع المستند غير معروف، اختر نوعاً من القائمة");
    }

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

    // Back-fill the customer's open operations. Auto-fulfilment in chat.ts
    // only runs when an operation is created, so without this the vault would
    // help future requests but not the one the customer is stuck on right now
    // - and "my documents" is exactly where someone blocked on a missing
    // document will naturally go to upload it. Same rule as chat.ts: only a
    // VERIFIED, unexpired vault entry is trusted to satisfy a requirement.
    let appliedToOperations = 0;
    const usable = document.status === "VERIFIED" && (!document.expiresAt || document.expiresAt > new Date());
    if (usable) {
      // Two steps rather than a relation filter inside updateMany, which
      // Prisma does not support on that operation.
      const openOperations = await prisma.operation.findMany({
        where: { userId: req.user!.sub, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        select: { id: true },
      });
      if (openOperations.length > 0) {
        const { count } = await prisma.document.updateMany({
          where: {
            operationId: { in: openOperations.map((o) => o.id) },
            docType,
            // A document already uploaded and awaiting review is left alone;
            // REJECTED is included because supplying a good file is precisely
            // how the customer is meant to recover from a rejection.
            status: { in: ["PENDING", "REJECTED"] },
          },
          data: {
            status: "VERIFIED",
            fileUrl: document.fileUrl,
            verificationNote: document.verificationNote,
            uploadedAt: document.uploadedAt,
            sourceCustomerDocumentId: document.id,
          },
        });
        appliedToOperations = count;
      }
    }

    await logAudit({
      actorType: "AUTO",
      actorId: req.user!.sub,
      action: status === "REJECTED" ? "VAULT_DOCUMENT_REJECTED" : "VAULT_DOCUMENT_UPLOADED",
      entityType: "CustomerDocument",
      entityId: document.id,
      metadata: { docType, status, appliedToOperations },
    });

    res.json({ document, appliedToOperations });
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
