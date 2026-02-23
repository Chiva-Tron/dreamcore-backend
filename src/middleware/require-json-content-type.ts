import { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error";

const METHODS_REQUIRING_JSON = new Set(["POST", "PUT", "PATCH"]);

export function requireJsonContentType(req: Request, _res: Response, next: NextFunction) {
  if (!METHODS_REQUIRING_JSON.has(req.method)) {
    next();
    return;
  }

  const contentType = req.header("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    next(new HttpError(415, "unsupported_media_type", "Content-Type must be application/json"));
    return;
  }

  next();
}
