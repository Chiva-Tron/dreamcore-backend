import rateLimit from "express-rate-limit";
import { Request } from "express";
import { sendError } from "../lib/envelope";

type CreateLimiterParams = {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
};

export function createLimiter(params: CreateLimiterParams) {
  return rateLimit({
    windowMs: params.windowMs,
    max: params.max,
    standardHeaders: false,
    legacyHeaders: true,
    keyGenerator: params.keyGenerator,
    handler: (_req, res) => {
      const retryAfter = res.getHeader("Retry-After");
      if (!retryAfter) {
        res.setHeader("Retry-After", Math.ceil(params.windowMs / 1000));
      }

      return sendError(res, 429, "too_many_requests", "Too many requests");
    }
  });
}

export const authLoginIpLimiter = createLimiter({
  windowMs: 60_000,
  max: 10
});

export const authRegisterIpLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5
});

export const authLoginEmailLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => {
    const body = req.body as Record<string, unknown> | undefined;
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "anonymous";
    return `email:${email}`;
  }
});

export const runsMutationLimiter = createLimiter({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => `player:${String(req.res?.locals?.auth?.playerId ?? req.ip)}`
});

export const runsSnapshotLimiter = createLimiter({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req) => `player:${String(req.res?.locals?.auth?.playerId ?? req.ip)}`
});

export const leaderboardLimiter = createLimiter({
  windowMs: 60_000,
  max: 120
});
