import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { diagnoseServiceRequest } from "../services/claude";
import { logAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const messageSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().max(4000).default(""),
  contentType: z.enum(["TEXT", "VOICE", "IMAGE"]).default("TEXT"),
  imageBase64: z.string().max(8_000_000).optional(),
  imageMediaType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  language: z.enum(["ar", "en"]).optional(),
}).refine((d) => d.message.length > 0 || d.imageBase64, { message: "الرجاء إرسال نص أو صورة" });

router.post("/message", async (req, res, next) => {
  try {
    const { sessionId: incomingSessionId, message, contentType, imageBase64, imageMediaType, language } = messageSchema.parse(req.body);
    const sessionId = incomingSessionId ?? randomUUID();
    const userId = req.user!.sub;

    await prisma.chatMessage.create({
      data: { userId, sessionId, role: "USER", contentType, content: message || "(صورة مرفقة)" },
    });

    const recentHistory = await prisma.chatMessage.findMany({
      where: { userId, sessionId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const history = recentHistory.reverse();

    const services = await prisma.serviceCatalog.findMany({
      where: { active: true },
      select: { code: true, nameAr: true, nameEn: true, category: true },
    });

    const diagnosis = await diagnoseServiceRequest({
      userMessage: message,
      availableServices: services,
      history: history.slice(0, -1).map((m) => ({
        role: m.role === "USER" ? "user" : "assistant",
        content: m.content,
      })),
      image: imageBase64 && imageMediaType ? { base64: imageBase64, mediaType: imageMediaType } : undefined,
      language,
    });

    await prisma.chatMessage.create({
      data: { userId, sessionId, role: "ASSISTANT", contentType: "TEXT", content: diagnosis.replyToUser },
    });

    let operation = null;
    let service = null;

    if (diagnosis.serviceCode && diagnosis.confidence >= 0.6 && !diagnosis.needsClarification) {
      service = await prisma.serviceCatalog.findUnique({ where: { code: diagnosis.serviceCode } });

      if (service) {
        const knowledge = await prisma.knowledgeBase.findUnique({
          where: { serviceId_key: { serviceId: service.id, key: "default_steps" } },
        });

        const requiredDocs = Array.isArray(service.requiredDocs) ? service.requiredDocs : [];
        const steps = knowledge?.data && Array.isArray((knowledge.data as any).steps)
          ? (knowledge.data as any).steps
          : requiredDocs.map((doc: unknown, i: number) => ({ titleAr: `تقديم مستند: ${doc}`, titleEn: `Submit document: ${doc}` }));

        operation = await prisma.operation.create({
          data: {
            userId,
            serviceId: service.id,
            status: "PENDING_PAYMENT",
            feeAmountSar: service.platformFeeSar,
            govFeeEstimateSar: service.govFeeEstimateSar,
            totalSteps: steps.length || 1,
            expectedCompletionAt: new Date(Date.now() + service.estimatedDays * 86400000),
            documents: {
              create: requiredDocs.map((doc: unknown) => ({ docType: String(doc), status: "PENDING" })),
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
        });
      }
    }

    res.json({
      sessionId,
      reply: diagnosis.replyToUser,
      diagnosedService: service
        ? { code: service.code, nameAr: service.nameAr, feeAmountSar: service.platformFeeSar, govFeeEstimateSar: service.govFeeEstimateSar }
        : null,
      operationId: operation?.id ?? null,
      needsClarification: diagnosis.needsClarification,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/sessions", async (req, res, next) => {
  try {
    const userId = req.user!.sub;

    const grouped = await prisma.chatMessage.groupBy({
      by: ["sessionId"],
      where: { userId },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: 20,
    });

    const sessions = await Promise.all(
      grouped.map(async (g) => {
        const firstUserMessage = await prisma.chatMessage.findFirst({
          where: { userId, sessionId: g.sessionId, role: "USER" },
          orderBy: { createdAt: "asc" },
        });
        return {
          sessionId: g.sessionId,
          title: firstUserMessage?.content.slice(0, 60) || "محادثة",
          lastActivityAt: g._max.createdAt,
        };
      })
    );

    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

router.get("/history/:sessionId", async (req, res, next) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.user!.sub, sessionId: req.params.sessionId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

export default router;
