import { NextFunction, Request, Response } from "express";
import { verifyToken, JwtPayload } from "../lib/auth";
import { prisma } from "../lib/prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: "غير مصرح لك بالدخول" });
  }

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "الجلسة منتهية، الرجاء تسجيل الدخول مجدداً" });
  }

  // A valid signature is not enough on its own. Tokens live for days (see
  // JWT_EXPIRES_IN), and login is the only other place isActive is checked -
  // so without this lookup, suspending an account via
  // PATCH /customers/:id/status would do nothing at all until the holder's
  // token happened to expire. Suspension exists for fraud and abuse, i.e. the
  // exact situation where access has to stop now rather than up to a week
  // later. One indexed primary-key lookup per authenticated request is a
  // cheap price for making the action mean what it says.
  try {
    const account = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true },
    });
    if (!account) {
      return res.status(401).json({ error: "الجلسة منتهية، الرجاء تسجيل الدخول مجدداً" });
    }
    if (!account.isActive) {
      return res.status(403).json({ error: "هذا الحساب موقوف، تواصل مع الدعم" });
    }
  } catch (err) {
    // A database failure must not be mistaken for a bad token - hand it to the
    // error handler as the 500 it is.
    return next(err);
  }

  req.user = payload;
  next();
}

export function requireRole(...roles: JwtPayload["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "ليس لديك صلاحية للوصول إلى هذا المورد" });
    }
    next();
  };
}
