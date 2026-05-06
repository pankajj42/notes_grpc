import { rateLimit } from "express-rate-limit";
import { parseRefreshToken } from "@notes/shared-types";
import { REFRESH_COOKIE_NAME } from "../lib/cookies.js";

export const refreshRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const cookie = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
    if (typeof cookie === "string") {
      const parsed = parseRefreshToken(cookie);
      if (parsed != null) return parsed.sessionId;
    }
    return "unauthenticated";
  },
  handler: (_req, res) => {
    res.status(429).json({ status: "error", code: "RATE_LIMITED", message: "Too many refresh attempts. Try again later." });
  },
});

export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ status: "error", code: "RATE_LIMITED", message: "Too many signup attempts. Try again later." });
  },
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ status: "error", code: "RATE_LIMITED", message: "Too many login attempts. Try again later." });
  },
});