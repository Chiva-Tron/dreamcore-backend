import { HttpError } from "../../lib/http-error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NICKNAME_REGEX = /^[a-zA-Z0-9_]+$/;

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

type RefreshInput = {
  refresh_token: string;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getStringFromAliases(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = getString(data[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

function requireField(value: string, field: string) {
  if (!value) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field, message: "required" }]);
  }
}

export function validateRegisterPayload(payload: unknown): RegisterInput {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "validation_failed", "Payload inválido");
  }

  const data = payload as Record<string, unknown>;
  const email = getString(data.email).toLowerCase();
  const password = getString(data.password);
  const nickname = getStringFromAliases(data, ["nickname", "nick_name", "username", "user_name"]);
  const platform = getString(data.platform);
  const deviceId = getStringFromAliases(data, ["device_id", "deviceId"]);

  requireField(email, "email");
  requireField(password, "password");
  requireField(nickname, "nickname");
  requireField(platform, "platform");
  requireField(deviceId, "device_id");

  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "email", message: "invalid_format" }]);
  }

  if (password.length < 8 || password.length > 128) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "password", message: "length_8_128" }]);
  }

  if (nickname.length < 3 || nickname.length > 16 || !NICKNAME_REGEX.test(nickname)) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "nickname", message: "length_3_16_or_charset" }]);
  }

  if (platform.length > 32) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "platform", message: "max_32" }]);
  }

  if (deviceId.length > 128) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "device_id", message: "max_128" }]);
  }

  return {
    email,
    password,
    nickname,
    platform,
    device_id: deviceId
  };
}

export function validateLoginPayload(payload: unknown): LoginInput {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "validation_failed", "Payload inválido");
  }

  const data = payload as Record<string, unknown>;
  const email = getString(data.email).toLowerCase();
  const password = getString(data.password);
  const platform = getString(data.platform);
  const deviceId = getStringFromAliases(data, ["device_id", "deviceId"]);

  requireField(email, "email");
  requireField(password, "password");
  requireField(platform, "platform");
  requireField(deviceId, "device_id");

  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "email", message: "invalid_format" }]);
  }

  return {
    email,
    password,
    platform,
    device_id: deviceId
  };
}

export function validateRefreshPayload(payload: unknown): RefreshInput {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "validation_failed", "Payload inválido");
  }

  const token = getString((payload as Record<string, unknown>).refresh_token);
  requireField(token, "refresh_token");

  return { refresh_token: token };
}
