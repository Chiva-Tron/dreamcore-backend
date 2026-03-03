import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { sendOk } from "../../lib/envelope";
import { requireAuth } from "../../middleware/require-auth";
import { ingestTelemetryBatch } from "./service";

export const telemetryRouter = Router();

const submitTelemetryBatch = asyncHandler(async (req, res) => {
  const data = await ingestTelemetryBatch({
    auth: res.locals.auth,
    payload: req.body
  });

  return sendOk(res, 202, data);
});

telemetryRouter.post(
  "/events/batch",
  requireAuth,
  submitTelemetryBatch
);

telemetryRouter.post("/submit_run", requireAuth, submitTelemetryBatch);
telemetryRouter.post("/submit-run", requireAuth, submitTelemetryBatch);
