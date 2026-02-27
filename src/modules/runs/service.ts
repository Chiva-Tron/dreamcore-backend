import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { HttpError } from "../../lib/http-error";
import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../lib/auth-context";
import { calculateNetherPointsGain, deriveTiersFromNetherPoints } from "../player/progression";
import {
  validateAbandonPayload,
  validateFinishPayload,
  validateSnapshotPayload,
  validateStartRunPayload
} from "./validation";

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

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function getIdempotencyReplay(
  scope: string,
  playerId: string,
  idempotencyKey: string,
  requestHash: string
) {
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      scope_player_id_idempotency_key: {
        scope,
        player_id: playerId,
        idempotency_key: idempotencyKey
      }
    }
  });

  if (!existing) {
    return null;
  }

  if (existing.request_hash !== requestHash) {
    throw new HttpError(409, "idempotency_conflict", "Idempotency key already used with different payload");
  }

  return {
    statusCode: existing.status_code,
    body: existing.response_payload
  };
}

async function storeIdempotencyResponse(params: {
  scope: string;
  playerId: string;
  idempotencyKey: string;
  requestHash: string;
  statusCode: number;
  body: Record<string, unknown>;
}) {
  try {
    await prisma.idempotencyKey.create({
      data: {
        scope: params.scope,
        player_id: params.playerId,
        idempotency_key: params.idempotencyKey,
        request_hash: params.requestHash,
        response_payload: toInputJson(params.body),
        status_code: params.statusCode
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await prisma.idempotencyKey.findUnique({
        where: {
          scope_player_id_idempotency_key: {
            scope: params.scope,
            player_id: params.playerId,
            idempotency_key: params.idempotencyKey
          }
        }
      });

      if (replay && replay.request_hash === params.requestHash) {
        return {
          statusCode: replay.status_code,
          body: replay.response_payload
        };
      }

      throw new HttpError(409, "idempotency_conflict", "Idempotency key already used with different payload");
    }

    throw error;
  }

  return {
    statusCode: params.statusCode,
    body: params.body
  };
}

async function ensurePlayer(auth: AuthContext, requireNotBanned = false) {
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
      is_banned: true
    }
  });

  if (!player || player.user_id !== auth.userId) {
    throw new HttpError(404, "player_not_found", "Player not found");
  }

  if (requireNotBanned && player.is_banned) {
    throw new HttpError(403, "player_banned", "Player is banned");
  }

  return player;
}

function stateConflict(runId: string, currentStatus: string) {
  return new HttpError(409, "state_conflict", "State transition conflict", {
    reason: "run_not_active",
    run_id: runId,
    current_status: currentStatus,
    allowed_from: ["in_progress"]
  });
}

export async function startRun(params: {
  auth: AuthContext;
  idempotencyKey: string;
  payload: unknown;
  requestId: string;
}) {
  const method = "POST";
  const route = "/runs/start";
  const scope = `${method} ${route}`;
  const requestHash = buildRequestHash(method, route, params.payload);

  const replay = await getIdempotencyReplay(scope, params.auth.playerId, params.idempotencyKey, requestHash);
  if (replay) {
    return replay;
  }

  const validated = validateStartRunPayload(params.payload);
  const player = await ensurePlayer(params.auth);

  const activeRun = await prisma.run.findFirst({
    where: {
      player_id: player.id,
      status: "in_progress"
    },
    orderBy: { updated_at: "desc" },
    select: {
      id: true,
      client_run_id: true,
      status: true,
      current_floor: true,
      updated_at: true
    }
  });

  if (activeRun && activeRun.client_run_id !== validated.client_run_id) {
    throw new HttpError(409, "active_run_exists", "Active run already exists");
  }

  if (activeRun && activeRun.client_run_id === validated.client_run_id) {
    const body = {
      ok: true,
      data: {
        run: {
          run_id: activeRun.id,
          client_run_id: activeRun.client_run_id,
          status: activeRun.status,
          current_floor: activeRun.current_floor,
          updated_at: activeRun.updated_at.toISOString()
        }
      },
      meta: buildMeta(params.requestId)
    };

    return storeIdempotencyResponse({
      scope,
      playerId: player.id,
      idempotencyKey: params.idempotencyKey,
      requestHash,
      statusCode: 200,
      body
    });
  }

  const startedAt = validated.started_at_client ? new Date(validated.started_at_client) : new Date();
  const run = await prisma.run.create({
    data: {
      player_id: player.id,
      client_run_id: validated.client_run_id,
      run_seed: validated.run_seed,
      version: validated.version,
      current_floor: 1,
      start_class: validated.start_class,
      start_deck: toInputJson(validated.start_deck),
      start_relics: toInputJson(validated.start_relics),
      nodes_state: toInputJson({ items: [] }),
      floor_events: toInputJson({ items: [] }),
      started_at: Number.isNaN(startedAt.getTime()) ? new Date() : startedAt
    },
    select: {
      id: true,
      client_run_id: true,
      status: true,
      current_floor: true,
      updated_at: true
    }
  });

  const body = {
    ok: true,
    data: {
      run: {
        run_id: run.id,
        client_run_id: run.client_run_id,
        status: run.status,
        current_floor: run.current_floor,
        updated_at: run.updated_at.toISOString()
      }
    },
    meta: buildMeta(params.requestId)
  };

  return storeIdempotencyResponse({
    scope,
    playerId: player.id,
    idempotencyKey: params.idempotencyKey,
    requestHash,
    statusCode: 201,
    body
  });
}

export async function getActiveRun(auth: AuthContext) {
  await ensurePlayer(auth);

  const run = await prisma.run.findFirst({
    where: {
      player_id: auth.playerId,
      status: "in_progress"
    },
    orderBy: { updated_at: "desc" },
    select: {
      id: true,
      client_run_id: true,
      status: true,
      current_floor: true,
      updated_at: true,
      snapshots: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: {
          snapshot_type: true,
          payload: true
        }
      }
    }
  });

  if (!run) {
    return { active_run: null };
  }

  const latestSnapshot = run.snapshots[0];

  return {
    active_run: {
      run_id: run.id,
      client_run_id: run.client_run_id,
      status: run.status,
      current_floor: run.current_floor,
      snapshot_type: latestSnapshot?.snapshot_type ?? "map",
      snapshot: {
        payload: latestSnapshot?.payload ?? {}
      },
      updated_at: run.updated_at.toISOString()
    }
  };
}

export async function saveSnapshot(params: {
  auth: AuthContext;
  runId: string;
  idempotencyKey: string;
  payload: unknown;
  requestId: string;
}) {
  const method = "PATCH";
  const route = "/runs/:run_id/snapshot";
  const scope = `${method} ${route}`;
  const requestHash = buildRequestHash(method, route, params.payload);

  const replay = await getIdempotencyReplay(scope, params.auth.playerId, params.idempotencyKey, requestHash);
  if (replay) {
    return replay;
  }

  const validated = validateSnapshotPayload(params.payload);
  await ensurePlayer(params.auth);

  const run = await prisma.run.findFirst({
    where: {
      id: params.runId,
      player_id: params.auth.playerId
    },
    select: {
      id: true,
      status: true
    }
  });

  if (!run) {
    throw new HttpError(404, "run_not_found", "Run not found");
  }

  if (run.status !== "in_progress") {
    throw stateConflict(run.id, run.status);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.runSnapshot.create({
      data: {
        run_id: run.id,
        snapshot_type: validated.snapshot_type,
        payload: toInputJson(validated.payload)
      }
    });

    return tx.run.update({
      where: { id: run.id },
      data: {
        current_floor: validated.current_floor,
        nodes_state: toInputJson(validated.nodes_state)
      },
      select: {
        id: true,
        status: true,
        current_floor: true,
        updated_at: true
      }
    });
  });

  const body = {
    ok: true,
    data: {
      run: {
        run_id: updated.id,
        status: updated.status,
        current_floor: updated.current_floor,
        updated_at: updated.updated_at.toISOString()
      }
    },
    meta: buildMeta(params.requestId)
  };

  return storeIdempotencyResponse({
    scope,
    playerId: params.auth.playerId,
    idempotencyKey: params.idempotencyKey,
    requestHash,
    statusCode: 200,
    body
  });
}

export async function finishRun(params: {
  auth: AuthContext;
  runId: string;
  idempotencyKey: string;
  payload: unknown;
  requestId: string;
}) {
  const method = "POST";
  const route = "/runs/:run_id/finish";
  const scope = `${method} ${route}`;
  const requestHash = buildRequestHash(method, route, params.payload);

  const replay = await getIdempotencyReplay(scope, params.auth.playerId, params.idempotencyKey, requestHash);
  if (replay) {
    return replay;
  }

  const validated = validateFinishPayload(params.payload);
  const player = await ensurePlayer(params.auth, true);

  const run = await prisma.run.findFirst({
    where: {
      id: params.runId,
      player_id: player.id
    },
    select: {
      id: true,
      status: true
    }
  });

  if (!run) {
    throw new HttpError(404, "run_not_found", "Run not found");
  }

  if (run.status !== "in_progress") {
    throw stateConflict(run.id, run.status);
  }

  const finishResult = await prisma.$transaction(async (tx) => {
    const finishedAt = new Date();
    const netherPointsGained = calculateNetherPointsGain(validated.score, validated.current_floor);
    const nextNetherPoints = player.nether_points + netherPointsGained;
    const nextTiers = deriveTiersFromNetherPoints(nextNetherPoints);

    const updatedRun = await tx.run.update({
      where: { id: run.id },
      data: {
        status: "finished",
        result: validated.result,
        score: validated.score,
        run_time_ms: validated.run_time_ms,
        current_floor: validated.current_floor,
        end_class: validated.end_class,
        end_deck: toInputJson(validated.end_deck),
        end_relics: toInputJson(validated.end_relics),
        nodes_state: toInputJson(validated.nodes_state),
        floor_events: toInputJson(validated.floor_events),
        inputs_hash: validated.inputs_hash,
        proof_hash: validated.proof_hash,
        flags: validated.flags ? toInputJson(validated.flags) : undefined,
        finished_at: finishedAt
      },
      select: {
        id: true,
        status: true,
        result: true,
        finished_at: true
      }
    });

    await tx.leaderboard.upsert({
      where: { run_id: run.id },
      create: {
        run_id: run.id,
        player_id: player.id,
        user_id: player.user_id,
        nickname: player.nickname,
        score: validated.score,
        run_time_ms: validated.run_time_ms
      },
      update: {
        nickname: player.nickname,
        score: validated.score,
        run_time_ms: validated.run_time_ms
      }
    });

    const isNewBest = validated.score > player.best_score;
    const updatedPlayer = await tx.player.update({
      where: { id: player.id },
      data: {
        nether_points: nextNetherPoints,
        cards_tier: nextTiers.cardsTier,
        relics_tier: nextTiers.relicsTier,
        classes_tier: nextTiers.classesTier,
        ...(isNewBest
          ? {
              best_score: validated.score,
              best_run_id: run.id
            }
          : {})
      },
      select: {
        best_score: true,
        best_run_id: true,
        nether_points: true,
        cards_tier: true,
        relics_tier: true,
        classes_tier: true
      }
    });

    return {
      updatedRun,
      leaderboard: {
        best_score: updatedPlayer.best_score,
        is_new_best: isNewBest,
        best_run_id: updatedPlayer.best_run_id
      },
      progression: {
        nether_points_gained: netherPointsGained,
        nether_points: updatedPlayer.nether_points,
        cards_tier: updatedPlayer.cards_tier,
        relics_tier: updatedPlayer.relics_tier,
        classes_tier: updatedPlayer.classes_tier
      }
    };
  });

  const body = {
    ok: true,
    data: {
      run: {
        run_id: finishResult.updatedRun.id,
        status: finishResult.updatedRun.status,
        result: finishResult.updatedRun.result,
        finished_at: finishResult.updatedRun.finished_at?.toISOString() ?? null
      },
      leaderboard: finishResult.leaderboard,
      progression: finishResult.progression
    },
    meta: buildMeta(params.requestId)
  };

  return storeIdempotencyResponse({
    scope,
    playerId: params.auth.playerId,
    idempotencyKey: params.idempotencyKey,
    requestHash,
    statusCode: 200,
    body
  });
}

export async function abandonRun(params: {
  auth: AuthContext;
  runId: string;
  idempotencyKey: string;
  payload: unknown;
  requestId: string;
}) {
  const method = "POST";
  const route = "/runs/:run_id/abandon";
  const scope = `${method} ${route}`;
  const requestHash = buildRequestHash(method, route, params.payload);

  const replay = await getIdempotencyReplay(scope, params.auth.playerId, params.idempotencyKey, requestHash);
  if (replay) {
    return replay;
  }

  const validated = validateAbandonPayload(params.payload);
  await ensurePlayer(params.auth);

  const run = await prisma.run.findFirst({
    where: {
      id: params.runId,
      player_id: params.auth.playerId
    },
    select: {
      id: true,
      status: true
    }
  });

  if (!run) {
    throw new HttpError(404, "run_not_found", "Run not found");
  }

  if (run.status !== "in_progress") {
    throw stateConflict(run.id, run.status);
  }

  const updatedRun = await prisma.run.update({
    where: { id: run.id },
    data: {
      status: "abandoned",
      abandon_reason: validated.reason,
      finished_at: new Date()
    },
    select: {
      id: true,
      status: true
    }
  });

  const body = {
    ok: true,
    data: {
      run: {
        run_id: updatedRun.id,
        status: updatedRun.status
      }
    },
    meta: buildMeta(params.requestId)
  };

  return storeIdempotencyResponse({
    scope,
    playerId: params.auth.playerId,
    idempotencyKey: params.idempotencyKey,
    requestHash,
    statusCode: 200,
    body
  });
}
