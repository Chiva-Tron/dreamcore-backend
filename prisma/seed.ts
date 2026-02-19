import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { ContentType, PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function checksumPlaceholder(): string {
  return randomBytes(32).toString("hex");
}

async function upsertContentVersion(contentType: ContentType, version: string) {
  return prisma.contentVersion.upsert({
    where: {
      content_type_version: {
        content_type: contentType,
        version
      }
    },
    create: {
      content_type: contentType,
      version,
      checksum_sha256: checksumPlaceholder(),
      is_active: true
    },
    update: {
      is_active: true
    },
    select: {
      id: true,
      content_type: true,
      version: true,
      is_active: true
    }
  });
}

async function main() {
  const targetVersion = "v1";

  const rows = await Promise.all([
    upsertContentVersion("cards", targetVersion),
    upsertContentVersion("relics", targetVersion),
    upsertContentVersion("events", targetVersion)
  ]);

  console.table(rows);
  console.log("Use content_type='relics' id for CSV column content_version_id.");
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
