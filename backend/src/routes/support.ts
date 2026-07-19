import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../services/audit";
import { notifyUser } from "../services/notify";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({ message: z.string().min(5).max(2000) });

router.post("/", async (req, res, next) => {
  try {
    const { message } = createSchema.parse(req.body);
    const request = await prisma.supportRequest.create({ data: { userId: req.user!.sub, message } });
    await logAudit({ actorType: "AUTO", actorId: req.user!.sub, action: "SUPPORT_REQUEST_CREATED", entityType: "SupportRequest", entityId: request.id });
    res.status(201).json({ request });
  } catch (err) {
    next(err);
  }
});

router.get("/mine", async (req, res, next) => {
  try {
    const requests = await prisma.supportRequest.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

const SEGMENT_PRIORITY: Record<string, number> = { VIP: 0, REGULAR: 1, NEW: 2, AT_RISK: 3 };

// Owner queue, VIP-first - this is the one concrete effect of the platform's
// "priority support for VIP" promise, not just a marketing line.
router.get("/", requireRole("OWNER"), async (req, res, next) => {
  try {
    const requests = await prisma.supportRequest.findMany({
      where: { status: { not: "CLOSED" } },
      include: { user: { select: { email: true, segment: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    const sorted = [...requests].sort(
      (a, b) => (SEGMENT_PRIORITY[a.user.segment] ?? 9) - (SEGMENT_PRIORITY[b.user.segment] ?? 9)
    );

    res.json({ requests: sorted });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/reply", requireRole("OWNER"), async (req, res, next) => {
  try {
    const { reply } = z.object({ reply: z.string().min(1) }).parse(req.body);
    const request = await prisma.supportRequest.update({
      where: { id: req.params.id },
      data: { ownerReply: reply, ownerReplyAt: new Date(), status: "ANSWERED" },
    });
    await notifyUser(request.userId, { title: "رد فريق الدعم", body: reply });
    res.json({ request });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/close", requireRole("OWNER"), async (req, res, next) => {
  try {
    const request = await prisma.supportRequest.update({ where: { id: req.params.id }, data: { status: "CLOSED" } });
    res.json({ request });
  } catch (err) {
    next(err);
  }
});

export default router;
