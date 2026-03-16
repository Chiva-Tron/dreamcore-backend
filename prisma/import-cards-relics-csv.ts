import { importHexDatabase } from "../database/import-hex-database";
import { importInvocationDatabase } from "../database/import-invocation-database";
import { importRelicsDatabase } from "../database/import-relics-database";

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

const HEX_CHANCE_PATTERN = /^[1-5]\/6$/;

function toNullableHexChance(value: string | undefined): string | null {
  const trimmed = toText(value);
  if (!trimmed) {
    return null;
  }

  if (!HEX_CHANCE_PATTERN.test(trimmed)) {
    throw new Error(`Invalid hex chance format \"${trimmed}\". Expected X/6 where X is between 1 and 5.`);
  }

  return trimmed;
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

function validateHexRow(row: HexCsvRow): void {
  const id = toInt(row.id, -1);
  const chances = [
    toNullableHexChance(row.chance1),
    toNullableHexChance(row.chance2),
    toNullableHexChance(row.chance3)
  ];
  const effects = [toNullableText(row.effect1), toNullableText(row.effect2), toNullableText(row.effect3)];

  if (chances.filter((chance) => chance !== null).length > 1) {
    throw new Error(`Hex row ${id} has more than one probabilistic effect. Only one of chance1, chance2 or chance3 can be set.`);
  }

  chances.forEach((chance, index) => {
    if (chance !== null && effects[index] === null) {
      throw new Error(`Hex row ${id} defines chance${index + 1} without a matching effect${index + 1}.`);
    }
  });
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
      "Usage: npx tsx prisma/import-cards-relics-csv.ts <path-to-hex_database.csv> <path-to-invocation_database.csv> [path-to-relics_database.csv]"
    );
  }

  const hexResult = await importHexDatabase(hexCsvPath);
  const invocationResult = await importInvocationDatabase(invocationCsvPath);
  const relicsResult = relicsCsvPath ? await importRelicsDatabase(relicsCsvPath) : { upserted: 0, skipped: 0 };

  console.log(
    `Content import completed. Hex upserted: ${hexResult.upserted}, hex skipped: ${hexResult.skipped}, invocation upserted: ${invocationResult.upserted}, invocation skipped: ${invocationResult.skipped}, relics upserted: ${relicsResult.upserted}, relics skipped: ${relicsResult.skipped}.`
  );
}

main().catch((error) => {
  console.error("Import content failed", error);
  process.exitCode = 1;
});