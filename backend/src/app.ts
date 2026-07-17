import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
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

const app = express();

// Express auto-generates an ETag for every res.json() response. That's fine
// for static assets, but these are authenticated, per-user, constantly
// changing API responses - and axios's default validateStatus only accepts
// 2xx, so a client sending a matching If-None-Match gets back a 304 that
// axios treats as a request failure. That silently breaks any screen whose
// data happens to match the previous response, leaving it stuck loading
// forever. Disable it API-wide instead of chasing this per-route.
app.set("etag", false);

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

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
