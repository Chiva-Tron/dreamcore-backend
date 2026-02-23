import { Prisma } from "@prisma/client";
import { HttpError } from "../../lib/http-error";
import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../lib/auth-context";

type TelemetryInputEvent = {
  event_id: string;
  event_name: string;
  event_ts: string;
  run_id?: string;
  payload?: Record<string, unknown>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function validateEvents(payload: unknown): TelemetryInputEvent[] {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "validation_failed", "Payload inválido");
  }

  const events = (payload as Record<string, unknown>).events;
  if (!Array.isArray(events) || events.length === 0 || events.length > 100) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [
      { field: "events", message: "size_1_100" }
    ]);
  }

  const normalized: TelemetryInputEvent[] = [];

  for (const event of events) {
    if (!event || typeof event !== "object") {
      continue;
    }

    const record = event as Record<string, unknown>;
    const eventId = typeof record.event_id === "string" ? record.event_id.trim() : "";
    const eventName = typeof record.event_name === "string" ? record.event_name.trim() : "";
    const eventTs = typeof record.event_ts === "string" ? record.event_ts.trim() : "";
    const runId = typeof record.run_id === "string" && record.run_id.trim() ? record.run_id.trim() : undefined;
    const eventPayload = record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : undefined;

    if (!UUID_REGEX.test(eventId) || !eventName || eventName.length > 64 || !eventTs) {
      continue;
    }

    const parsedDate = new Date(eventTs);
    if (Number.isNaN(parsedDate.getTime())) {
      continue;
    }

    normalized.push({
      event_id: eventId,
      event_name: eventName,
      event_ts: parsedDate.toISOString(),
      run_id: runId,
      payload: eventPayload
    });
  }

  if (normalized.length === 0) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [
      { field: "events", message: "all_invalid" }
    ]);
  }

  return normalized;
}

async function ensureAuthorized(auth: AuthContext) {
  const player = await prisma.player.findUnique({
    where: { id: auth.playerId },
    select: { user_id: true }
  });

  if (!player || player.user_id !== auth.userId) {
    throw new HttpError(401, "unauthorized", "Unauthorized");
  }
}

export async function ingestTelemetryBatch(params: {
  auth: AuthContext;
  payload: unknown;
}) {
  await ensureAuthorized(params.auth);

  const events = validateEvents(params.payload);
  const seen = new Set<string>();
  let accepted = 0;
  let rejected = 0;

  for (const event of events) {
    if (seen.has(event.event_id)) {
      rejected += 1;
      continue;
    }

    seen.add(event.event_id);

    try {
      await prisma.telemetryEvent.create({
        data: {
          event_id: event.event_id,
          event_name: event.event_name,
          event_ts: new Date(event.event_ts),
          player_id: params.auth.playerId,
          run_id: event.run_id,
          event_payload: event.payload ? toJson(event.payload) : undefined,
          source: "client",
          trust_level: "medium"
        }
      });
      accepted += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        rejected += 1;
        continue;
      }

      throw error;
    }
  }

  return { accepted, rejected };
}
