import crypto from "crypto";
import { prisma } from "./prisma";

export async function generateUniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const existing = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!existing) return code;
  }
  throw new Error("تعذّر إنشاء رمز إحالة فريد");
}
