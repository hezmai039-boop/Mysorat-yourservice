import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const services = await prisma.serviceCatalog.findMany({ where: { active: true }, orderBy: { category: "asc" } });
    res.json({ services });
  } catch (err) {
    next(err);
  }
});

const serviceSchema = z.object({
  code: z.string().min(2),
  nameAr: z.string().min(2),
  nameEn: z.string().min(2),
  category: z.string().min(2),
  descriptionAr: z.string().optional(),
  targetAudience: z.array(z.enum(["CITIZEN", "RESIDENT", "VISITOR", "BUSINESS"])).default([]),
  estimatedDays: z.number().int().positive().default(3),
  baseFeeSar: z.number().nonnegative().default(0),
  requiredDocs: z.array(z.string()).default([]),
});

router.post("/", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const data = serviceSchema.parse(req.body);
    const service = await prisma.serviceCatalog.create({ data });
    res.status(201).json({ service });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const data = serviceSchema.partial().parse(req.body);
    const service = await prisma.serviceCatalog.update({ where: { id: req.params.id }, data });
    res.json({ service });
  } catch (err) {
    next(err);
  }
});

export default router;
