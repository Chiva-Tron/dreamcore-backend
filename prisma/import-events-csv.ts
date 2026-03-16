import { importEventsDatabase } from "../database/import-events-database";

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
  await importEventsDatabase(process.argv[2]);
}

main().catch((error) => {
  console.error("Import events failed", error);
  process.exitCode = 1;
});