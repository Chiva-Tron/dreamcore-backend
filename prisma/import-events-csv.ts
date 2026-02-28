import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { EventClass, PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { Pool } from "pg";

type CsvRow = {
  [key: string]: string | undefined;
  id?: string;
  event_class?: string;
  name_es?: string;
  name_en?: string;
  deck?: string;
  image?: string;
  scene?: string;
  health?: string;
  equipped_relics?: string;
  reward_multiplier?: string;
  relic_reward?: string;
  starting_gold_coins?: string;
  starting_cards_in_hand?: string;
  cards_per_turn?: string;
  discards_per_turn?: string;
  special_conditions?: string;
};

const equippedRelicsHeaderAliases = [
  "equipped_relics",
  "equippedRelics",
  "equipped relics",
  "equipped-relics"
] as const;

const allowedEventClass = new Set<EventClass>([
  "enemy",
  "boss",
  "rest",
  "shop",
  "sacrifice",
  "upgrade",
  "beginning",
  "initial_picks",
  "exit",
  "mystery"
]);

function toOptionalText(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "0") {
    return null;
  }

  return trimmed;
}

function toIntOrDefault(value: string | undefined, fallback = 0): number {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function toOptionalInt(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
}

function toDeckJson(value: string | undefined): unknown {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "0") {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toEventClass(value: string | undefined): EventClass | null {
  const normalized = (value ?? "").trim().toLowerCase() as EventClass;
  return allowedEventClass.has(normalized) ? normalized : null;
}

function getFirstDefinedValue(row: CsvRow, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

async function resolveContentVersionId(prisma: PrismaClient): Promise<string> {
  const active = await prisma.contentVersion.findFirst({
    where: { is_active: true },
    orderBy: { created_at: "desc" },
    select: { id: true }
  });

  if (active) {
    return active.id;
  }

  const fallbackVersion = "2026.02.23-events-import";
  const created = await prisma.contentVersion.upsert({
    where: { version: fallbackVersion },
    create: {
      version: fallbackVersion,
      checksum_sha256: "events-import-placeholder-checksum",
      is_active: true
    },
    update: {
      is_active: true
    },
    select: { id: true }
  });

  return created.id;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: tsx prisma/import-events-csv.ts <path-to-events.csv>");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const csvText = await readFile(resolve(inputPath), "utf8");
    const rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as CsvRow[];

    const firstRow = rows[0] ?? {};
    const hasEquippedRelicsColumn = equippedRelicsHeaderAliases.some(
      (header) => firstRow[header] !== undefined
    );

    if (!hasEquippedRelicsColumn) {
      console.warn(
        `Events CSV missing equipped_relics column. Supported headers: ${equippedRelicsHeaderAliases.join(", ")}. Defaulting equipped_relics to 0.`
      );
    }

    const contentVersionId = await resolveContentVersionId(prisma);

    let upserted = 0;
    let skipped = 0;

    for (const row of rows) {
      const id = toIntOrDefault(row.id, -1);
      const eventClass = toEventClass(row.event_class);

      if (id <= 0 || !eventClass) {
        skipped += 1;
        continue;
      }

      const nameEs = (row.name_es ?? "").trim() || `event_${id}`;
      const nameEn = (row.name_en ?? "").trim() || nameEs;
      const equippedRelicsValue = getFirstDefinedValue(row, equippedRelicsHeaderAliases);

      await prisma.event.upsert({
        where: { id },
        create: {
          id,
          event_class: eventClass,
          name_es: nameEs,
          name_en: nameEn,
          deck: toDeckJson(row.deck),
          image: toOptionalText(row.image),
          scene: toOptionalText(row.scene),
          health: toIntOrDefault(row.health, 0),
          equipped_relics: toIntOrDefault(equippedRelicsValue, 0),
          reward_multiplier: toIntOrDefault(row.reward_multiplier, 0),
          relic_reward: toOptionalInt(row.relic_reward),
          starting_gold_coins: toIntOrDefault(row.starting_gold_coins, 0),
          starting_cards_in_hand: toIntOrDefault(row.starting_cards_in_hand, 0),
          cards_per_turn: toIntOrDefault(row.cards_per_turn, 0),
          discards_per_turn: toIntOrDefault(row.discards_per_turn, 0),
          special_conditions: toOptionalText(row.special_conditions),
          content_version_id: contentVersionId
        },
        update: {
          event_class: eventClass,
          name_es: nameEs,
          name_en: nameEn,
          deck: toDeckJson(row.deck),
          image: toOptionalText(row.image),
          scene: toOptionalText(row.scene),
          health: toIntOrDefault(row.health, 0),
          equipped_relics: toIntOrDefault(equippedRelicsValue, 0),
          reward_multiplier: toIntOrDefault(row.reward_multiplier, 0),
          relic_reward: toOptionalInt(row.relic_reward),
          starting_gold_coins: toIntOrDefault(row.starting_gold_coins, 0),
          starting_cards_in_hand: toIntOrDefault(row.starting_cards_in_hand, 0),
          cards_per_turn: toIntOrDefault(row.cards_per_turn, 0),
          discards_per_turn: toIntOrDefault(row.discards_per_turn, 0),
          special_conditions: toOptionalText(row.special_conditions),
          content_version_id: contentVersionId
        }
      });

      upserted += 1;
    }

    console.log(`Events import completed. Upserted: ${upserted}. Skipped: ${skipped}.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Import events failed", error);
  process.exitCode = 1;
});