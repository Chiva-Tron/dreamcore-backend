import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { sendOk } from "../../lib/envelope";
import { leaderboardLimiter } from "../../middleware/rate-limit";
import { requireAuth } from "../../middleware/require-auth";
import { getLeaderboard } from "./service";

export const leaderboardRouter = Router();

leaderboardRouter.get(
  "/",
  leaderboardLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await getLeaderboard({
      auth: res.locals.auth,
      limitRaw: req.query.limit,
      offsetRaw: req.query.offset
    });

    return sendOk(res, 200, data);
  })
);
