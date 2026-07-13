import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "./env";

const VALID_ROLES = ["INDIVIDUAL", "BUSINESS", "EXPERT", "OWNER"] as const;

export interface JwtPayload {
  sub: string;
  role: (typeof VALID_ROLES)[number];
  email: string;
  type: "access";
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: Omit<JwtPayload, "type">): string {
  return jwt.sign({ ...payload, type: "access" }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
    algorithm: "HS256",
  });
}

export function verifyToken(token: string): JwtPayload {
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as Partial<JwtPayload>;
  if (payload.type !== "access" || !payload.role || !VALID_ROLES.includes(payload.role)) {
    throw new Error("Not a valid access token");
  }
  return payload as JwtPayload;
}

interface PendingTwoFactorPayload {
  sub: string;
  type: "pending2fa";
}

export function signPendingTwoFactorToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "pending2fa" }, env.jwtSecret, { expiresIn: "5m", algorithm: "HS256" });
}

export function verifyPendingTwoFactorToken(token: string): string {
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as Partial<PendingTwoFactorPayload>;
  if (payload.type !== "pending2fa" || !payload.sub) {
    throw new Error("Not a pending 2FA token");
  }
  return payload.sub;
}
