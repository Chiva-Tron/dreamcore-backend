import { HttpError } from "../../lib/http-error";
import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../lib/auth-context";
import { isCardUnlocked, isRelicUnlocked } from "../player/progression";

type ContentTable = "cards" | "relics" | "events";

type FallbackEventRow = {
  id: number;
  event_class: string;
  name_es: string;
  name_en: string;
  deck: unknown;
  image: string | null;
  scene: string | null;
  health: number;
  reward_multiplier: number;
  relic_reward: number | null;
  starting_gold_coins: number;
  starting_cards_in_hand: number;
  cards_per_turn: number;
  discards_per_turn: number;
  special_conditions: string | null;
  content_version_id: string;
};

function toNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return fallback;
}

function isMissingEventColumnError(error: unknown) {
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? "";

  if (code === "P2022") {
    return true;
  }

  return /equipped_relics|column.+does not exist/i.test(message);
}

function normalizeEventForResponse(event: Record<string, unknown>) {
  const snakeCaseValue = event.equipped_relics;
  const camelCaseValue = event.equippedRelics;

  const equippedRelics = toNonNegativeInt(
    snakeCaseValue,
    toNonNegativeInt(camelCaseValue, 0)
  );

  return {
    ...event,
    equipped_relics: equippedRelics
  };
}

async function findEventsByContentVersion(contentVersionId: string) {
  try {
    return await prisma.event.findMany({
      where: { content_version_id: contentVersionId },
      orderBy: { id: "asc" }
    });
  } catch (error) {
    if (!isMissingEventColumnError(error)) {
      throw error;
    }

    console.warn(
      "events query fallback activated: equipped_relics column missing or inaccessible; defaulting equipped_relics to 0"
    );

    const fallbackRows = await prisma.$queryRaw<FallbackEventRow[]>`
      SELECT
        id,
        event_class,
        name_es,
        name_en,
        deck,
        image,
        scene,
        health,
        reward_multiplier,
        relic_reward,
        starting_gold_coins,
        starting_cards_in_hand,
        cards_per_turn,
        discards_per_turn,
        special_conditions,
        content_version_id
      FROM events
      WHERE content_version_id = ${contentVersionId}
      ORDER BY id ASC
    `;

    return fallbackRows.map((row) => ({
      ...row,
      equipped_relics: 0
    }));
  }
}

async function ensureAuthorized(auth: AuthContext) {
  const player = await prisma.player.findUnique({
    where: { id: auth.playerId },
    select: {
      user_id: true,
      nether_points: true,
      cards_tier: true,
      relics_tier: true,
      classes_tier: true
    }
  });

  if (!player || player.user_id !== auth.userId) {
    throw new HttpError(401, "unauthorized", "Unauthorized");
  }

  return player;
}

async function getActiveVersion() {
  const version = await prisma.contentVersion.findFirst({
    where: { is_active: true },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      version: true,
      checksum_sha256: true
    }
  });

  if (!version) {
    throw new HttpError(404, "content_not_found", "Active content version not found");
  }

  return version;
}

export async function getBundle(auth: AuthContext) {
  const player = await ensureAuthorized(auth);
  const activeVersion = await getActiveVersion();

  const [cards, relics, events] = await Promise.all([
    prisma.card.findMany({
      where: { content_version_id: activeVersion.id },
      orderBy: { id: "asc" }
    }),
    prisma.relic.findMany({
      where: { content_version_id: activeVersion.id },
      orderBy: { id: "asc" }
    }),
    findEventsByContentVersion(activeVersion.id)
  ]);

  const filteredCards = cards.filter((card) => isCardUnlocked(card.tier, player.cards_tier));
  const filteredRelics = relics.filter((relic) => isRelicUnlocked(relic.tier, player.relics_tier));

  return {
    content_version: activeVersion.version,
    checksum_sha256: activeVersion.checksum_sha256,
    cards: filteredCards,
    relics: filteredRelics,
    events: events.map((event) => normalizeEventForResponse(event as unknown as Record<string, unknown>))
  };
}

function parseTable(value: string): ContentTable {
  if (value === "cards" || value === "relics" || value === "events") {
    return value;
  }

  throw new HttpError(400, "unknown_content_table", "Unknown content table");
}

export async function getContentTable(auth: AuthContext, tableRaw: string) {
  const player = await ensureAuthorized(auth);
  const table = parseTable(tableRaw);
  const activeVersion = await getActiveVersion();

  if (table === "cards") {
    const cards = await prisma.card.findMany({
      where: { content_version_id: activeVersion.id },
      orderBy: { id: "asc" }
    });

    return {
      table,
      content_version: activeVersion.version,
      checksum_sha256: activeVersion.checksum_sha256,
      items: cards.filter((card) => isCardUnlocked(card.tier, player.cards_tier))
    };
  }

  if (table === "relics") {
    const relics = await prisma.relic.findMany({
      where: { content_version_id: activeVersion.id },
      orderBy: { id: "asc" }
    });

    return {
      table,
      content_version: activeVersion.version,
      checksum_sha256: activeVersion.checksum_sha256,
      items: relics.filter((relic) => isRelicUnlocked(relic.tier, player.relics_tier))
    };
  }

  const events = await findEventsByContentVersion(activeVersion.id);

  return {
    table,
    content_version: activeVersion.version,
    checksum_sha256: activeVersion.checksum_sha256,
    items: events.map((event) => normalizeEventForResponse(event as unknown as Record<string, unknown>))
  };
}
