import "dotenv/config";

const nodeEnv = process.env.NODE_ENV ?? "development";

function requiredInProduction(name: string, devFallback: string): string {
  const value = process.env[name];
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
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  jwtSecret: requiredInProduction("JWT_SECRET", "dev-only-insecure-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
};
