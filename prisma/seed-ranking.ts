import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

type SeedPlayer = {
  email: string;
  userId: string;
  nickname: string;
};

type SeedRun = {
  score: number;
  runSeed: bigint;
  runTimeMs: number;
  currentFloor: number;
  createdAtOffsetHours: number;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const players: SeedPlayer[] = [
  { email: "juan.seed@dreamcore.local", userId: "SEED_JUAN", nickname: "Juan" },
  { email: "pedro.seed@dreamcore.local", userId: "SEED_PEDRO", nickname: "Pedro" },
  { email: "marcos.seed@dreamcore.local", userId: "SEED_MARCOS", nickname: "Marcos" }
];

const runsByUser: Record<string, SeedRun[]> = {
  SEED_JUAN: [
    { score: 120, runSeed: 910001n, runTimeMs: 14 * 60 * 1000, currentFloor: 8, createdAtOffsetHours: 30 },
    { score: 210, runSeed: 910002n, runTimeMs: 24 * 60 * 1000, currentFloor: 13, createdAtOffsetHours: 20 },
    { score: 330, runSeed: 910003n, runTimeMs: 38 * 60 * 1000, currentFloor: 18, createdAtOffsetHours: 8 }
  ],
  SEED_PEDRO: [
    { score: 90, runSeed: 920001n, runTimeMs: 11 * 60 * 1000, currentFloor: 6, createdAtOffsetHours: 28 },
    { score: 170, runSeed: 920002n, runTimeMs: 22 * 60 * 1000, currentFloor: 11, createdAtOffsetHours: 18 },
    { score: 260, runSeed: 920003n, runTimeMs: 34 * 60 * 1000, currentFloor: 16, createdAtOffsetHours: 6 }
  ],
  SEED_MARCOS: [
    { score: 110, runSeed: 930001n, runTimeMs: 13 * 60 * 1000, currentFloor: 7, createdAtOffsetHours: 26 },
    { score: 230, runSeed: 930002n, runTimeMs: 29 * 60 * 1000, currentFloor: 14, createdAtOffsetHours: 16 },
    { score: 350, runSeed: 930003n, runTimeMs: 41 * 60 * 1000, currentFloor: 20, createdAtOffsetHours: 4 }
  ]
};

async function main() {
  await prisma.$transaction(async (tx) => {
    for (const playerSeed of players) {
      const account = await tx.account.upsert({
        where: { email: playerSeed.email },
        create: {
          email: playerSeed.email,
          password_hash: "seed_hash_not_for_login"
        },
        update: {},
        select: { id: true }
      });

      const player = await tx.player.upsert({
        where: { user_id: playerSeed.userId },
        create: {
          account_id: account.id,
          user_id: playerSeed.userId,
          nickname: playerSeed.nickname
        },
        update: {
          nickname: playerSeed.nickname,
          account_id: account.id,
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

      for (const runSeed of runsByUser[playerSeed.userId] ?? []) {
        const createdAt = new Date(Date.now() - runSeed.createdAtOffsetHours * 60 * 60 * 1000);

        const run = await tx.run.create({
          data: {
            player_id: player.id,
            client_run_id: `seed-${player.user_id}-${runSeed.runSeed.toString()}`,
            status: "finished",
            run_seed: runSeed.runSeed,
            version: "seed-v1",
            current_floor: runSeed.currentFloor,
            start_class: "no_class",
            start_deck: { items: [1, 2, 3] },
            start_relics: { items: [1] },
            end_class: "no_class",
            end_deck: { items: [1, 2, 3, 4] },
            end_relics: { items: [1, 2] },
            nodes_state: { floor: runSeed.currentFloor },
            floor_events: { items: [{ floor: runSeed.currentFloor, event: "seed_finish" }] },
            run_time_ms: runSeed.runTimeMs,
            score: runSeed.score,
            result: "victory",
            started_at: createdAt,
            finished_at: new Date(createdAt.getTime() + runSeed.runTimeMs)
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
    }
  });

  const leaderboard = await prisma.leaderboard.findMany({
    orderBy: [{ score: "desc" }, { run_time_ms: "asc" }, { created_at: "asc" }],
    select: {
      run_id: true,
      user_id: true,
      nickname: true,
      score: true,
      run_time_ms: true
    }
  });

  console.table(leaderboard);
  console.log("Ranking seed canónico completado.");
}

main()
  .catch((error) => {
    console.error("Ranking seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
