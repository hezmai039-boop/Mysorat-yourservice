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

/** Short-lived signed URL for S3, or a direct static path for disk storage. */
export async function getDownloadUrl(key: string): Promise<string> {
  if (s3Enabled) {
    return getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }), {
      expiresIn: 300,
    });
  }
  return `/uploads/${key}`;
}

export async function deleteStoredFile(key: string): Promise<void> {
  if (s3Enabled) {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return;
  }
  const filePath = path.join(diskUploadDir, key);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
