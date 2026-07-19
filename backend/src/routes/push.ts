import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { env, webPushEnabled } from "../lib/env";

const router = Router();

// Public - the frontend needs this before a user is necessarily logged in
// (e.g. to decide whether to even show a "enable notifications" prompt).
router.get("/vapid-public-key", (req, res) => {
  res.json({ publicKey: webPushEnabled ? env.webPush.publicKey : null });
});

router.use(requireAuth);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

router.post("/subscribe", async (req, res, next) => {
  try {
    const data = subscribeSchema.parse(req.body);
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: { userId: req.user!.sub, endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth },
      update: { userId: req.user!.sub, p256dh: data.keys.p256dh, auth: data.keys.auth },
    });
    res.status(201).json({ subscription: { id: subscription.id } });
  } catch (err) {
    next(err);
  }
});

router.delete("/subscribe", async (req, res, next) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.sub } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
