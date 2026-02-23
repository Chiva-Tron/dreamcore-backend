import { HttpError } from "../../lib/http-error";

type StartRunInput = {
  client_run_id: string;
  run_seed: bigint;
  version: string;
  start_class: "titan" | "arcane" | "umbralist" | "no_class";
  start_deck: Record<string, unknown>;
  start_relics: Record<string, unknown>;
  started_at_client?: string;
};

type SnapshotInput = {
  snapshot_type: "map" | "combat_strategy";
  current_floor: number;
  nodes_state: Record<string, unknown>;
  payload: Record<string, unknown>;
};

type FinishInput = {
  result: "victory" | "loss";
  score: number;
  run_time_ms: number;
  current_floor: number;
  end_class: "titan" | "arcane" | "umbralist" | "no_class";
  end_deck: Record<string, unknown>;
  end_relics: Record<string, unknown>;
  nodes_state: Record<string, unknown>;
  floor_events: Record<string, unknown>;
  inputs_hash?: string;
  proof_hash?: string;
  flags?: Record<string, unknown>;
};

type AbandonInput = {
  reason: "new_run_started" | "crash_recovery" | "server_invalidation" | "manual_quit";
};

const PLAYER_CLASSES = new Set(["titan", "arcane", "umbralist", "no_class"]);
const SNAPSHOT_TYPES = new Set(["map", "combat_strategy"]);
const ABANDON_REASONS = new Set(["new_run_started", "crash_recovery", "server_invalidation", "manual_quit"]);

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field, message: "object_required" }]);
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string, min = 1, max = 256): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field, message: `length_${min}_${max}` }]);
  }

  return text;
}

function asInt(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field, message: `range_${min}_${max}` }]);
  }

  return Number(value);
}

export function validateStartRunPayload(payload: unknown): StartRunInput {
  const data = asObject(payload, "payload");

  const clientRunId = asString(data.client_run_id, "client_run_id", 1, 64);
  const runSeedNumber = asInt(data.run_seed, "run_seed", 0, Number.MAX_SAFE_INTEGER);
  const version = asString(data.version, "version", 1, 32);
  const startClass = asString(data.start_class, "start_class", 1, 32);

  if (!PLAYER_CLASSES.has(startClass)) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "start_class", message: "invalid_value" }]);
  }

  const startDeck = asObject(data.start_deck, "start_deck");
  const startRelics = asObject(data.start_relics, "start_relics");
  const startedAtClient = typeof data.started_at_client === "string" ? data.started_at_client : undefined;

  return {
    client_run_id: clientRunId,
    run_seed: BigInt(runSeedNumber),
    version,
    start_class: startClass as StartRunInput["start_class"],
    start_deck: startDeck,
    start_relics: startRelics,
    started_at_client: startedAtClient
  };
}

export function validateSnapshotPayload(payload: unknown): SnapshotInput {
  const data = asObject(payload, "payload");

  const snapshotType = asString(data.snapshot_type, "snapshot_type", 1, 32);
  if (!SNAPSHOT_TYPES.has(snapshotType)) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "snapshot_type", message: "invalid_value" }]);
  }

  return {
    snapshot_type: snapshotType as SnapshotInput["snapshot_type"],
    current_floor: asInt(data.current_floor, "current_floor", 1, 1000),
    nodes_state: asObject(data.nodes_state, "nodes_state"),
    payload: asObject(data.payload, "payload")
  };
}

export function validateFinishPayload(payload: unknown): FinishInput {
  const data = asObject(payload, "payload");

  const result = asString(data.result, "result", 1, 16);
  if (result !== "victory" && result !== "loss") {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "result", message: "invalid_value" }]);
  }

  const endClass = asString(data.end_class, "end_class", 1, 32);
  if (!PLAYER_CLASSES.has(endClass)) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "end_class", message: "invalid_value" }]);
  }

  const inputsHash = typeof data.inputs_hash === "string" ? data.inputs_hash : undefined;
  const proofHash = typeof data.proof_hash === "string" ? data.proof_hash : undefined;

  if (inputsHash && inputsHash.length > 256) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "inputs_hash", message: "max_256" }]);
  }

  if (proofHash && proofHash.length > 256) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "proof_hash", message: "max_256" }]);
  }

  return {
    result,
    score: asInt(data.score, "score", 0, 10_000_000),
    run_time_ms: asInt(data.run_time_ms, "run_time_ms", 0, 86_400_000),
    current_floor: asInt(data.current_floor, "current_floor", 1, 1000),
    end_class: endClass as FinishInput["end_class"],
    end_deck: asObject(data.end_deck, "end_deck"),
    end_relics: asObject(data.end_relics, "end_relics"),
    nodes_state: asObject(data.nodes_state, "nodes_state"),
    floor_events: asObject(data.floor_events, "floor_events"),
    inputs_hash: inputsHash,
    proof_hash: proofHash,
    flags: data.flags && typeof data.flags === "object" && !Array.isArray(data.flags)
      ? (data.flags as Record<string, unknown>)
      : undefined
  };
}

export function validateAbandonPayload(payload: unknown): AbandonInput {
  const data = asObject(payload, "payload");
  const reason = asString(data.reason, "reason", 1, 64);

  if (!ABANDON_REASONS.has(reason)) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [{ field: "reason", message: "invalid_value" }]);
  }

  return {
    reason: reason as AbandonInput["reason"]
  };
}
