import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { diagnoseServiceRequest } from "../services/claude";
import { logAudit } from "../services/audit";
import { createBiddingOperation } from "../services/createOperation";

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
        // منطق الإنشاء المشترك مع مسار «انشر طلبك» المباشر - انظر createOperation.ts
        operation = await createBiddingOperation(userId, service);
      }
    }

    res.json({
      sessionId,
      reply: diagnosis.replyToUser,
      diagnosedService: service
        ? { code: service.code, nameAr: service.nameAr, nameEn: service.nameEn, feeAmountSar: service.platformFeeSar, govFeeEstimateSar: service.govFeeEstimateSar }
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
