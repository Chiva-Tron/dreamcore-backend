import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const seedData = {
  email: "matias@doge.com",
  password: "1234",
  userId: "MATIAS_DOGE",
  nickname: "Matias",
  version: "2026.02.22",
  runs: [
    {
      floor: 10,
      score: 180,
      runSeed: 941001n,
      runTimeMs: 18 * 60 * 1000,
      createdAtOffsetHours: 12
    },
    {
      floor: 15,
      score: 290,
      runSeed: 941002n,
      runTimeMs: 29 * 60 * 1000,
      createdAtOffsetHours: 8
    },
    {
      floor: 22,
      score: 460,
      runSeed: 941003n,
      runTimeMs: 44 * 60 * 1000,
      createdAtOffsetHours: 3
    }
  ]
};

async function main() {
  await prisma.$transaction(async (tx) => {
    const passwordHash = await bcrypt.hash(seedData.password, 10);

    const account = await tx.account.upsert({
      where: { email: seedData.email },
      create: {
        email: seedData.email,
        password_hash: passwordHash,
        email_verified: true
      },
      update: {
        password_hash: passwordHash,
        email_verified: true
      },
      select: { id: true }
    });

    const player = await tx.player.upsert({
      where: { account_id: account.id },
      create: {
        account_id: account.id,
        user_id: seedData.userId,
        nickname: seedData.nickname
      },
      update: {
        user_id: seedData.userId,
        nickname: seedData.nickname,
        best_score: 0,
        best_run_id: null
      },
      select: {
        id: true,
        user_id: true,
        nickname: true
      }
    });

    await tx.leaderboard.deleteMany({ where: { player_id: player.id } });
    await tx.run.deleteMany({ where: { player_id: player.id } });

    const createdRuns: Array<{ id: string; score: number }> = [];

    for (const runData of seedData.runs) {
      const createdAt = new Date(Date.now() - runData.createdAtOffsetHours * 60 * 60 * 1000);

      const run = await tx.run.create({
        data: {
          player_id: player.id,
          client_run_id: `seed-${player.user_id}-${runData.runSeed.toString()}`,
          status: "finished",
          run_seed: runData.runSeed,
          version: seedData.version,
          current_floor: runData.floor,
          start_class: "no_class",
          end_class: "no_class",
          start_deck: { items: [1, 2, 3] },
          start_relics: { items: [1] },
          end_deck: { items: [1, 2, 3, 4] },
          end_relics: { items: [1, 2] },
          nodes_state: { floor: runData.floor },
          floor_events: { items: [{ floor: runData.floor, event: "seed_finish" }] },
          run_time_ms: runData.runTimeMs,
          score: runData.score,
          result: "victory",
          started_at: createdAt,
          finished_at: new Date(createdAt.getTime() + runData.runTimeMs)
        },
        select: { id: true, score: true, run_time_ms: true }
      });

      createdRuns.push({ id: run.id, score: run.score });

      await tx.leaderboard.create({
        data: {
          run_id: run.id,
          player_id: player.id,
          user_id: player.user_id,
          nickname: player.nickname,
          score: run.score,
          run_time_ms: run.run_time_ms,
          created_at: createdAt
        }
      });
    }

    const bestRun = createdRuns.sort((a, b) => b.score - a.score)[0];

    await tx.player.update({
      where: { id: player.id },
      data: {
        best_score: bestRun?.score ?? 0,
        best_run_id: bestRun?.id ?? null
      }
    });
  });

  const summary = await prisma.player.findFirst({
    where: { user_id: seedData.userId },
    select: {
      user_id: true,
      nickname: true,
      best_score: true,
      runs: {
        orderBy: { current_floor: "asc" },
        select: {
          id: true,
          current_floor: true,
          score: true,
          status: true
        }
      }
    }
  });

  console.dir(summary, { depth: null });
  console.log("Seed de Matias completado.");
}

main()
  .catch((error) => {
    console.error("Seed Matias failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });