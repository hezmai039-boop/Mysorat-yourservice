import fs from "fs";
import path from "path";
import crypto from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, s3Enabled } from "./env";

const diskUploadDir = path.join(process.cwd(), "uploads");
if (!s3Enabled) fs.mkdirSync(diskUploadDir, { recursive: true });

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint,
      credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
      // R2 and most non-AWS S3-compatible providers need path-style URLs
      // (bucket.name/key rather than bucket-name.host/key).
      forcePathStyle: !!env.s3.endpoint,
    });
  }
  return s3Client;
}

function randomFileName(originalName: string): string {
  const ext = path.extname(originalName).slice(0, 10);
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}

/**
 * Persists an uploaded file and returns an opaque storage key. This key is
 * what gets saved on the Document row - never a public URL - so switching
 * between disk and S3 (or rotating a bucket) never invalidates existing
 * records. Use `getDownloadUrl` to turn a key back into something fetchable.
 */
export async function saveUploadedFile(file: Express.Multer.File): Promise<string> {
  const key = randomFileName(file.originalname);

  if (s3Enabled) {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.s3.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );
    return key;
  }

  fs.writeFileSync(path.join(diskUploadDir, key), file.buffer);
  return key;
}

/** How long a download URL stays valid, in seconds - same window either side. */
const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * A storage key is always a generated file name (see `randomFileName`), so a
 * key containing a path separator or `..` can only come from a tampered
 * request. Reject rather than normalise: there is no legitimate caller that
 * needs it, and normalising quietly is how traversal bugs survive review.
 */
function assertSafeKey(key: string): void {
  if (!key || key.includes("/") || key.includes("\\") || key.includes("..")) {
    throw new Error("مفتاح تخزين غير صالح");
  }
}

function diskDownloadSignature(key: string, expiresAt: number): string {
  return crypto.createHmac("sha256", env.jwtSecret).update(`${key}.${expiresAt}`).digest("hex");
}

/**
 * Disk-mode equivalent of an S3 presigned URL. Without this, `/uploads/<key>`
 * is a permanent unauthenticated URL to a national ID, iqama or passport
 * image, and disk mode is the *default* whenever the S3_* variables are unset
 * - so the weaker path was the one actually running in production. Both
 * branches of `getDownloadUrl` now expire on the same 300-second window.
 */
export function verifyDiskDownload(key: string, exp: unknown, sig: unknown): boolean {
  if (typeof exp !== "string" || typeof sig !== "string") return false;
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;
  try {
    assertSafeKey(key);
  } catch {
    return false;
  }
  const expected = diskDownloadSignature(key, expiresAt);
  // Constant-time compare - `timingSafeEqual` throws on a length mismatch, so
  // check that first rather than letting it reject a malformed signature.
  const provided = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (provided.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(provided, expectedBuf);
}

/** Short-lived signed URL - presigned on S3, HMAC-signed on local disk. */
export async function getDownloadUrl(key: string): Promise<string> {
  assertSafeKey(key);
  if (s3Enabled) {
    return getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }), {
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    });
  }
  const expiresAt = Math.floor(Date.now() / 1000) + DOWNLOAD_URL_TTL_SECONDS;
  const sig = diskDownloadSignature(key, expiresAt);
  return `/uploads/${key}?exp=${expiresAt}&sig=${sig}`;
}

export async function deleteStoredFile(key: string): Promise<void> {
  if (s3Enabled) {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return;
  }
  const filePath = path.join(diskUploadDir, key);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
