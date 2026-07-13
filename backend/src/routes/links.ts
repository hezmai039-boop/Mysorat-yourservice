import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { checkAllLinks } from "../services/linkChecker";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const links = await prisma.governmentLink.findMany({ orderBy: { category: "asc" } });
    res.json({ links });
  } catch (err) {
    next(err);
  }
});

const linkSchema = z.object({
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  url: z.string().url(),
  category: z.string().min(1),
});

router.post("/", requireRole("OWNER"), async (req, res, next) => {
  try {
    const data = linkSchema.parse(req.body);
    const link = await prisma.governmentLink.create({ data });
    res.status(201).json({ link });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireRole("OWNER"), async (req, res, next) => {
  try {
    const data = linkSchema.partial().parse(req.body);
    const link = await prisma.governmentLink.update({ where: { id: req.params.id }, data });
    res.json({ link });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireRole("OWNER"), async (req, res, next) => {
  try {
    await prisma.governmentLink.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post("/check-all", requireRole("OWNER"), async (req, res, next) => {
  try {
    const result = await checkAllLinks();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
