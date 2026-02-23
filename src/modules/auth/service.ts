import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../lib/http-error";

type TokenPayload = {
  sub: string;
  player_id: string;
  user_id: string;
};

type SessionDevice = {
  platform: string;
  deviceId: string;
};

type RegisterInput = {
  email: string;
  password: string;
  nickname: string;
  platform: string;
  device_id: string;
};

type LoginInput = {
  email: string;
  password: string;
  platform: string;
  device_id: string;
};

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

function buildAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    algorithm: "HS256",
    expiresIn: env.accessTokenTtlSeconds,
    issuer: "dreamcore-backend",
    audience: "dreamcore-client"
  });
}

function buildExpiryDate(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function enforceSessionLimit(accountId: string) {
  const activeSessions = await prisma.session.findMany({
    where: {
      account_id: accountId,
      revoked_at: null,
      expires_at: { gt: new Date() }
    },
    orderBy: { created_at: "asc" },
    select: { id: true }
  });

  const overflow = activeSessions.length - env.maxActiveSessionsPerAccount + 1;
  if (overflow <= 0) {
    return;
  }

  const idsToRevoke = activeSessions.slice(0, overflow).map((session) => session.id);
  await prisma.session.updateMany({
    where: { id: { in: idsToRevoke } },
    data: { revoked_at: new Date() }
  });
}

async function createSession(accountId: string, device: SessionDevice) {
  await enforceSessionLimit(accountId);

  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const session = await prisma.session.create({
    data: {
      account_id: accountId,
      refresh_token_hash: refreshTokenHash,
      device_id: device.deviceId,
      platform: device.platform,
      expires_at: buildExpiryDate(env.refreshTokenTtlDays)
    }
  });

  return { session, refreshToken };
}

export async function register(input: RegisterInput) {
  const existing = await prisma.account.findUnique({
    where: { email: input.email },
    select: { id: true }
  });

  if (existing) {
    throw new HttpError(409, "email_already_exists", "Email ya registrado");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const created = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        email: input.email,
        password_hash: passwordHash,
        email_verified: false
      }
    });

    const player = await tx.player.create({
      data: {
        account_id: account.id,
        user_id: randomUUID(),
        nickname: input.nickname
      }
    });

    return { account, player };
  });

  const { refreshToken } = await createSession(created.account.id, {
    platform: input.platform,
    deviceId: input.device_id
  });

  const accessToken = buildAccessToken({
    sub: created.account.id,
    player_id: created.player.id,
    user_id: created.player.user_id
  });

  return {
    account_id: created.account.id,
    player: {
      user_id: created.player.user_id,
      nickname: created.player.nickname
    },
    tokens: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: env.accessTokenTtlSeconds
    }
  };
}

export async function login(input: LoginInput) {
  const account = await prisma.account.findUnique({
    where: { email: input.email },
    include: { player: true }
  });

  if (!account) {
    throw new HttpError(401, "invalid_credentials", "Credenciales inválidas");
  }

  const isValidPassword = await bcrypt.compare(input.password, account.password_hash);
  if (!isValidPassword) {
    throw new HttpError(401, "invalid_credentials", "Credenciales inválidas");
  }

  if (!account.player) {
    throw new HttpError(500, "internal_error", "Cuenta sin player asociado");
  }

  if (account.player.is_banned) {
    throw new HttpError(403, "account_banned", "Cuenta baneada");
  }

  const { refreshToken } = await createSession(account.id, {
    platform: input.platform,
    deviceId: input.device_id
  });

  const accessToken = buildAccessToken({
    sub: account.id,
    player_id: account.player.id,
    user_id: account.player.user_id
  });

  return {
    player: {
      user_id: account.player.user_id,
      nickname: account.player.nickname,
      is_banned: account.player.is_banned
    },
    tokens: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: env.accessTokenTtlSeconds
    }
  };
}

export async function refresh(refreshToken: string) {
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const session = await prisma.session.findUnique({
    where: { refresh_token_hash: refreshTokenHash },
    include: {
      account: {
        include: {
          player: true
        }
      }
    }
  });

  if (!session) {
    throw new HttpError(401, "refresh_token_invalid", "Refresh token inválido");
  }

  if (session.revoked_at) {
    throw new HttpError(403, "session_revoked", "Session revocada");
  }

  if (session.expires_at.getTime() <= Date.now()) {
    throw new HttpError(401, "refresh_token_expired", "Refresh token expirado");
  }

  if (!session.account.player) {
    throw new HttpError(500, "internal_error", "Cuenta sin player asociado");
  }

  const newRefreshToken = createRefreshToken();
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refresh_token_hash: hashRefreshToken(newRefreshToken),
      expires_at: buildExpiryDate(env.refreshTokenTtlDays)
    }
  });

  const accessToken = buildAccessToken({
    sub: session.account.id,
    player_id: session.account.player.id,
    user_id: session.account.player.user_id
  });

  return {
    access_token: accessToken,
    refresh_token: newRefreshToken,
    expires_in: env.accessTokenTtlSeconds
  };
}

export async function logout(refreshToken: string) {
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const session = await prisma.session.findUnique({
    where: { refresh_token_hash: refreshTokenHash },
    select: { id: true, revoked_at: true }
  });

  if (!session) {
    return { revoked: true };
  }

  if (!session.revoked_at) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revoked_at: new Date() }
    });
  }

  return { revoked: true };
}
