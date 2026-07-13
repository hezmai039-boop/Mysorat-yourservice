import "dotenv/config";

const nodeEnv = process.env.NODE_ENV ?? "development";

// Strips whitespace and invisible/zero-width characters anywhere in the
// string (not just the edges) - copy-pasting env var values from chat apps,
// docs, or some browsers can embed characters mid-string that a plain
// .trim() would miss, and any of these would make the value an invalid
// HTTP header value (used directly as Access-Control-Allow-Origin).
const INVISIBLE_CHARS_PATTERN = new RegExp(
  "[\\s\\u200B\\u200C\\u200D\\u2060\\uFEFF]",
  "g"
);

function sanitizeHeaderValue(value: string): string {
  return value.replace(INVISIBLE_CHARS_PATTERN, "");
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

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv,
  corsOrigin: sanitizeHeaderValue(process.env.CORS_ORIGIN ?? "http://localhost:5173"),
  jwtSecret: requiredInProduction("JWT_SECRET", "dev-only-insecure-secret-change-me"),
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN ?? "7d").trim(),
  anthropicApiKey: (process.env.ANTHROPIC_API_KEY ?? "").trim(),
  claudeModel: (process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6").trim(),
};
