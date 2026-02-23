import { NextFunction, Request, Response } from "express";
import { sendError } from "../lib/envelope";
import { HttpError } from "../lib/http-error";

type BodyParserError = Error & {
  type?: string;
  status?: number;
};

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    return sendError(res, error.statusCode, error.code, error.message, error.details);
  }

  const bodyParserError = error as BodyParserError;
  if (bodyParserError?.type === "entity.too.large" || bodyParserError?.status === 413) {
    return sendError(res, 413, "payload_too_large", "Payload too large");
  }

  if (bodyParserError?.type === "entity.parse.failed" || bodyParserError instanceof SyntaxError) {
    return sendError(res, 400, "validation_failed", "Payload inválido");
  }

  console.error("Unhandled error", error);
  return sendError(res, 500, "internal_error", "Internal server error");
}
