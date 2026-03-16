import { type ImportResult, getFirstDefinedValue, readCsvRows, toDeckJson, toEventClass, toFloat, toInt, toNullableInt, toNullableText, toText, withImportContext } from "./import-support";

type EventsCsvRow = Record<string, string | undefined>;

const DEFAULT_PATH = "database/events_database.csv";
const EQUIPPED_RELICS_HEADER_ALIASES = ["equipped_relics", "equippedRelics"];

function isSkippableEventRow(row: EventsCsvRow): boolean {
  return toInt(row.id, -1) <= 0;
}

export async function importEventsDatabase(inputPath = DEFAULT_PATH): Promise<ImportResult> {
  const rows = await readCsvRows<EventsCsvRow>(inputPath);

  return withImportContext(async ({ prisma, contentVersionId }) => {
    let upserted = 0;
    let skipped = 0;

    for (const row of rows) {
      if (isSkippableEventRow(row)) {
        skipped += 1;
        continue;
      }

      const id = toInt(row.id, -1);
      const eventClass = toEventClass(row.event_class ?? row.eventClass);

      if (!eventClass) {
        skipped += 1;
        continue;
      }

      const nameEs = toText(row.name_es ?? row.nameES) || `event_${id}`;
      const nameEn = toText(row.name_en ?? row.nameEN) || nameEs;
      const equippedRelicsValue = getFirstDefinedValue(row, EQUIPPED_RELICS_HEADER_ALIASES);

      await prisma.event.upsert({
        where: { id },
        create: {
          id,
          event_class: eventClass,
          name_es: nameEs,
          name_en: nameEn,
          deck: toDeckJson(row.deck),
          image: toNullableText(row.image),
          scene: toNullableText(row.scene),
          health: toInt(row.health, 0),
          equipped_relics: toInt(equippedRelicsValue, 0),
          reward_multiplier: toFloat(row.reward_multiplier ?? row.rewardMultiplier, 0),
          relic_reward: toNullableInt(row.relic_reward ?? row.relicReward),
          starting_gold_coins: toInt(row.starting_gold_coins ?? row.startingGoldCoins, 0),
          starting_cards_in_hand: toInt(row.starting_cards_in_hand ?? row.startingCardsInHand, 0),
          cards_per_turn: toInt(row.cards_per_turn ?? row.cardsPerTurn, 0),
          discards_per_turn: toInt(row.discards_per_turn ?? row.discardsPerTurn, 0),
          special_conditions: toNullableText(row.special_conditions ?? row.specialConditions),
          content_version_id: toText(row.content_version_id) || contentVersionId
        },
        update: {
          event_class: eventClass,
          name_es: nameEs,
          name_en: nameEn,
          deck: toDeckJson(row.deck),
          image: toNullableText(row.image),
          scene: toNullableText(row.scene),
          health: toInt(row.health, 0),
          equipped_relics: toInt(equippedRelicsValue, 0),
          reward_multiplier: toFloat(row.reward_multiplier ?? row.rewardMultiplier, 0),
          relic_reward: toNullableInt(row.relic_reward ?? row.relicReward),
          starting_gold_coins: toInt(row.starting_gold_coins ?? row.startingGoldCoins, 0),
          starting_cards_in_hand: toInt(row.starting_cards_in_hand ?? row.startingCardsInHand, 0),
          cards_per_turn: toInt(row.cards_per_turn ?? row.cardsPerTurn, 0),
          discards_per_turn: toInt(row.discards_per_turn ?? row.discardsPerTurn, 0),
          special_conditions: toNullableText(row.special_conditions ?? row.specialConditions),
          content_version_id: toText(row.content_version_id) || contentVersionId
        }
      });

      upserted += 1;
    }

    console.log(`events_database import completed. Upserted: ${upserted}. Skipped: ${skipped}.`);
    return { upserted, skipped };
  });
}

async function main() {
  await importEventsDatabase(process.argv[2] ?? DEFAULT_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});