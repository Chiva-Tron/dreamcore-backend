import { Response } from "express";

type Meta = {
  request_id: string;
  server_time: string;
} & Record<string, unknown>;

function buildMeta(requestId: string, extra: Record<string, unknown> = {}): Meta {
  return {
    request_id: requestId,
    server_time: new Date().toISOString(),
    ...extra
  };
}

export function sendOk(
  res: Response,
  statusCode: number,
  data: unknown,
  metaExtra: Record<string, unknown> = {}
) {
  const requestId = String(res.locals.requestId ?? "");
  res.locals.errorCode = undefined;
  return res.status(statusCode).json({
    ok: true,
    data,
    meta: buildMeta(requestId, metaExtra)
  });
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
) {
  const requestId = String(res.locals.requestId ?? "");
  res.locals.errorCode = code;
  return res.status(statusCode).json({
    ok: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {})
    },
    meta: buildMeta(requestId)
  });
}
