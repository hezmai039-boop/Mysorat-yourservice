import { generateSecret as generateOtpSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

export function generateSecret(email: string): { secret: string; otpauthUrl: string } {
  const secret = generateOtpSecret();
  const otpauthUrl = generateURI({ issuer: "Mysorat", label: email, secret });
  return { secret, otpauthUrl };
}

export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}

export function generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}
