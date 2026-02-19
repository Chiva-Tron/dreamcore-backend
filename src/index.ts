import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

dotenv.config();

const app = express();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}
const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter
});

const port = Number(process.env.PORT ?? 3000);
const apiKey = process.env.API_KEY ?? "";
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 10_000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 10);
const MAX_RUN_TIME_MS = 24 * 60 * 60 * 1000;
const LEADERBOARD_MAX_ENTRIES = 1000;

if (!apiKey) {
  console.warn("API_KEY is not set");
}

app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));

const limiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const userId = typeof body.user_id === "string" ? body.user_id : "anon";
    return `${req.ip}:${userId}`;
  }
});

app.use(limiter);

app.use((req, res, next) => {
  const key = req.header("x-api-key") ?? "";
  if (!apiKey || key !== apiKey) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

type RunPayload = {
  user_id: string;
  nickname: string;
  score: number;
  seed: string;
  run_seed: number;
  run_time_ms: number;
  version: string;
  current_floor: number;
  start_class: "titan" | "arcane" | "umbralist" | "no_class";
  start_deck: unknown;
  start_relics: unknown;
  end_class: "titan" | "arcane" | "umbralist" | "no_class";
  end_deck: unknown;
  end_relics: unknown;
  floor_events: unknown;
  nodes_state: unknown;
  run_result: "victory" | "defeat";
  inputs_hash?: string;
  proof_hash?: string;
  flags?: unknown;
};

type PlayerUpsertPayload = {
  nickname: string;
  version: string;
  platform?: string;
  platform_user_id?: string;
  avatar_id?: string;
};

function isJsonValue(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

function isPlayerClass(value: unknown): value is RunPayload["start_class"] {
  return value === "titan" || value === "arcane" || value === "umbralist" || value === "no_class";
}

function normalizeRunResult(value: unknown): RunPayload["run_result"] | undefined {
  if (value === "win" || value === "victory") return "victory";
  if (value === "loss" || value === "defeat") return "defeat";
  return undefined;
}

function isValidUserId(value: string): boolean {
  return value.length > 0 && value.length <= 64;
}

function isValidNicknameCharset(value: string): boolean {
  return /^[a-zA-Z0-9_]+$/.test(value);
}

function validatePlayerUpsertPayload(payload: unknown): { ok: boolean; errors: string[]; data?: PlayerUpsertPayload } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["payload_invalid"] };
  }

  const data = payload as Record<string, unknown>;
  const nickname = typeof data.nickname === "string" ? data.nickname : "";
  const version = typeof data.version === "string" ? data.version.trim() : "";
  const platform = typeof data.platform === "string" ? data.platform.trim() : undefined;
  const platform_user_id = typeof data.platform_user_id === "string" ? data.platform_user_id.trim() : undefined;
  const avatar_id = typeof data.avatar_id === "string" ? data.avatar_id.trim() : undefined;

  if (!nickname) errors.push("nickname_required");
  if (nickname && nickname.trim() !== nickname) errors.push("nickname_trim");
  if (nickname.length < 3 || nickname.length > 16) errors.push("nickname_length");
  if (nickname && !isValidNicknameCharset(nickname)) errors.push("nickname_charset");
  if (!version) errors.push("version_required");
  if (version.length > 32) errors.push("version_length");
  if (platform && platform.length > 32) errors.push("platform_length");
  if (platform_user_id && platform_user_id.length > 128) errors.push("platform_user_id_length");
  if (avatar_id && avatar_id.length > 64) errors.push("avatar_id_length");

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    data: {
      nickname,
      version,
      platform,
      platform_user_id,
      avatar_id
    }
  };
}

function serializePlayer(player: {
  user_id: string;
  nickname: string;
  best_score: number;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    user_id: player.user_id,
    nickname: player.nickname,
    best_score: player.best_score,
    created_at: player.created_at.toISOString(),
    updated_at: player.updated_at.toISOString()
  };
}

function validateRunPayload(payload: unknown): { ok: boolean; errors: string[]; data?: RunPayload } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["payload_invalid"] };
  }

  const data = payload as Record<string, unknown>;
  const user_id = typeof data.user_id === "string" ? data.user_id.trim() : "";
  const nickname = typeof data.nickname === "string" ? data.nickname : "";
  const score = typeof data.score === "number" ? data.score : Number.NaN;
  const seed = typeof data.seed === "string" ? data.seed : "";
  const run_seed = typeof data.run_seed === "number" ? data.run_seed : Number.NaN;
  const run_time_ms = typeof data.run_time_ms === "number" ? data.run_time_ms : Number.NaN;
  const version = typeof data.version === "string" ? data.version : "";
  const current_floor = typeof data.current_floor === "number" ? data.current_floor : Number.NaN;
  const start_class = isPlayerClass(data.start_class) ? data.start_class : undefined;
  const start_deck = data.start_deck;
  const start_relics = data.start_relics;
  const end_class = isPlayerClass(data.end_class) ? data.end_class : undefined;
  const end_deck = data.end_deck;
  const end_relics = data.end_relics;
  const floor_events = data.floor_events;
  const nodes_state = data.nodes_state;
  const run_result = normalizeRunResult(data.run_result);
  const inputs_hash = typeof data.inputs_hash === "string" ? data.inputs_hash : undefined;
  const proof_hash = typeof data.proof_hash === "string" ? data.proof_hash : undefined;
  const flags = data.flags;

  if (!user_id) errors.push("user_id_required");
  if (!nickname) errors.push("nickname_required");
  if (nickname && nickname.trim() !== nickname) errors.push("nickname_trim");
  if (nickname.length < 3 || nickname.length > 16) errors.push("nickname_length");
  if (!Number.isInteger(score) || score < 0) errors.push("score_invalid");
  if (!seed) errors.push("seed_required");
  if (!Number.isInteger(run_seed) || run_seed < 0) errors.push("run_seed_invalid");
  if (!Number.isInteger(run_time_ms) || run_time_ms < 0 || run_time_ms > MAX_RUN_TIME_MS) {
    errors.push("run_time_ms_invalid");
  }
  if (!version) errors.push("version_required");
  if (!Number.isInteger(current_floor) || current_floor < 0) errors.push("current_floor_invalid");
  if (!start_class) errors.push("start_class_invalid");
  if (!isJsonValue(start_deck)) errors.push("start_deck_required");
  if (!isJsonValue(start_relics)) errors.push("start_relics_required");
  if (!end_class) errors.push("end_class_invalid");
  if (!isJsonValue(end_deck)) errors.push("end_deck_required");
  if (!isJsonValue(end_relics)) errors.push("end_relics_required");
  if (!isJsonValue(floor_events)) errors.push("floor_events_required");
  if (!isJsonValue(nodes_state)) errors.push("nodes_state_required");
  if (!run_result) errors.push("run_result_invalid");
  if (inputs_hash && inputs_hash.length > 256) errors.push("inputs_hash_length");
  if (proof_hash && proof_hash.length > 256) errors.push("proof_hash_length");
  if (isJsonValue(flags)) {
    const completed = (flags as Record<string, unknown>).completed;
    if (completed !== undefined && typeof completed !== "boolean") {
      errors.push("flags_completed_invalid");
    }
    if (completed === false) {
      errors.push("run_not_completed");
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const finalRunResult = run_result as RunPayload["run_result"];

  return {
    ok: true,
    errors: [],
    data: {
      user_id,
      nickname,
      score,
      seed,
      run_seed,
      run_time_ms,
      version,
      current_floor,
      start_class: start_class as "titan" | "arcane" | "umbralist" | "no_class",
      start_deck,
      start_relics,
      end_class: end_class as "titan" | "arcane" | "umbralist" | "no_class",
      end_deck,
      end_relics,
      floor_events,
      nodes_state,
      run_result: finalRunResult,
      inputs_hash,
      proof_hash,
      flags
    }
  };
}

app.post("/submit-run", async (req, res) => {
  const validation = validateRunPayload(req.body);
  if (!validation.ok || !validation.data) {
    return res.status(400).json({ error: "validation_failed", details: validation.errors });
  }

  const payload = validation.data;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const runSeedBigInt = BigInt(payload.run_seed);

      const player = await tx.player.upsert({
        where: { user_id: payload.user_id },
        create: {
          user_id: payload.user_id,
          nickname: payload.nickname,
          first_seen: new Date(),
          last_seen: new Date()
        },
        update: {
          nickname: payload.nickname,
          last_seen: new Date()
        }
      });

      const existingRun = await tx.run.findFirst({
        where: {
          user_id: payload.user_id,
          run_seed: runSeedBigInt,
          run_result: payload.run_result
        },
        select: {
          id: true
        }
      });

      if (existingRun) {
        return {
          runId: existingRun.id,
          bestScore: player.best_score
        };
      }

      const run = await tx.run.create({
        data: {
          player_id: player.id,
          user_id: payload.user_id,
          nickname_snapshot: payload.nickname,
          score: payload.score,
          seed: payload.seed,
          run_seed: runSeedBigInt,
          run_time_ms: payload.run_time_ms,
          version: payload.version,
          current_floor: payload.current_floor,
          start_class: payload.start_class,
          start_deck: payload.start_deck as any,
          start_relics: payload.start_relics as any,
          end_class: payload.end_class,
          end_deck: payload.end_deck as any,
          end_relics: payload.end_relics as any,
          floor_events: payload.floor_events as any,
          nodes_state: payload.nodes_state as any,
          run_result: payload.run_result,
          inputs_hash: payload.inputs_hash,
          proof_hash: payload.proof_hash,
          flags: payload.flags as any
        }
      });

      await tx.leaderboard.create({
        data: {
          run_id: run.id,
          player_id: player.id,
          user_id: payload.user_id,
          nickname: payload.nickname,
          score: payload.score
        }
      });

      const overflowRows = await tx.leaderboard.findMany({
        orderBy: [{ score: "desc" }, { created_at: "asc" }],
        skip: LEADERBOARD_MAX_ENTRIES,
        select: { id: true }
      });

      if (overflowRows.length > 0) {
        await tx.leaderboard.deleteMany({
          where: {
            id: { in: overflowRows.map((row) => row.id) }
          }
        });
      }

      const bestScore = Math.max(player.best_score, payload.score);

      if (payload.score > player.best_score) {
        await tx.player.update({
          where: { id: player.id },
          data: {
            best_score: payload.score,
            best_run_id: run.id
          }
        });
      }

      return { runId: run.id, bestScore };
    });

    return res.status(201).json({
      run_id: result.runId,
      best_score: result.bestScore
    });
  } catch (error) {
    console.error("submit-run failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
});

async function getCardsPayload() {
  return prisma.card.findMany({
    orderBy: { id: "asc" }
  });
}

async function getRelicsPayload() {
  return prisma.relic.findMany({
    orderBy: { id: "asc" }
  });
}

async function getEventsPayload() {
  return prisma.event.findMany({
    orderBy: { id: "asc" }
  });
}

async function handleCardsContent(_req: express.Request, res: express.Response) {
  try {
    const cards = await getCardsPayload();
    return res.json(cards);
  } catch (error) {
    console.error("get cards content failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
}

async function handleRelicsContent(_req: express.Request, res: express.Response) {
  try {
    const relics = await getRelicsPayload();
    return res.json(relics);
  } catch (error) {
    console.error("get relics content failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
}

async function handleEventsContent(_req: express.Request, res: express.Response) {
  try {
    const events = await getEventsPayload();
    return res.json(events);
  } catch (error) {
    console.error("get events content failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
}

app.get("/content/cards", handleCardsContent);
app.get("/cards", handleCardsContent);

app.get("/content/relics", handleRelicsContent);
app.get("/relics", handleRelicsContent);

app.get("/content/events", handleEventsContent);
app.get("/events", handleEventsContent);
app.get("/content/run-events", handleEventsContent);
app.get("/content/run_events", handleEventsContent);
app.get("/run-events", handleEventsContent);
app.get("/run_events", handleEventsContent);

app.get("/player/:user_id", async (req, res) => {
  const userId = typeof req.params.user_id === "string" ? req.params.user_id.trim() : "";
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "validation_failed", details: ["user_id_invalid"] });
  }

  try {
    const player = await prisma.player.findUnique({
      where: { user_id: userId },
      select: {
        user_id: true,
        nickname: true,
        best_score: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!player) {
      return res.status(404).json({ error: "player_not_found" });
    }

    return res.json({ player: serializePlayer(player) });
  } catch (error) {
    console.error("get player failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
});

app.put("/player/:user_id", async (req, res) => {
  const userId = typeof req.params.user_id === "string" ? req.params.user_id.trim() : "";
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "validation_failed", details: ["user_id_invalid"] });
  }

  const validation = validatePlayerUpsertPayload(req.body);
  if (!validation.ok || !validation.data) {
    return res.status(400).json({ error: "validation_failed", details: validation.errors });
  }

  const payload = validation.data;

  try {
    const existingPlayer = await prisma.player.findUnique({
      where: { user_id: userId },
      select: { id: true }
    });

    const created = !existingPlayer;

    const player = await prisma.player.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        nickname: payload.nickname,
        app_version: payload.version,
        platform: payload.platform,
        platform_user_id: payload.platform_user_id,
        avatar_id: payload.avatar_id,
        first_seen: new Date(),
        last_seen: new Date()
      },
      update: {
        nickname: payload.nickname,
        app_version: payload.version,
        platform: payload.platform,
        platform_user_id: payload.platform_user_id,
        avatar_id: payload.avatar_id,
        last_seen: new Date()
      },
      select: {
        user_id: true,
        nickname: true,
        best_score: true,
        created_at: true,
        updated_at: true
      }
    });

    const statusCode = created ? 201 : 200;
    return res.status(statusCode).json({ player: serializePlayer(player), created });
  } catch (error) {
    console.error("upsert player failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
});

async function buildLatestDeckResponse(userId: string) {
  const player = await prisma.player.findUnique({
    where: { user_id: userId },
    select: {
      nickname: true,
      best_run_id: true
    }
  });

  if (!player) {
    return null;
  }

  const pickArray = (value: unknown, keys: string[]) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of keys) {
        const nested = record[key];
        if (Array.isArray(nested)) {
          return nested;
        }
      }
    }
    return [] as unknown[];
  };

  const candidates: Array<{
    id: string;
    end_deck: unknown;
    end_relics: unknown;
    created_at: Date;
  }> = [];

  const bestRunId = player.best_run_id;
  if (bestRunId) {
    const bestRun = await prisma.run.findUnique({
      where: { id: bestRunId },
      select: {
        id: true,
        end_deck: true,
        end_relics: true,
        created_at: true
      }
    });
    if (bestRun) {
      candidates.push(bestRun);
    }
  }

  const recentRuns = await prisma.run.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    take: 15,
    select: {
      id: true,
      end_deck: true,
      end_relics: true,
      created_at: true
    }
  });

  for (const run of recentRuns) {
    if (!candidates.some((candidate) => candidate.id === run.id)) {
      candidates.push(run);
    }
  }

  const chosenRun = candidates.find((run) => {
    const deck = pickArray(run.end_deck, ["deck", "cards", "list"]);
    const relics = pickArray(run.end_relics, ["relics", "items", "list"]);
    return deck.length > 0 || relics.length > 0;
  });

  if (!chosenRun) {
    return null;
  }

  const deck = pickArray(chosenRun.end_deck, ["deck", "cards", "list"]);
  const relics = pickArray(chosenRun.end_relics, ["relics", "items", "list"]);

  return {
    user_id: userId,
    nickname: player.nickname,
    deck,
    relics,
    source_run_id: chosenRun.id,
    updated_at: chosenRun.created_at.toISOString()
  };
}

async function buildEmptyDeckResponseIfPlayerExists(userId: string) {
  const player = await prisma.player.findUnique({
    where: { user_id: userId },
    select: {
      nickname: true,
      updated_at: true
    }
  });

  if (!player) {
    return null;
  }

  return {
    user_id: userId,
    nickname: player.nickname,
    deck: [],
    relics: [],
    source_run_id: null,
    updated_at: player.updated_at.toISOString()
  };
}

app.get("/player/:user_id/deck", async (req, res) => {
  const userId = typeof req.params.user_id === "string" ? req.params.user_id.trim() : "";
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "validation_failed", details: ["user_id_invalid"] });
  }

  try {
    const result = await buildLatestDeckResponse(userId);
    if (!result) {
      const emptyResult = await buildEmptyDeckResponseIfPlayerExists(userId);
      if (emptyResult) {
        return res.json(emptyResult);
      }
      return res.status(404).json({ error: "not_found" });
    }

    return res.json(result);
  } catch (error) {
    console.error("get player deck failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
});

app.get("/players/:user_id/deck", async (req, res) => {
  const userId = typeof req.params.user_id === "string" ? req.params.user_id.trim() : "";
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "validation_failed", details: ["user_id_invalid"] });
  }

  try {
    const result = await buildLatestDeckResponse(userId);
    if (!result) {
      const emptyResult = await buildEmptyDeckResponseIfPlayerExists(userId);
      if (emptyResult) {
        return res.json(emptyResult);
      }
      return res.status(404).json({ error: "not_found" });
    }

    return res.json(result);
  } catch (error) {
    console.error("get players deck failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
});

app.get("/runs/latest", async (req, res) => {
  const userId = typeof req.query.user_id === "string" ? req.query.user_id.trim() : "";
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "validation_failed", details: ["user_id_invalid"] });
  }

  try {
    const result = await buildLatestDeckResponse(userId);
    if (!result) {
      const emptyResult = await buildEmptyDeckResponseIfPlayerExists(userId);
      if (emptyResult) {
        return res.json(emptyResult);
      }
      return res.status(404).json({ error: "not_found" });
    }

    return res.json(result);
  } catch (error) {
    console.error("get runs latest failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
});

app.get("/run/latest", async (req, res) => {
  const userId = typeof req.query.user_id === "string" ? req.query.user_id.trim() : "";
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "validation_failed", details: ["user_id_invalid"] });
  }

  try {
    const result = await buildLatestDeckResponse(userId);
    if (!result) {
      const emptyResult = await buildEmptyDeckResponseIfPlayerExists(userId);
      if (emptyResult) {
        return res.json(emptyResult);
      }
      return res.status(404).json({ error: "not_found" });
    }

    return res.json(result);
  } catch (error) {
    console.error("get run latest failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
});

app.get("/player-runs/latest", async (req, res) => {
  const userId = typeof req.query.user_id === "string" ? req.query.user_id.trim() : "";
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "validation_failed", details: ["user_id_invalid"] });
  }

  try {
    const result = await buildLatestDeckResponse(userId);
    if (!result) {
      const emptyResult = await buildEmptyDeckResponseIfPlayerExists(userId);
      if (emptyResult) {
        return res.json(emptyResult);
      }
      return res.status(404).json({ error: "not_found" });
    }

    return res.json(result);
  } catch (error) {
    console.error("get player runs latest failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
});

app.get("/leaderboard", async (req, res) => {
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 50;

  try {
    const rows = await prisma.leaderboard.findMany({
      orderBy: [{ score: "desc" }, { created_at: "asc" }],
      take: limit,
      include: {
        run: {
          select: {
            end_deck: true,
            end_relics: true,
            current_floor: true,
            run_result: true,
            created_at: true
          }
        }
      }
    });

    const items = rows.map((row: (typeof rows)[number], index: number) => ({
      rank: index + 1,
      run_id: row.run_id,
      user_id: row.user_id,
      nickname: row.nickname,
      score: row.score,
      run_result: row.run?.run_result ?? null,
      current_floor: row.run?.current_floor ?? null,
      created_at: row.run ? row.run.created_at.toISOString() : null,
      end_deck: row.run?.end_deck ?? null,
      end_relics: row.run?.end_relics ?? null
    }));

    return res.json({ items });
  } catch (error) {
    console.error("leaderboard failed", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
      return res.status(503).json({
        error: "schema_outdated",
        details: ["run_prisma_migrate_deploy"]
      });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

app.listen(port, () => {
  console.log(`Dreamcore backend listening on ${port}`);
});

app.use((req, res) => {
  return res.status(404).json({ error: "not_found" });
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
});
