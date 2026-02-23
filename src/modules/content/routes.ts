import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { sendOk } from "../../lib/envelope";
import { requireAuth } from "../../middleware/require-auth";
import { getBundle, getContentTable } from "./service";

export const contentRouter = Router();

contentRouter.get(
  "/bundle",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const data = await getBundle(res.locals.auth);
    return sendOk(res, 200, data);
  })
);

contentRouter.get(
  "/:table",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await getContentTable(res.locals.auth, String(req.params.table ?? ""));
    return sendOk(res, 200, data);
  })
);
