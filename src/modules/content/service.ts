import { HttpError } from "../../lib/http-error";
import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../lib/auth-context";

type ContentTable = "cards" | "relics" | "events";

async function ensureAuthorized(auth: AuthContext) {
  const player = await prisma.player.findUnique({
    where: { id: auth.playerId },
    select: { user_id: true }
  });

  if (!player || player.user_id !== auth.userId) {
    throw new HttpError(401, "unauthorized", "Unauthorized");
  }
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
  await ensureAuthorized(auth);
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

  return {
    content_version: activeVersion.version,
    checksum_sha256: activeVersion.checksum_sha256,
    cards,
    relics,
    events
  };
}

function parseTable(value: string): ContentTable {
  if (value === "cards" || value === "relics" || value === "events") {
    return value;
  }

  throw new HttpError(400, "unknown_content_table", "Unknown content table");
}

export async function getContentTable(auth: AuthContext, tableRaw: string) {
  await ensureAuthorized(auth);
  const table = parseTable(tableRaw);
  const activeVersion = await getActiveVersion();

  const items =
    table === "cards"
      ? await prisma.card.findMany({
          where: { content_version_id: activeVersion.id },
          orderBy: { id: "asc" }
        })
      : table === "relics"
        ? await prisma.relic.findMany({
            where: { content_version_id: activeVersion.id },
            orderBy: { id: "asc" }
          })
        : await prisma.event.findMany({
            where: { content_version_id: activeVersion.id },
            orderBy: { id: "asc" }
          });

  return {
    table,
    content_version: activeVersion.version,
    checksum_sha256: activeVersion.checksum_sha256,
    items
  };
}
