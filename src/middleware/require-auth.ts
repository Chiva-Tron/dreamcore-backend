import jwt from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { HttpError } from "../lib/http-error";

type AccessTokenPayload = {
  sub: string;
  player_id: string;
  user_id: string;
};

function parseAuthorizationHeader(value: string | undefined): string {
  if (!value) {
    throw new HttpError(401, "unauthorized", "Missing authorization header");
  }

  const [scheme, token] = value.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new HttpError(401, "unauthorized", "Invalid authorization header");
  }

  return token;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = parseAuthorizationHeader(req.header("authorization"));

  try {
    const decoded = jwt.verify(token, env.jwtSecret, {
      algorithms: ["HS256"],
      issuer: "dreamcore-backend",
      audience: "dreamcore-client"
    });

    const payload = decoded as Partial<AccessTokenPayload>;
    if (!payload.sub || !payload.player_id || !payload.user_id) {
      throw new HttpError(401, "unauthorized", "Invalid access token payload");
    }

    res.locals.auth = {
      accountId: payload.sub,
      playerId: payload.player_id,
      userId: payload.user_id
    };

    next();
  } catch {
    next(new HttpError(401, "unauthorized", "Invalid or expired access token"));
  }
}
