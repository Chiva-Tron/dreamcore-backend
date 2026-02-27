import { HttpError } from "../../lib/http-error";
import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../lib/auth-context";
import { isCardUnlocked, isRelicUnlocked } from "../player/progression";

type ContentTable = "cards" | "relics" | "events";

function normalizeEventForResponse(event: Record<string, unknown>) {
  const snakeCaseValue = event.equipped_relics;
  const camelCaseValue = event.equippedRelics;

  const equippedRelics =
    typeof snakeCaseValue === "number"
      ? snakeCaseValue
      : typeof camelCaseValue === "number"
        ? camelCaseValue
        : 0;

  return {
    ...event,
    equipped_relics: equippedRelics
  };
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
    prisma.event.findMany({
      where: { content_version_id: activeVersion.id },
      orderBy: { id: "asc" }
    })
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

  const events = await prisma.event.findMany({
    where: { content_version_id: activeVersion.id },
    orderBy: { id: "asc" }
  });

  return {
    table,
    content_version: activeVersion.version,
    checksum_sha256: activeVersion.checksum_sha256,
    items: events.map((event) => normalizeEventForResponse(event as unknown as Record<string, unknown>))
  };
}
