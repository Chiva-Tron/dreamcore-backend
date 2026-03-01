import { HttpError } from "../../lib/http-error";
import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../lib/auth-context";
import { isCardUnlocked, isRelicUnlocked } from "../player/progression";

type ContentTable = "cards" | "relics" | "events";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;

type ContentTableMeta = {
  total: number;
  page: number;
  page_size: number;
  next_cursor: string | null;
};

type ContentTableResult = {
  data: {
    table: ContentTable;
    content_version: string;
    checksum_sha256: string;
    items: unknown[];
  };
  meta: ContentTableMeta;
};

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

function toOptionalText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function toEventClass(value: unknown): string {
  if (typeof value !== "string") {
    return "mystery";
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "enemy" ||
    normalized === "boss" ||
    normalized === "rest" ||
    normalized === "shop" ||
    normalized === "sacrifice" ||
    normalized === "upgrade" ||
    normalized === "beginning" ||
    normalized === "exit" ||
    normalized === "mystery"
  ) {
    return normalized;
  }

  return "mystery";
}

function toFallbackEventResponse(row: FallbackEventRow): Record<string, unknown> {
  return {
    id: toNonNegativeInt(row.id, 0),
    event_class: toEventClass(row.event_class),
    name_es: toOptionalText(row.name_es) ?? "",
    name_en: toOptionalText(row.name_en) ?? toOptionalText(row.name_es) ?? "",
    deck: row.deck ?? [],
    image: toOptionalText(row.image),
    scene: toOptionalText(row.scene),
    health: toNonNegativeInt(row.health, 0),
    equipped_relics: 0,
    reward_multiplier: toNonNegativeInt(row.reward_multiplier, 0),
    relic_reward:
      row.relic_reward === null || row.relic_reward === undefined
        ? null
        : toNonNegativeInt(row.relic_reward, 0),
    starting_gold_coins: toNonNegativeInt(row.starting_gold_coins, 0),
    starting_cards_in_hand: toNonNegativeInt(row.starting_cards_in_hand, 0),
    cards_per_turn: toNonNegativeInt(row.cards_per_turn, 0),
    discards_per_turn: toNonNegativeInt(row.discards_per_turn, 0),
    special_conditions: toOptionalText(row.special_conditions),
    content_version_id: String(row.content_version_id ?? "")
  };
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
    if (isMissingEventColumnError(error)) {
      console.warn(
        "events query fallback activated: equipped_relics column missing or inaccessible; defaulting equipped_relics to 0"
      );
    } else {
      console.warn(
        "events query fallback activated after prisma.event.findMany error; using raw SQL and safe normalization",
        error
      );
    }

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

    return fallbackRows.map((row) => toFallbackEventResponse(row));
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

function parsePagination(rawLimit: unknown, rawPage: unknown) {
  const limit =
    typeof rawLimit === "string" && rawLimit.trim() ? Number.parseInt(rawLimit, 10) : DEFAULT_PAGE_SIZE;
  const page = typeof rawPage === "string" && rawPage.trim() ? Number.parseInt(rawPage, 10) : 1;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [
      { field: "limit", message: `range_1_${MAX_PAGE_SIZE}` }
    ]);
  }

  if (!Number.isInteger(page) || page < 1) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [
      { field: "page", message: "min_1" }
    ]);
  }

  return {
    limit,
    page,
    offset: (page - 1) * limit
  };
}

function buildPaginationMeta(total: number, page: number, pageSize: number, returnedItems: number): ContentTableMeta {
  const consumed = (page - 1) * pageSize + returnedItems;

  return {
    total,
    page,
    page_size: pageSize,
    next_cursor: consumed < total ? String(page + 1) : null
  };
}

export async function getContentTable(
  auth: AuthContext,
  tableRaw: string,
  rawLimit: unknown,
  rawPage: unknown
): Promise<ContentTableResult> {
  await ensureAuthorized(auth);
  const table = parseTable(tableRaw);
  const activeVersion = await getActiveVersion();
  const pagination = parsePagination(rawLimit, rawPage);

  if (table === "cards") {
    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where: { content_version_id: activeVersion.id },
        orderBy: { id: "asc" },
        take: pagination.limit,
        skip: pagination.offset
      }),
      prisma.card.count({ where: { content_version_id: activeVersion.id } })
    ]);

    return {
      data: {
        table,
        content_version: activeVersion.version,
        checksum_sha256: activeVersion.checksum_sha256,
        items: cards
      },
      meta: buildPaginationMeta(total, pagination.page, pagination.limit, cards.length)
    };
  }

  if (table === "relics") {
    const [relics, total] = await Promise.all([
      prisma.relic.findMany({
        where: { content_version_id: activeVersion.id },
        orderBy: { id: "asc" },
        take: pagination.limit,
        skip: pagination.offset
      }),
      prisma.relic.count({ where: { content_version_id: activeVersion.id } })
    ]);

    return {
      data: {
        table,
        content_version: activeVersion.version,
        checksum_sha256: activeVersion.checksum_sha256,
        items: relics
      },
      meta: buildPaginationMeta(total, pagination.page, pagination.limit, relics.length)
    };
  }

  const [events, total] = await Promise.all([
    findEventsByContentVersion(activeVersion.id),
    prisma.event.count({ where: { content_version_id: activeVersion.id } })
  ]);

  const pagedEvents = events.slice(pagination.offset, pagination.offset + pagination.limit);

  return {
    data: {
      table,
      content_version: activeVersion.version,
      checksum_sha256: activeVersion.checksum_sha256,
      items: pagedEvents.map((event) =>
        normalizeEventForResponse(event as unknown as Record<string, unknown>)
      )
    },
    meta: buildPaginationMeta(total, pagination.page, pagination.limit, pagedEvents.length)
  };
}
