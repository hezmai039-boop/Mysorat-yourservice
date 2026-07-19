import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import * as Sentry from "@sentry/node";
import { env } from "./lib/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

import authRoutes from "./routes/auth";
import chatRoutes from "./routes/chat";
import operationsRoutes from "./routes/operations";
import feedbackRoutes from "./routes/feedback";
import linksRoutes from "./routes/links";
import adminRoutes from "./routes/admin";
import servicesRoutes from "./routes/services";
import bootstrapRoutes from "./routes/bootstrap";
import customersRoutes from "./routes/customers";
import favoritesRoutes from "./routes/favorites";
import supportRoutes from "./routes/support";
import pushRoutes from "./routes/push";

const app = express();

// Express auto-generates an ETag for every res.json() response. That's fine
// for static assets, but these are authenticated, per-user, constantly
// changing API responses - and axios's default validateStatus only accepts
// 2xx, so a client sending a matching If-None-Match gets back a 304 that
// axios treats as a request failure. That silently breaks any screen whose
// data happens to match the previous response, leaving it stuck loading
// forever. Disable it API-wide instead of chasing this per-route.
app.set("etag", false);

// Render (and any host behind a reverse proxy) forwards the real client IP
// via X-Forwarded-For. Without this, Express ignores that header entirely,
// so express-rate-limit reads every request as coming from Render's single
// proxy IP - which its own validation refuses to do silently, throwing a
// ValidationError on every request instead. That was tripping Render's
// health check and failing the deploy outright. "1" trusts exactly one
// proxy hop (Render's edge), which is the correct value for this topology -
// "true" would trust the whole chain, including a client-spoofed header.
app.set("trust proxy", 1);

app.use(helmet());
app.use(compression());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

const apiLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
app.use("/api", apiLimiter);
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة جداً، الرجاء المحاولة بعد قليل" },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/auth/change-password", authLimiter);

const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة جداً، الرجاء المحاولة بعد قليل" },
});
app.use("/api/auth/2fa", twoFactorLimiter);

const bootstrapLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/bootstrap", bootstrapLimiter);

app.get("/health", (req, res) => res.json({ status: "ok", service: "mysorat-api" }));
app.use("/uploads", express.static("uploads"));

app.use("/api/bootstrap", bootstrapRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/operations", operationsRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/links", linksRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/push", pushRoutes);

app.use(notFoundHandler);
// Reports whatever reaches Express's error-handling chain to Sentry, then
// forwards it unchanged via next(err) - errorHandler below still owns the
// actual JSON response sent to the client, this only adds observability.
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

export default app;
