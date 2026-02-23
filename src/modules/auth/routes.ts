import { Router } from "express";
import { sendOk } from "../../lib/envelope";
import { asyncHandler } from "../../lib/async-handler";
import { login, logout, refresh, register } from "./service";
import { validateLoginPayload, validateRefreshPayload, validateRegisterPayload } from "./validation";
import { authLoginEmailLimiter, authLoginIpLimiter, authRegisterIpLimiter } from "../../middleware/rate-limit";

export const authRouter = Router();

authRouter.post(
  "/register",
  authRegisterIpLimiter,
  asyncHandler(async (req, res) => {
    const payload = validateRegisterPayload(req.body);
    const data = await register(payload);
    return sendOk(res, 201, data);
  })
);

authRouter.post(
  "/login",
  authLoginIpLimiter,
  authLoginEmailLimiter,
  asyncHandler(async (req, res) => {
    const payload = validateLoginPayload(req.body);
    const data = await login(payload);
    return sendOk(res, 200, data);
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const payload = validateRefreshPayload(req.body);
    const data = await refresh(payload.refresh_token);
    return sendOk(res, 200, data);
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const payload = validateRefreshPayload(req.body);
    const data = await logout(payload.refresh_token);
    return sendOk(res, 200, data);
  })
);
