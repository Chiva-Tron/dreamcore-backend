import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { sendError, sendOk } from "../../lib/envelope";
import { requireAuth } from "../../middleware/require-auth";
import { getMeState, patchMe } from "./service";

export const playerRouter = Router();

playerRouter.get(
  "/me/state",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const data = await getMeState(res.locals.auth);
    return sendOk(res, 200, data);
  })
);

playerRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header("x-idempotency-key")?.trim();
    if (!idempotencyKey) {
      return sendError(res, 400, "validation_failed", "Payload inválido", [
        { field: "x-idempotency-key", message: "required" }
      ]);
    }

    const result = await patchMe({
      auth: res.locals.auth,
      idempotencyKey,
      payload: req.body,
      requestId: String(res.locals.requestId ?? "")
    });

    return res.status(result.statusCode).json(result.body);
  })
);
