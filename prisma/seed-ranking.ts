import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, PlayerClass, RunResult } from "@prisma/client";
import { Pool } from "pg";

type SeedPlayer = {
  userId: string;
  nickname: string;
  platform: string;
  platformUserId: string;
};

type SeedRun = {
  score: number;
  runSeed: bigint;
  runTimeMs: number;
  currentFloor: number;
  runResult: RunResult;
  createdAtOffsetHours: number;
  deckIds: number[];
  relicIds: number[];
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const players: SeedPlayer[] = [
  {
    userId: "SEED_JUAN",
    nickname: "Juan",
    platform: "seed",
    platformUserId: "seed_juan"
  },
  {
    userId: "SEED_PEDRO",
    nickname: "Pedro",
    platform: "seed",
    platformUserId: "seed_pedro"
  },
  {
    userId: "SEED_MARCOS",
    nickname: "Marcos",
    platform: "seed",
    platformUserId: "seed_marcos"
  }
];

const runsByUser: Record<string, SeedRun[]> = {
  SEED_JUAN: [
    {
      score: 120,
      runSeed: 910001n,
      runTimeMs: 14 * 60 * 1000,
      currentFloor: 8,
      runResult: "defeat",
      createdAtOffsetHours: 30,
      deckIds: [1, 2, 3, 11, 12, 24],
      relicIds: [1, 5],
    },
    {
      score: 210,
      runSeed: 910002n,
      runTimeMs: 24 * 60 * 1000,
      currentFloor: 13,
      runResult: "defeat",
      createdAtOffsetHours: 20,
      deckIds: [1, 2, 3, 11, 12, 13, 18, 25],
      relicIds: [1, 5, 11],
    },
    {
      score: 330,
      runSeed: 910003n,
      runTimeMs: 38 * 60 * 1000,
      currentFloor: 18,
      runResult: "victory",
      createdAtOffsetHours: 8,
      deckIds: [1, 2, 3, 11, 12, 13, 18, 25, 32, 39],
      relicIds: [1, 5, 11, 18],
    }
  ],
  SEED_PEDRO: [
    {
      score: 90,
      runSeed: 920001n,
      runTimeMs: 11 * 60 * 1000,
      currentFloor: 6,
      runResult: "defeat",
      createdAtOffsetHours: 28,
      deckIds: [4, 5, 6, 14, 15, 26],
      relicIds: [2, 7],
    },
    {
      score: 170,
      runSeed: 920002n,
      runTimeMs: 22 * 60 * 1000,
      currentFloor: 11,
      runResult: "defeat",
      createdAtOffsetHours: 18,
      deckIds: [4, 5, 6, 14, 15, 26, 31, 36],
      relicIds: [2, 7, 10],
    },
    {
      score: 260,
      runSeed: 920003n,
      runTimeMs: 34 * 60 * 1000,
      currentFloor: 16,
      runResult: "victory",
      createdAtOffsetHours: 6,
      deckIds: [4, 5, 6, 14, 15, 26, 31, 36, 41, 45],
      relicIds: [2, 7, 10, 16],
    }
  ],
  SEED_MARCOS: [
    {
      score: 110,
      runSeed: 930001n,
      runTimeMs: 13 * 60 * 1000,
      currentFloor: 7,
      runResult: "defeat",
      createdAtOffsetHours: 26,
      deckIds: [7, 8, 9, 16, 17, 28],
      relicIds: [3, 9],
    },
    {
      score: 230,
      runSeed: 930002n,
      runTimeMs: 29 * 60 * 1000,
      currentFloor: 14,
      runResult: "defeat",
      createdAtOffsetHours: 16,
      deckIds: [7, 8, 9, 16, 17, 28, 33, 38],
      relicIds: [3, 9, 12],
    },
    {
      score: 350,
      runSeed: 930003n,
      runTimeMs: 41 * 60 * 1000,
      currentFloor: 20,
      runResult: "victory",
      createdAtOffsetHours: 4,
      deckIds: [7, 8, 9, 16, 17, 28, 33, 38, 42, 46],
      relicIds: [3, 9, 12, 17],
    }
  ]
};

function buildDeckPayload(ids: number[]) {
  return ids.map((id) => ({ card_id: id }));
}

function buildRelicsPayload(ids: number[]) {
  return ids.map((id) => ({ relic_id: id }));
}

async function main() {
  const userIds = players.map((player) => player.userId);

  await prisma.$transaction(async (tx) => {
    await tx.player.updateMany({
      where: { user_id: { in: userIds } },
      data: {
        best_run_id: null,
        best_score: 0
      }
    });

    await tx.leaderboard.deleteMany({
      where: { user_id: { in: userIds } }
    });

    await tx.run.deleteMany({
      where: { user_id: { in: userIds } }
    });

    for (const playerSeed of players) {
      const player = await tx.player.upsert({
        where: { user_id: playerSeed.userId },
        create: {
          user_id: playerSeed.userId,
          nickname: playerSeed.nickname,
          platform: playerSeed.platform,
          platform_user_id: playerSeed.platformUserId,
          app_version: "seed-v1",
          first_seen: new Date(),
          last_seen: new Date()
        },
        update: {
          nickname: playerSeed.nickname,
          platform: playerSeed.platform,
          platform_user_id: playerSeed.platformUserId,
          app_version: "seed-v1",
          last_seen: new Date()
        },
        select: {
          id: true,
          user_id: true,
          nickname: true
        }
      });

      const runsToCreate = runsByUser[playerSeed.userId] ?? [];
      const createdRunIds: Array<{ id: string; score: number }> = [];

      for (const runSeed of runsToCreate) {
        const createdAt = new Date(Date.now() - runSeed.createdAtOffsetHours * 60 * 60 * 1000);

        const run = await tx.run.create({
          data: {
            player_id: player.id,
            user_id: player.user_id,
            nickname_snapshot: player.nickname,
            score: runSeed.score,
            seed: `seed-${player.user_id}-${runSeed.runSeed.toString()}`,
            run_seed: runSeed.runSeed,
            run_time_ms: runSeed.runTimeMs,
            version: "seed-v1",
            current_floor: runSeed.currentFloor,
            start_class: "no_class" satisfies PlayerClass,
            start_deck: buildDeckPayload(runSeed.deckIds.slice(0, Math.max(4, runSeed.deckIds.length - 2))),
            start_relics: buildRelicsPayload(runSeed.relicIds.slice(0, Math.max(1, runSeed.relicIds.length - 1))),
            end_class: "no_class" satisfies PlayerClass,
            end_deck: buildDeckPayload(runSeed.deckIds),
            end_relics: buildRelicsPayload(runSeed.relicIds),
            floor_events: [
              { floor: 1, event: "battle" },
              { floor: runSeed.currentFloor, event: runSeed.runResult === "victory" ? "boss_victory" : "defeat" }
            ],
            nodes_state: {
              current_floor: runSeed.currentFloor,
              visited_nodes: runSeed.currentFloor + 3
            },
            flags: {
              completed: true,
              source: "seed"
            },
            run_result: runSeed.runResult,
            created_at: createdAt
          },
          select: {
            id: true,
            score: true
          }
        });

        createdRunIds.push(run);

        await tx.leaderboard.create({
          data: {
            run_id: run.id,
            player_id: player.id,
            user_id: player.user_id,
            nickname: player.nickname,
            score: run.score,
            created_at: createdAt
          }
        });
      }

      const bestRun = createdRunIds.sort((left, right) => right.score - left.score)[0];
      const bestScore = bestRun ? bestRun.score : 0;

      await tx.player.update({
        where: { id: player.id },
        data: {
          best_score: bestScore,
          best_run_id: bestRun?.id ?? null
        }
      });
    }
  }, {
    maxWait: 15000,
    timeout: 45000
  });

  const leaderboard = await prisma.leaderboard.findMany({
    orderBy: [{ score: "desc" }, { created_at: "asc" }],
    where: {
      user_id: {
        in: players.map((player) => player.userId)
      }
    },
    select: {
      run_id: true,
      user_id: true,
      nickname: true,
      score: true
    }
  });

  console.table(leaderboard);
  console.log("Ranking seed complete: 3 players with 3 finished runs each.");
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
