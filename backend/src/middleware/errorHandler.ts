import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import multer from "multer";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "المسار غير موجود" });
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "بيانات غير صحيحة", details: err.flatten() });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "حجم الملف كبير جداً، الحد الأقصى 10 ميجابايت" : "تعذّر رفع الملف، حاول مرة أخرى";
    return res.status(400).json({ error: message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const fieldLabelsAr: Record<string, string> = { email: "البريد الإلكتروني", phone: "رقم الجوال", code: "الرمز" };
    const targets = (err.meta?.target as string[] | undefined) ?? [];
    const label = targets.map((t) => fieldLabelsAr[t] ?? t).join(", ") || "هذه البيانات";
    return res.status(409).json({ error: `${label} مستخدم مسبقاً` });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "حدث خطأ في الخادم، الرجاء المحاولة لاحقاً" });
}
