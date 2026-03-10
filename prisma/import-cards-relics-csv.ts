import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { Pool } from "pg";

type HexCsvRow = {
  id?: string;
  card_class?: string;
  rarity?: string;
  name_es?: string;
  name_en?: string;
  image?: string;
  gold_coins?: string;
  red_coins?: string;
  life_cost?: string;
  displayed_text_es?: string;
  displayed_text_en?: string;
  target?: string;
  effect1?: string;
  effect2?: string;
  effect3?: string;
  condition1?: string;
  condition2?: string;
  condition3?: string;
  value1?: string;
  value2?: string;
  value3?: string;
  turn_duration1?: string;
  turn_duration2?: string;
  turn_duration3?: string;
  chance1?: string;
  chance2?: string;
  chance3?: string;
  ethereal?: string;
  content_version_id?: string;
};

type InvocationCsvRow = {
  id?: string;
  rarity?: string;
  tier?: string;
  name_es?: string;
  name_en?: string;
  image?: string;
  gold_coins?: string;
  red_coins?: string;
  life_cost?: string;
  attack?: string;
  speed?: string;
  health?: string;
  skill1?: string;
  skill2?: string;
  skill3?: string;
  skill_value1?: string;
  skill_value2?: string;
  skill_value3?: string;
  lore?: string;
  content_version_id?: string;
};

type RelicCsvRow = {
  id?: string;
  tier?: string;
  name_es?: string;
  name_en?: string;
  description?: string;
  effect1?: string;
  value1?: string;
  effect2?: string;
  value2?: string;
  effect3?: string;
  value3?: string;
  image?: string;
  rarity?: string;
  special_conditions?: string;
};

function toText(value: string | undefined): string {
  return (value ?? "").trim();
}

function toNullableText(value: string | undefined): string | null {
  const trimmed = toText(value);
  return trimmed ? trimmed : null;
}

function toInt(value: string | undefined, fallback: number): number {
  const trimmed = toText(value);
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function toNullableInt(value: string | undefined): number | null {
  const trimmed = toText(value);
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
}

function toBoolean(value: string | undefined): boolean {
  const normalized = toText(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isSkippableHexRow(row: HexCsvRow): boolean {
  const id = toInt(row.id, -1);
  const hasMeaningfulContent =
    !!toText(row.card_class) ||
    !!toText(row.name_es) ||
    !!toText(row.name_en) ||
    !!toText(row.displayed_text_es) ||
    !!toText(row.effect1);

  return id <= 0 || !hasMeaningfulContent;
}

function isSkippableInvocationRow(row: InvocationCsvRow): boolean {
  const id = toInt(row.id, -1);
  const hasMeaningfulContent =
    !!toText(row.name_es) ||
    !!toText(row.name_en) ||
    toNullableInt(row.attack) !== null ||
    toNullableInt(row.speed) !== null ||
    toNullableInt(row.health) !== null ||
    !!toText(row.skill1);

  return id <= 0 || !hasMeaningfulContent;
}

function isSkippableRelicRow(row: RelicCsvRow): boolean {
  const id = toInt(row.id, -1);
  const hasMeaningfulContent =
    !!toText(row.name_es) || !!toText(row.name_en) || !!toText(row.description) || !!toText(row.effect1);

  return id <= 0 || !hasMeaningfulContent;
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

  const fallbackVersion = "2026.03.10-content-import";
  const created = await prisma.contentVersion.upsert({
    where: { version: fallbackVersion },
    create: {
      version: fallbackVersion,
      checksum_sha256: "content-import-placeholder-checksum",
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
  const hexCsvPath = process.argv[2];
  const invocationCsvPath = process.argv[3];
  const relicsCsvPath = process.argv[4];

  if (!hexCsvPath || !invocationCsvPath) {
    throw new Error(
      "Usage: npx tsx prisma/import-cards-relics-csv.ts <path-to-hex.csv> <path-to-invocation.csv> [path-to-relics.csv]"
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const filesToRead = [readFile(resolve(hexCsvPath), "utf8"), readFile(resolve(invocationCsvPath), "utf8")];

    if (relicsCsvPath) {
      filesToRead.push(readFile(resolve(relicsCsvPath), "utf8"));
    }

    const [hexCsvText, invocationCsvText, relicsCsvText] = await Promise.all(filesToRead);

    const hexRows = parse(hexCsvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as HexCsvRow[];

    const invocationRows = parse(invocationCsvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as InvocationCsvRow[];

    const relicsRows = relicsCsvText
      ? (parse(relicsCsvText, {
          columns: true,
          skip_empty_lines: true,
          trim: true
        }) as RelicCsvRow[])
      : [];

    const contentVersionId = await resolveContentVersionId(prisma);

    let hexUpserted = 0;
    let hexSkipped = 0;
    let invocationUpserted = 0;
    let invocationSkipped = 0;
    let relicsUpserted = 0;
    let relicsSkipped = 0;

    for (const row of hexRows) {
      if (isSkippableHexRow(row)) {
        hexSkipped += 1;
        continue;
      }

      const id = toInt(row.id, -1);
      const nameEn = toText(row.name_en) || `hex_${id}`;
      const nameEs = toText(row.name_es) || nameEn;

      await prisma.hexCard.upsert({
        where: { id },
        create: {
          id,
          card_class: toText(row.card_class) || "no_class",
          rarity: toText(row.rarity) || "common",
          name_es: nameEs,
          name_en: nameEn,
          image: toText(row.image) || "res://assets/sprites/card-images/placeholder.png",
          gold_coins: toInt(row.gold_coins, 0),
          red_coins: toInt(row.red_coins, 0),
          life_cost: toInt(row.life_cost, 0),
          displayed_text_es: toNullableText(row.displayed_text_es),
          displayed_text_en: toNullableText(row.displayed_text_en),
          target: toNullableText(row.target),
          effect1: toNullableText(row.effect1),
          effect2: toNullableText(row.effect2),
          effect3: toNullableText(row.effect3),
          condition1: toNullableText(row.condition1),
          condition2: toNullableText(row.condition2),
          condition3: toNullableText(row.condition3),
          value1: toNullableInt(row.value1),
          value2: toNullableInt(row.value2),
          value3: toNullableInt(row.value3),
          turn_duration1: toNullableInt(row.turn_duration1),
          turn_duration2: toNullableInt(row.turn_duration2),
          turn_duration3: toNullableInt(row.turn_duration3),
          chance1: toNullableInt(row.chance1),
          chance2: toNullableInt(row.chance2),
          chance3: toNullableInt(row.chance3),
          ethereal: toBoolean(row.ethereal),
          content_version_id: toText(row.content_version_id) || contentVersionId
        },
        update: {
          card_class: toText(row.card_class) || "no_class",
          rarity: toText(row.rarity) || "common",
          name_es: nameEs,
          name_en: nameEn,
          image: toText(row.image) || "res://assets/sprites/card-images/placeholder.png",
          gold_coins: toInt(row.gold_coins, 0),
          red_coins: toInt(row.red_coins, 0),
          life_cost: toInt(row.life_cost, 0),
          displayed_text_es: toNullableText(row.displayed_text_es),
          displayed_text_en: toNullableText(row.displayed_text_en),
          target: toNullableText(row.target),
          effect1: toNullableText(row.effect1),
          effect2: toNullableText(row.effect2),
          effect3: toNullableText(row.effect3),
          condition1: toNullableText(row.condition1),
          condition2: toNullableText(row.condition2),
          condition3: toNullableText(row.condition3),
          value1: toNullableInt(row.value1),
          value2: toNullableInt(row.value2),
          value3: toNullableInt(row.value3),
          turn_duration1: toNullableInt(row.turn_duration1),
          turn_duration2: toNullableInt(row.turn_duration2),
          turn_duration3: toNullableInt(row.turn_duration3),
          chance1: toNullableInt(row.chance1),
          chance2: toNullableInt(row.chance2),
          chance3: toNullableInt(row.chance3),
          ethereal: toBoolean(row.ethereal),
          content_version_id: toText(row.content_version_id) || contentVersionId
        }
      });

      hexUpserted += 1;
    }

    for (const row of invocationRows) {
      if (isSkippableInvocationRow(row)) {
        invocationSkipped += 1;
        continue;
      }

      const id = toInt(row.id, -1);
      const nameEn = toText(row.name_en) || `invocation_${id}`;
      const nameEs = toText(row.name_es) || nameEn;

      await prisma.invocationCard.upsert({
        where: { id },
        create: {
          id,
          rarity: toText(row.rarity) || "common",
          tier: toText(row.tier) || "1",
          name_es: nameEs,
          name_en: nameEn,
          image: toText(row.image) || "res://assets/sprites/card-images/placeholder.png",
          gold_coins: toInt(row.gold_coins, 0),
          red_coins: toInt(row.red_coins, 0),
          life_cost: toInt(row.life_cost, 0),
          attack: toNullableInt(row.attack),
          speed: toNullableInt(row.speed),
          health: toNullableInt(row.health),
          skill1: toNullableText(row.skill1),
          skill2: toNullableText(row.skill2),
          skill3: toNullableText(row.skill3),
          skill_value1: toNullableInt(row.skill_value1),
          skill_value2: toNullableInt(row.skill_value2),
          skill_value3: toNullableInt(row.skill_value3),
          lore: toNullableText(row.lore),
          content_version_id: toText(row.content_version_id) || contentVersionId
        },
        update: {
          rarity: toText(row.rarity) || "common",
          tier: toText(row.tier) || "1",
          name_es: nameEs,
          name_en: nameEn,
          image: toText(row.image) || "res://assets/sprites/card-images/placeholder.png",
          gold_coins: toInt(row.gold_coins, 0),
          red_coins: toInt(row.red_coins, 0),
          life_cost: toInt(row.life_cost, 0),
          attack: toNullableInt(row.attack),
          speed: toNullableInt(row.speed),
          health: toNullableInt(row.health),
          skill1: toNullableText(row.skill1),
          skill2: toNullableText(row.skill2),
          skill3: toNullableText(row.skill3),
          skill_value1: toNullableInt(row.skill_value1),
          skill_value2: toNullableInt(row.skill_value2),
          skill_value3: toNullableInt(row.skill_value3),
          lore: toNullableText(row.lore),
          content_version_id: toText(row.content_version_id) || contentVersionId
        }
      });

      invocationUpserted += 1;
    }

    for (const row of relicsRows) {
      if (isSkippableRelicRow(row)) {
        relicsSkipped += 1;
        continue;
      }

      const id = toInt(row.id, -1);
      const nameEn = toText(row.name_en) || `relic_${id}`;
      const nameEs = toText(row.name_es) || nameEn;

      await prisma.relic.upsert({
        where: { id },
        create: {
          id,
          tier: toText(row.tier) || "none",
          name_es: nameEs,
          name_en: nameEn,
          description: toText(row.description) || nameEs,
          image: toText(row.image) || "res://assets/sprites/relics/placeholder.png",
          rarity: toText(row.rarity) || "common",
          special_conditions: toNullableText(row.special_conditions),
          effect1: toNullableText(row.effect1),
          effect2: toNullableText(row.effect2),
          effect3: toNullableText(row.effect3),
          value1: toNullableInt(row.value1),
          value2: toNullableInt(row.value2),
          value3: toNullableInt(row.value3),
          content_version_id: contentVersionId
        },
        update: {
          tier: toText(row.tier) || "none",
          name_es: nameEs,
          name_en: nameEn,
          description: toText(row.description) || nameEs,
          image: toText(row.image) || "res://assets/sprites/relics/placeholder.png",
          rarity: toText(row.rarity) || "common",
          special_conditions: toNullableText(row.special_conditions),
          effect1: toNullableText(row.effect1),
          effect2: toNullableText(row.effect2),
          effect3: toNullableText(row.effect3),
          value1: toNullableInt(row.value1),
          value2: toNullableInt(row.value2),
          value3: toNullableInt(row.value3),
          content_version_id: contentVersionId
        }
      });

      relicsUpserted += 1;
    }

    console.log(
      `Content import completed. Hex upserted: ${hexUpserted}, hex skipped: ${hexSkipped}, invocation upserted: ${invocationUpserted}, invocation skipped: ${invocationSkipped}, relics upserted: ${relicsUpserted}, relics skipped: ${relicsSkipped}.`
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Import content failed", error);
  process.exitCode = 1;
});