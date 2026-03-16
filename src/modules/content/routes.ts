import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { sendOk } from "../../lib/envelope";
import { requireAuth } from "../../middleware/require-auth";
import { getBundle, getContentTable, parseBooleanQuery } from "./service";

export const contentRouter = Router();

contentRouter.get(
  "/bundle",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await getBundle(res.locals.auth, parseBooleanQuery(req.query.include_locked));
    return sendOk(res, 200, data);
  })
);

contentRouter.get(
  "/:table",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await getContentTable(
      res.locals.auth,
      String(req.params.table ?? ""),
      req.query.limit,
      req.query.page,
      req.query.offset
    );
    return sendOk(res, 200, result.data, result.meta);
  })
);
