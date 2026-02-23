type AppEnv = {
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  maxActiveSessionsPerAccount: number;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function requireString(value: string | undefined, name: string): string {
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export const env: AppEnv = {
  jwtSecret: requireString(process.env.JWT_SECRET, "JWT_SECRET"),
  accessTokenTtlSeconds: parsePositiveInt(process.env.ACCESS_TOKEN_TTL_SECONDS, 3600),
  refreshTokenTtlDays: parsePositiveInt(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
  maxActiveSessionsPerAccount: parsePositiveInt(process.env.MAX_ACTIVE_SESSIONS_PER_ACCOUNT, 5)
};
