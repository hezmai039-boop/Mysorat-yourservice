import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user!.sub },
      include: { service: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ favorites: favorites.map((f) => f.service) });
  } catch (err) {
    next(err);
  }
});

router.post("/:serviceId", async (req, res, next) => {
  try {
    const service = await prisma.serviceCatalog.findUnique({ where: { id: req.params.serviceId } });
    if (!service) throw new ApiError(404, "الخدمة غير موجودة");

    await prisma.favorite.upsert({
      where: { userId_serviceId: { userId: req.user!.sub, serviceId: service.id } },
      create: { userId: req.user!.sub, serviceId: service.id },
      update: {},
    });

    res.status(201).json({ favorited: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:serviceId", async (req, res, next) => {
  try {
    await prisma.favorite.deleteMany({ where: { userId: req.user!.sub, serviceId: req.params.serviceId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
