import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { signToken } from "../lib/auth";

// التسجيل الذاتي لمقدمي الخدمة (بوابة «انضم كمقدم خدمة»):
// أي حساب يقدّم طلب انضمام بتخصصه، ينشأ له سجل Expert غير مفعّل،
// والمالك وحده يعتمده من لوحة الإدارة (PATCH /admin/experts/:id).
// الاعتماد شرط دخول سوق الطلبات - loadExpertOrThrow في market.ts يرفض
// غير المفعّل من جهة الخادم أيضاً.

const router = Router();
router.use(requireAuth);

const applySchema = z.object({
  specialty: z.string().min(3).max(200),
});

router.post("/apply", async (req, res, next) => {
  try {
    const { sub, role } = req.user!;
    if (role === "OWNER") throw new ApiError(400, "حساب المالك لا يحتاج ملف مقدم خدمة");
    const { specialty } = applySchema.parse(req.body);

    const expert = await prisma.expert.upsert({
      where: { userId: sub },
      create: { userId: sub, specialty, active: false },
      update: { specialty },
    });

    // حساب مقدم الخدمة يتحول لدور EXPERT (نموذج inDrive: حساب تنفيذ لا طلب)،
    // ويُعاد إصدار الرمز فوراً كي لا يبقى الدور القديم في الجلسة الحالية.
    const user = await prisma.user.update({ where: { id: sub }, data: { role: "EXPERT" } });
    const token = signToken({ sub: user.id, role: user.role, email: user.email });

    res.status(201).json({
      token,
      expert: { id: expert.id, specialty: expert.specialty, active: expert.active },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", async (req, res, next) => {
  try {
    const expert = await prisma.expert.findUnique({ where: { userId: req.user!.sub } });
    if (!expert) return res.json({ expert: null });
    res.json({ expert: { id: expert.id, specialty: expert.specialty, active: expert.active } });
  } catch (err) {
    next(err);
  }
});

export default router;
