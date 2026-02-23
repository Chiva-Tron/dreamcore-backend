import { Request, Response } from "express";
import { sendError } from "../lib/envelope";

export function notFoundHandler(_req: Request, res: Response) {
  return sendError(res, 404, "not_found", "Route not found");
}
