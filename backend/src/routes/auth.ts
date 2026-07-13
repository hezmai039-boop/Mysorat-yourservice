import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  hashPassword,
  signToken,
  verifyPassword,
  signPendingTwoFactorToken,
  verifyPendingTwoFactorToken,
} from "../lib/auth";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { generateSecret, verifyTotp, generateQrCodeDataUrl } from "../services/twoFactor";

const router = Router();

const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8, "كلمة المرور يجب ألا تقل عن 8 أحرف"),
    phone: z.string().min(9).optional(),
    accountType: z.enum(["INDIVIDUAL", "BUSINESS"]),
    fullName: z.string().min(2).optional(),
    companyName: z.string().min(2).optional(),
    crNumber: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.accountType === "INDIVIDUAL" && !data.fullName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fullName"], message: "الاسم الكامل مطلوب" });
    }
    if (data.accountType === "BUSINESS" && !data.companyName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: "اسم المنشأة مطلوب" });
    }
  });

router.post("/register", async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ApiError(409, "البريد الإلكتروني مسجل مسبقاً");
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        phone: data.phone,
        passwordHash,
        role: data.accountType,
        accountType: data.accountType,
        ...(data.accountType === "INDIVIDUAL"
          ? { individualProfile: { create: { fullName: data.fullName! } } }
          : { businessProfile: { create: { companyName: data.companyName!, crNumber: data.crNumber } } }),
      },
    });

    const token = signToken({ sub: user.id, role: user.role, email: user.email });
    res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/login", async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      throw new ApiError(401, "البريد الإلكتروني أو كلمة المرور غير صحيحة");
    }
    if (!user.isActive) {
      throw new ApiError(403, "هذا الحساب موقوف، تواصل مع الدعم");
    }

    if (user.twoFactorEnabled) {
      const tempToken = signPendingTwoFactorToken(user.id);
      return res.json({ requires2FA: true, tempToken });
    }

    const token = signToken({ sub: user.id, role: user.role, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

const verifyLoginSchema = z.object({
  tempToken: z.string(),
  token: z.string().length(6),
});

router.post("/2fa/verify-login", async (req, res, next) => {
  try {
    const { tempToken, token } = verifyLoginSchema.parse(req.body);
    let userId: string;
    try {
      userId = verifyPendingTwoFactorToken(tempToken);
    } catch {
      throw new ApiError(401, "انتهت صلاحية الجلسة المؤقتة، الرجاء تسجيل الدخول من جديد");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new ApiError(401, "غير مصرح");
    }
    if (!(await verifyTotp(user.twoFactorSecret, token))) {
      throw new ApiError(401, "رمز التحقق غير صحيح");
    }

    const finalToken = signToken({ sub: user.id, role: user.role, email: user.email });
    res.json({ token: finalToken, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

router.post("/2fa/setup", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) throw new ApiError(404, "المستخدم غير موجود");
    if (user.twoFactorEnabled) throw new ApiError(409, "التحقق بخطوتين مفعّل مسبقاً");

    const { secret, otpauthUrl } = generateSecret(user.email);
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });

    const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl);
    res.json({ secret, qrCodeDataUrl });
  } catch (err) {
    next(err);
  }
});

const twoFactorCodeSchema = z.object({ token: z.string().length(6) });

router.post("/2fa/enable", requireAuth, async (req, res, next) => {
  try {
    const { token } = twoFactorCodeSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user || !user.twoFactorSecret) throw new ApiError(400, "لم يتم بدء إعداد التحقق بخطوتين بعد");

    if (!(await verifyTotp(user.twoFactorSecret, token))) {
      throw new ApiError(401, "رمز التحقق غير صحيح");
    }

    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    res.json({ enabled: true });
  } catch (err) {
    next(err);
  }
});

router.post("/2fa/disable", requireAuth, async (req, res, next) => {
  try {
    const { token } = twoFactorCodeSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new ApiError(400, "التحقق بخطوتين غير مفعّل");
    }
    if (!(await verifyTotp(user.twoFactorSecret, token))) {
      throw new ApiError(401, "رمز التحقق غير صحيح");
    }

    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
    res.json({ enabled: false });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { individualProfile: true, businessProfile: true, expert: true },
    });
    if (!user) throw new ApiError(404, "المستخدم غير موجود");
    const { passwordHash, twoFactorSecret, ...safe } = user;
    res.json({ user: safe });
  } catch (err) {
    next(err);
  }
});

export default router;
