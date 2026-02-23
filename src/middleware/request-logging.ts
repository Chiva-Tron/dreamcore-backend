import { createHash } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

function hashIp(ip: string | undefined): string | null {
  if (!ip) {
    return null;
  }

  return createHash("sha256").update(ip).digest("hex");
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const requestId = String(res.locals.requestId ?? "");
    const playerId = typeof res.locals.auth?.playerId === "string" ? res.locals.auth.playerId : null;
    const durationMs = Date.now() - startedAt;
    const errorCode = typeof res.locals.errorCode === "string" ? res.locals.errorCode : null;

    const logPayload = {
      request_id: requestId,
      player_id: playerId,
      endpoint: req.path,
      method: req.method,
      status_code: res.statusCode,
      duration_ms: durationMs,
      error_code: errorCode
    };

    console.log(JSON.stringify(logPayload));

    void prisma.requestLog.create({
      data: {
        request_id: requestId || "00000000-0000-0000-0000-000000000000",
        path: req.path.slice(0, 128),
        method: req.method.slice(0, 8),
        player_id: playerId,
        ip_hash: hashIp(req.ip),
        status_code: res.statusCode,
        duration_ms: durationMs,
        error_code: errorCode ?? undefined
      }
    }).catch((error) => {
      console.error("request_log_persist_failed", error);
    });
  });

  next();
}
