import { type ImportResult, readCsvRows, toBoolean, toInt, toNullableInt, toNullableText, toText, withImportContext } from "./import-support";

type HexCsvRow = Record<string, string | undefined>;

const DEFAULT_PATH = "database/hex_database.csv";
const HEX_CHANCE_PATTERN = /^[1-5]\/6$/;

function isSkippableHexRow(row: HexCsvRow): boolean {
  return toInt(row.id, -1) <= 0;
}

function toNullableHexChance(value: string | undefined): string | null {
  const trimmed = toText(value);
  if (!trimmed) {
    return null;
  }

  if (!HEX_CHANCE_PATTERN.test(trimmed)) {
    throw new Error(`Invalid hex chance format: ${trimmed}`);
  }

  return trimmed;
}

function validateHexRow(row: HexCsvRow): void {
  const chances = [row.chance1, row.chance2, row.chance3]
    .map((value) => toNullableHexChance(value))
    .filter((value): value is string => value !== null);

  if (chances.length > 1) {
    throw new Error(`Hex row ${row.id ?? "unknown"} has more than one probabilistic effect`);
  }

  [1, 2, 3].forEach((index) => {
    const chance = toNullableHexChance(row[`chance${index}`]);
    const effect = toNullableText(row[`effect${index}`]);

    if (chance && !effect) {
      throw new Error(`Hex row ${row.id ?? "unknown"} has chance${index} without effect${index}`);
    }
  });
}

export async function importHexDatabase(inputPath = DEFAULT_PATH): Promise<ImportResult> {
  const rows = await readCsvRows<HexCsvRow>(inputPath);

  return withImportContext(async ({ prisma, contentVersionId }) => {
    let upserted = 0;
    let skipped = 0;

    for (const row of rows) {
      if (isSkippableHexRow(row)) {
        skipped += 1;
        continue;
      }

      validateHexRow(row);

      const id = toInt(row.id, -1);
      const nameEn = toText(row.name_en) || `hex_${id}`;
      const nameEs = toText(row.name_es) || nameEn;
      const chance1 = toNullableHexChance(row.chance1);
      const chance2 = toNullableHexChance(row.chance2);
      const chance3 = toNullableHexChance(row.chance3);

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
          chance1,
          chance2,
          chance3,
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
          chance1,
          chance2,
          chance3,
          ethereal: toBoolean(row.ethereal),
          content_version_id: toText(row.content_version_id) || contentVersionId
        }
      });

      upserted += 1;
    }

    console.log(`hex_database import completed. Upserted: ${upserted}. Skipped: ${skipped}.`);
    return { upserted, skipped };
  });
}

async function main() {
  await importHexDatabase(process.argv[2] ?? DEFAULT_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});