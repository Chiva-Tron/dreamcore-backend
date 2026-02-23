import { Response } from "express";

type Meta = {
  request_id: string;
  server_time: string;
};

function buildMeta(requestId: string): Meta {
  return {
    request_id: requestId,
    server_time: new Date().toISOString()
  };
}

export function sendOk(res: Response, statusCode: number, data: unknown) {
  const requestId = String(res.locals.requestId ?? "");
  res.locals.errorCode = undefined;
  return res.status(statusCode).json({
    ok: true,
    data,
    meta: buildMeta(requestId)
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
