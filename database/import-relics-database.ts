import { type ImportResult, readCsvRows, toInt, toNullableInt, toNullableText, toText, withImportContext } from "./import-support";

type RelicCsvRow = Record<string, string | undefined>;

const DEFAULT_PATH = "database/relics_database.csv";

function isSkippableRelicRow(row: RelicCsvRow): boolean {
  return toInt(row.id, -1) <= 0;
}

export async function importRelicsDatabase(inputPath = DEFAULT_PATH): Promise<ImportResult> {
  const rows = await readCsvRows<RelicCsvRow>(inputPath);

  return withImportContext(async ({ prisma, contentVersionId }) => {
    let upserted = 0;
    let skipped = 0;

    for (const row of rows) {
      if (isSkippableRelicRow(row)) {
        skipped += 1;
        continue;
      }

      const id = toInt(row.id, -1);
      const nameEn = toText(row.name_en ?? row.nameEN) || `relic_${id}`;
      const nameEs = toText(row.name_es ?? row.nameES) || nameEn;
      const description = toText(row.description) || nameEs;

      await prisma.relic.upsert({
        where: { id },
        create: {
          id,
          tier: toText(row.tier) || "none",
          name_es: nameEs,
          name_en: nameEn,
          description,
          image: toText(row.image) || "res://assets/sprites/relics/placeholder.png",
          rarity: toText(row.rarity) || "common",
          special_conditions: toNullableText(row.special_conditions ?? row.specialConditions),
          effect1: toNullableText(row.effect1),
          effect2: toNullableText(row.effect2),
          effect3: toNullableText(row.effect3),
          value1: toNullableInt(row.value1),
          value2: toNullableInt(row.value2),
          value3: toNullableInt(row.value3),
          content_version_id: toText(row.content_version_id) || contentVersionId
        },
        update: {
          tier: toText(row.tier) || "none",
          name_es: nameEs,
          name_en: nameEn,
          description,
          image: toText(row.image) || "res://assets/sprites/relics/placeholder.png",
          rarity: toText(row.rarity) || "common",
          special_conditions: toNullableText(row.special_conditions ?? row.specialConditions),
          effect1: toNullableText(row.effect1),
          effect2: toNullableText(row.effect2),
          effect3: toNullableText(row.effect3),
          value1: toNullableInt(row.value1),
          value2: toNullableInt(row.value2),
          value3: toNullableInt(row.value3),
          content_version_id: toText(row.content_version_id) || contentVersionId
        }
      });

      upserted += 1;
    }

    console.log(`relics_database import completed. Upserted: ${upserted}. Skipped: ${skipped}.`);
    return { upserted, skipped };
  });
}

async function main() {
  await importRelicsDatabase(process.argv[2] ?? DEFAULT_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});