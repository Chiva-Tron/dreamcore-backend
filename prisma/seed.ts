import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
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

async function upsertContentVersion(version: string) {
  return prisma.contentVersion.upsert({
    where: {
      version
    },
    create: {
      version,
      checksum_sha256: checksumPlaceholder(),
      is_active: true
    },
    update: {
      is_active: true
    },
    select: {
      id: true,
      version: true,
      is_active: true
    }
  });
}

async function main() {
  const targetVersion = "2026.02.22";

  const rows = [await upsertContentVersion(targetVersion)];

  console.table(rows);
  console.log("Seed de content version completado.");
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
