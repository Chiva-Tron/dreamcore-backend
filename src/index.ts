import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import { PrismaClient, Prisma } from "@prisma/client";

dotenv.config();

const app = express();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.warn("DATABASE_URL is not set");
}
const prisma = new PrismaClient();

const port = Number(process.env.PORT ?? 3000);
const apiKey = process.env.API_KEY ?? "";
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 10_000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 10);
const MAX_RUN_TIME_MS = 24 * 60 * 60 * 1000;

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
  inputs_hash?: string;
  proof_hash?: string;
  flags?: unknown;
};

function isJsonValue(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

function isPlayerClass(value: unknown): value is RunPayload["start_class"] {
  return value === "titan" || value === "arcane" || value === "umbralist" || value === "no_class";
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
  if (inputs_hash && inputs_hash.length > 256) errors.push("inputs_hash_length");
  if (proof_hash && proof_hash.length > 256) errors.push("proof_hash_length");

  if (errors.length > 0) return { ok: false, errors };

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

      const run = await tx.run.create({
        data: {
          player_id: player.id,
          user_id: payload.user_id,
          nickname_snapshot: payload.nickname,
          score: payload.score,
          seed: payload.seed,
          run_seed: BigInt(payload.run_seed),
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
          inputs_hash: payload.inputs_hash,
          proof_hash: payload.proof_hash,
          flags: payload.flags as any
        }
      });

      const leaderboard = await tx.leaderboard.findUnique({
        where: { player_id: player.id }
      });

      let bestScore = payload.score;

      if (!leaderboard) {
        await tx.leaderboard.create({
          data: {
            user_id: payload.user_id,
            player_id: player.id,
            nickname: payload.nickname,
            best_score: payload.score,
            best_run_id: run.id
          }
        });

        await tx.player.update({
          where: { id: player.id },
          data: {
            best_score: payload.score,
            best_run_id: run.id
          }
        });
      } else if (payload.score > leaderboard.best_score) {
        await tx.leaderboard.update({
          where: { player_id: player.id },
          data: {
            nickname: payload.nickname,
            best_score: payload.score,
            best_run_id: run.id
          }
        });

        await tx.player.update({
          where: { id: player.id },
          data: {
            best_score: payload.score,
            best_run_id: run.id
          }
        });
      } else {
        bestScore = leaderboard.best_score;
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

app.get("/leaderboard", async (req, res) => {
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  try {
    const rows = await prisma.leaderboard.findMany({
      orderBy: [{ best_score: "desc" }, { updated_at: "asc" }],
      take: limit
    });

    const items = rows.map((row: (typeof rows)[number], index: number) => ({
      rank: index + 1,
      user_id: row.user_id,
      nickname: row.nickname,
      best_score: row.best_score
    }));

    return res.json({ items });
  } catch (error) {
    console.error("leaderboard failed", error);
    return res.status(500).json({ error: "internal_error" });
  }
});

app.listen(port, () => {
  console.log(`Dreamcore backend listening on ${port}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
