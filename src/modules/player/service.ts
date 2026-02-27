import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../lib/http-error";
import { AuthContext } from "../../lib/auth-context";
import { getUnlockedClasses, normalizePlayerProgression } from "./progression";

type PatchMeInput = {
  nickname: string;
};

const NICKNAME_REGEX = /^[a-zA-Z0-9_]+$/;

function canonicalizeJson(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value.normalize("NFC"));
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`).join(",")}}`;
}

function buildRequestHash(method: string, route: string, payload: unknown): string {
  return createHash("sha256").update(`${method} ${route}:${canonicalizeJson(payload)}`).digest("hex");
}

function buildMeta(requestId: string) {
  return {
    request_id: requestId,
    server_time: new Date().toISOString()
  };
}

function validateNicknamePayload(payload: unknown): PatchMeInput {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "validation_failed", "Payload inválido");
  }

  const rawNickname = (payload as Record<string, unknown>).nickname;
  const nickname = typeof rawNickname === "string" ? rawNickname.trim() : "";

  if (!nickname) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "nickname", message: "required" }]);
  }

  if (nickname.length < 3 || nickname.length > 16 || !NICKNAME_REGEX.test(nickname)) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "nickname", message: "length_3_16_or_charset" }]);
  }

  return { nickname };
}

export async function getMeState(auth: AuthContext) {
  const player = await prisma.player.findUnique({
    where: { id: auth.playerId },
    select: {
      id: true,
      user_id: true,
      nickname: true,
      best_score: true,
      best_run_id: true,
      nether_points: true,
      cards_tier: true,
      relics_tier: true,
      classes_tier: true,
      is_banned: true,
      updated_at: true
    }
  });

  if (!player || player.user_id !== auth.userId) {
    throw new HttpError(404, "player_not_found", "Player not found");
  }

  if (player.is_banned) {
    throw new HttpError(403, "player_banned", "Player is banned");
  }

  const activeRun = await prisma.run.findFirst({
    where: {
      player_id: player.id,
      status: "in_progress"
    },
    orderBy: { updated_at: "desc" },
    select: {
      id: true,
      client_run_id: true,
      current_floor: true,
      updated_at: true,
      snapshots: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: {
          snapshot_type: true,
          created_at: true
        }
      }
    }
  });

  const progression = normalizePlayerProgression({
    nether_points: player.nether_points,
    cards_tier: player.cards_tier,
    relics_tier: player.relics_tier,
    classes_tier: player.classes_tier
  });

  return {
    player: {
      user_id: player.user_id,
      nickname: player.nickname,
      best_score: player.best_score,
      best_run_id: player.best_run_id,
      nether_points: progression.nether_points,
      cards_tier: progression.cards_tier,
      relics_tier: progression.relics_tier,
      classes_tier: progression.classes_tier,
      unlocked_classes: getUnlockedClasses(progression.classes_tier),
      is_banned: player.is_banned,
      updated_at: player.updated_at.toISOString()
    },
    active_run: activeRun
      ? {
          status: "in_progress",
          run_id: activeRun.id,
          client_run_id: activeRun.client_run_id,
          snapshot_type: activeRun.snapshots[0]?.snapshot_type ?? "map",
          current_floor: activeRun.current_floor,
          updated_at: activeRun.updated_at.toISOString()
        }
      : { status: "none" }
  };
}

export async function patchMe(params: {
  auth: AuthContext;
  idempotencyKey: string;
  payload: unknown;
  requestId: string;
}) {
  const method = "PATCH";
  const route = "/player/me";
  const scope = `${method} ${route}`;
  const requestHash = buildRequestHash(method, route, params.payload);

  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      scope_player_id_idempotency_key: {
        scope,
        player_id: params.auth.playerId,
        idempotency_key: params.idempotencyKey
      }
    }
  });

  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new HttpError(409, "idempotency_conflict", "Idempotency key already used with different payload");
    }

    return {
      statusCode: existing.status_code,
      body: existing.response_payload
    };
  }

  const validated = validateNicknamePayload(params.payload);

  const player = await prisma.player.findUnique({
    where: { id: params.auth.playerId },
    select: { id: true, user_id: true }
  });

  if (!player || player.user_id !== params.auth.userId) {
    throw new HttpError(404, "player_not_found", "Player not found");
  }

  const updated = await prisma.player.update({
    where: { id: player.id },
    data: { nickname: validated.nickname },
    select: {
      user_id: true,
      nickname: true,
      updated_at: true
    }
  });

  const responseBody = {
    ok: true,
    data: {
      player: {
        user_id: updated.user_id,
        nickname: updated.nickname,
        updated_at: updated.updated_at.toISOString()
      }
    },
    meta: buildMeta(params.requestId)
  };

  try {
    await prisma.idempotencyKey.create({
      data: {
        scope,
        player_id: params.auth.playerId,
        idempotency_key: params.idempotencyKey,
        request_hash: requestHash,
        response_payload: responseBody,
        status_code: 200
      }
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
    ) {
      const conflicted = await prisma.idempotencyKey.findUnique({
        where: {
          scope_player_id_idempotency_key: {
            scope,
            player_id: params.auth.playerId,
            idempotency_key: params.idempotencyKey
          }
        }
      });

      if (conflicted && conflicted.request_hash === requestHash) {
        return {
          statusCode: conflicted.status_code,
          body: conflicted.response_payload
        };
      }

      throw new HttpError(409, "idempotency_conflict", "Idempotency key already used with different payload");
    }

    throw error;
  }

  return {
    statusCode: 200,
    body: responseBody
  };
}
