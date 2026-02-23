import { Express, Router } from "express";
import { sendError, sendOk } from "./lib/envelope";
import { authRouter } from "./modules/auth/routes";
import { playerRouter } from "./modules/player/routes";
import { runsRouter } from "./modules/runs/routes";
import { leaderboardRouter } from "./modules/leaderboard/routes";
import { contentRouter } from "./modules/content/routes";
import { telemetryRouter } from "./modules/telemetry/routes";

export function registerRoutes(app: Express) {
  const api = Router();

  api.get("/health", (_req, res) => sendOk(res, 200, { status: "ok" }));

  api.use("/auth", authRouter);
  api.use("/player", playerRouter);
  api.use("/runs", runsRouter);
  api.use("/leaderboard", leaderboardRouter);
  api.use("/content", contentRouter);
  api.use("/telemetry", telemetryRouter);

  api.all("*", (_req, res) => sendError(res, 404, "not_found", "Route not found"));

  app.use("/", api);
}
