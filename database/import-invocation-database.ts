import { type ImportResult, readCsvRows, toInt, toNullableInt, toNullableText, toText, withImportContext } from "./import-support";

type InvocationCsvRow = Record<string, string | undefined>;

const DEFAULT_PATH = "database/invocation_database.csv";

function isSkippableInvocationRow(row: InvocationCsvRow): boolean {
  return toInt(row.id, -1) <= 0;
}

export async function importInvocationDatabase(inputPath = DEFAULT_PATH): Promise<ImportResult> {
  const rows = await readCsvRows<InvocationCsvRow>(inputPath);

  return withImportContext(async ({ prisma, contentVersionId }) => {
    let upserted = 0;
    let skipped = 0;

    for (const row of rows) {
      if (isSkippableInvocationRow(row)) {
        skipped += 1;
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

      upserted += 1;
    }

    console.log(`invocation_database import completed. Upserted: ${upserted}. Skipped: ${skipped}.`);
    return { upserted, skipped };
  });
}

async function main() {
  await importInvocationDatabase(process.argv[2] ?? DEFAULT_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});