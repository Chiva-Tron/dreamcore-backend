import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { Pool } from "pg";

type CardCsvRow = {
  id?: string;
  card_class?: string;
  rarity?: string;
  tier?: string;
  name_es?: string;
  name_en?: string;
  image?: string;
  gold_coins?: string;
  attack?: string;
  speed?: string;
  health?: string;
  skill1?: string;
  skill_value1?: string;
  skill_value2?: string;
  skill_value3?: string;
  ethereal?: string;
  displayed_text?: string;
  condition?: string;
  target?: string;
  effect1?: string;
  value1?: string;
  turn_duration1?: string;
  chance1?: string;
  priority1?: string;
  effect2?: string;
  value2?: string;
  turn_duration2?: string;
  chance2?: string;
  priority2?: string;
  effect3?: string;
  value3?: string;
  turn_duration3?: string;
  chance3?: string;
  priority3?: string;
  type?: string;
  additional_cost?: string;
  skill2?: string;
  skill3?: string;
  red_coins?: string;
  life_cost?: string;
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

function inferCardType(row: CardCsvRow): string {
  const explicitType = toText(row.type);
  if (explicitType) {
    return explicitType;
  }

  const hasCombatStats =
    toNullableInt(row.attack) !== null ||
    toNullableInt(row.speed) !== null ||
    toNullableInt(row.health) !== null;

  return hasCombatStats ? "invocation" : "hex";
}

function isSkippableCardRow(row: CardCsvRow): boolean {
  const id = toInt(row.id, -1);
  const cardClass = toText(row.card_class);
  const hasMeaningfulContent =
    !!cardClass || !!toText(row.name_es) || !!toText(row.name_en) || !!toText(row.displayed_text);

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

  const fallbackVersion = "2026.02.23-cards-relics-import";
  const created = await prisma.contentVersion.upsert({
    where: { version: fallbackVersion },
    create: {
      version: fallbackVersion,
      checksum_sha256: "cards-relics-import-placeholder-checksum",
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
  const cardsCsvPath = process.argv[2];
  const relicsCsvPath = process.argv[3];

  if (!cardsCsvPath || !relicsCsvPath) {
    throw new Error("Usage: tsx prisma/import-cards-relics-csv.ts <path-to-cards.csv> <path-to-relics.csv>");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const [cardsCsvText, relicsCsvText] = await Promise.all([
      readFile(resolve(cardsCsvPath), "utf8"),
      readFile(resolve(relicsCsvPath), "utf8")
    ]);

    const cardsRows = parse(cardsCsvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as CardCsvRow[];

    const relicsRows = parse(relicsCsvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as RelicCsvRow[];

    const contentVersionId = await resolveContentVersionId(prisma);

    let cardsUpserted = 0;
    let cardsSkipped = 0;
    let relicsUpserted = 0;
    let relicsSkipped = 0;

    for (const row of cardsRows) {
      if (isSkippableCardRow(row)) {
        cardsSkipped += 1;
        continue;
      }

      const id = toInt(row.id, -1);
      const nameEn = toText(row.name_en) || `card_${id}`;
      const nameEs = toText(row.name_es) || nameEn;
      const cardClass = toText(row.card_class) || "no_class";
      const rarity = toText(row.rarity) || "common";
      const tier = toText(row.tier) || "none";
      const image = toText(row.image) || "res://assets/sprites/card-images/placeholder.png";

      await prisma.card.upsert({
        where: { id },
        create: {
          id,
          card_class: cardClass,
          rarity,
          tier,
          name_es: nameEs,
          name_en: nameEn,
          image,
          gold_coins: toInt(row.gold_coins, 0),
          red_coins: toInt(row.red_coins, 0),
          life_cost: toInt(row.life_cost, 0),
          additional_cost: toInt(row.additional_cost, 0),
          attack: toNullableInt(row.attack),
          speed: toNullableInt(row.speed),
          health: toNullableInt(row.health),
          skill1: toNullableText(row.skill1),
          skill2: toNullableText(row.skill2),
          skill3: toNullableText(row.skill3),
          skill_value1: toNullableInt(row.skill_value1),
          skill_value2: toNullableInt(row.skill_value2),
          skill_value3: toNullableInt(row.skill_value3),
          displayed_text: toNullableText(row.displayed_text),
          condition: toNullableText(row.condition),
          target: toNullableText(row.target),
          effect1: toNullableText(row.effect1),
          effect2: toNullableText(row.effect2),
          effect3: toNullableText(row.effect3),
          value1: toNullableInt(row.value1),
          value2: toNullableInt(row.value2),
          value3: toNullableInt(row.value3),
          turn_duration1: toNullableInt(row.turn_duration1),
          turn_duration2: toNullableInt(row.turn_duration2),
          turn_duration3: toNullableInt(row.turn_duration3),
          chance1: toNullableInt(row.chance1),
          chance2: toNullableInt(row.chance2),
          chance3: toNullableInt(row.chance3),
          priority1: toNullableInt(row.priority1),
          priority2: toNullableInt(row.priority2),
          priority3: toNullableInt(row.priority3),
          type: inferCardType(row),
          ethereal: toBoolean(row.ethereal),
          content_version_id: contentVersionId
        },
        update: {
          card_class: cardClass,
          rarity,
          tier,
          name_es: nameEs,
          name_en: nameEn,
          image,
          gold_coins: toInt(row.gold_coins, 0),
          red_coins: toInt(row.red_coins, 0),
          life_cost: toInt(row.life_cost, 0),
          additional_cost: toInt(row.additional_cost, 0),
          attack: toNullableInt(row.attack),
          speed: toNullableInt(row.speed),
          health: toNullableInt(row.health),
          skill1: toNullableText(row.skill1),
          skill2: toNullableText(row.skill2),
          skill3: toNullableText(row.skill3),
          skill_value1: toNullableInt(row.skill_value1),
          skill_value2: toNullableInt(row.skill_value2),
          skill_value3: toNullableInt(row.skill_value3),
          displayed_text: toNullableText(row.displayed_text),
          condition: toNullableText(row.condition),
          target: toNullableText(row.target),
          effect1: toNullableText(row.effect1),
          effect2: toNullableText(row.effect2),
          effect3: toNullableText(row.effect3),
          value1: toNullableInt(row.value1),
          value2: toNullableInt(row.value2),
          value3: toNullableInt(row.value3),
          turn_duration1: toNullableInt(row.turn_duration1),
          turn_duration2: toNullableInt(row.turn_duration2),
          turn_duration3: toNullableInt(row.turn_duration3),
          chance1: toNullableInt(row.chance1),
          chance2: toNullableInt(row.chance2),
          chance3: toNullableInt(row.chance3),
          priority1: toNullableInt(row.priority1),
          priority2: toNullableInt(row.priority2),
          priority3: toNullableInt(row.priority3),
          type: inferCardType(row),
          ethereal: toBoolean(row.ethereal),
          content_version_id: contentVersionId
        }
      });

      cardsUpserted += 1;
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
      `Cards and relics import completed. Cards upserted: ${cardsUpserted}, cards skipped: ${cardsSkipped}, relics upserted: ${relicsUpserted}, relics skipped: ${relicsSkipped}.`
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Import cards/relics failed", error);
  process.exitCode = 1;
});
