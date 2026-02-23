import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { sendError, sendOk } from "../../lib/envelope";
import { requireAuth } from "../../middleware/require-auth";
import { runsMutationLimiter, runsSnapshotLimiter } from "../../middleware/rate-limit";
import { abandonRun, finishRun, getActiveRun, saveSnapshot, startRun } from "./service";

export const runsRouter = Router();

runsRouter.post(
  "/start",
  requireAuth,
  runsMutationLimiter,
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header("x-idempotency-key")?.trim();
    if (!idempotencyKey) {
      return sendError(res, 400, "validation_failed", "Payload inválido", [
        { field: "x-idempotency-key", message: "required" }
      ]);
    }

    const result = await startRun({
      auth: res.locals.auth,
      idempotencyKey,
      payload: req.body,
      requestId: String(res.locals.requestId ?? "")
    });

    return res.status(result.statusCode).json(result.body);
  })
);

runsRouter.get(
  "/active",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const data = await getActiveRun(res.locals.auth);
    return sendOk(res, 200, data);
  })
);

runsRouter.patch(
  "/:run_id/snapshot",
  requireAuth,
  runsSnapshotLimiter,
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header("x-idempotency-key")?.trim();
    if (!idempotencyKey) {
      return sendError(res, 400, "validation_failed", "Payload inválido", [
        { field: "x-idempotency-key", message: "required" }
      ]);
    }

    const runId = String(req.params.run_id ?? "").trim();
    if (!runId) {
      return sendError(res, 400, "validation_failed", "Payload inválido", [
        { field: "run_id", message: "required" }
      ]);
    }

    const result = await saveSnapshot({
      auth: res.locals.auth,
      runId,
      idempotencyKey,
      payload: req.body,
      requestId: String(res.locals.requestId ?? "")
    });

    return res.status(result.statusCode).json(result.body);
  })
);

runsRouter.post(
  "/:run_id/finish",
  requireAuth,
  runsMutationLimiter,
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header("x-idempotency-key")?.trim();
    if (!idempotencyKey) {
      return sendError(res, 400, "validation_failed", "Payload inválido", [
        { field: "x-idempotency-key", message: "required" }
      ]);
    }

    const runId = String(req.params.run_id ?? "").trim();
    if (!runId) {
      return sendError(res, 400, "validation_failed", "Payload inválido", [
        { field: "run_id", message: "required" }
      ]);
    }

    const result = await finishRun({
      auth: res.locals.auth,
      runId,
      idempotencyKey,
      payload: req.body,
      requestId: String(res.locals.requestId ?? "")
    });

    return res.status(result.statusCode).json(result.body);
  })
);

runsRouter.post(
  "/:run_id/abandon",
  requireAuth,
  runsMutationLimiter,
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header("x-idempotency-key")?.trim();
    if (!idempotencyKey) {
      return sendError(res, 400, "validation_failed", "Payload inválido", [
        { field: "x-idempotency-key", message: "required" }
      ]);
    }

    const runId = String(req.params.run_id ?? "").trim();
    if (!runId) {
      return sendError(res, 400, "validation_failed", "Payload inválido", [
        { field: "run_id", message: "required" }
      ]);
    }

    const result = await abandonRun({
      auth: res.locals.auth,
      runId,
      idempotencyKey,
      payload: req.body,
      requestId: String(res.locals.requestId ?? "")
    });

    return res.status(result.statusCode).json(result.body);
  })
);
