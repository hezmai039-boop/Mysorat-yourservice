import "dotenv/config";

const nodeEnv = process.env.NODE_ENV ?? "development";

// Only keep characters a valid http(s) origin can ever contain: letters,
// digits, and : / . - _. This is an allowlist, not a blacklist, so it is
// immune to whatever specific invisible/control character ends up in a
// copy-pasted env var value - anything not in this set is silently
// dropped, guaranteeing a valid HTTP header value for Access-Control-Allow-Origin.
const ALLOWED_ORIGIN_CHARS = new RegExp("[^A-Za-z0-9:/.\\-]", "g");

function sanitizeOrigin(value: string): string {
  return value.replace(ALLOWED_ORIGIN_CHARS, "");
}

function requiredInProduction(name: string, devFallback: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    if (nodeEnv === "production") {
      throw new Error(`Missing required environment variable in production: ${name}`);
    }
    return devFallback;
  }
  return value;
}

const rawCorsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv,
  corsOrigin: sanitizeOrigin(rawCorsOrigin),
  jwtSecret: requiredInProduction("JWT_SECRET", "dev-only-insecure-secret-change-me"),
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN ?? "7d").trim(),
  anthropicApiKey: (process.env.ANTHROPIC_API_KEY ?? "").trim(),
  claudeModel: (process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6").trim(),
  s3: {
    bucket: (process.env.S3_BUCKET ?? "").trim(),
    region: (process.env.S3_REGION ?? "auto").trim(),
    endpoint: (process.env.S3_ENDPOINT ?? "").trim() || undefined,
    accessKeyId: (process.env.S3_ACCESS_KEY_ID ?? "").trim(),
    secretAccessKey: (process.env.S3_SECRET_ACCESS_KEY ?? "").trim(),
  },
};

// Object storage is only used once all four credentials are present; with
// any missing, document uploads fall back to local disk (fine for a single
// dev instance, not durable across redeploys or multiple instances).
export const s3Enabled =
  !!env.s3.bucket && !!env.s3.accessKeyId && !!env.s3.secretAccessKey;
