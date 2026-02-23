import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const HOURS_TO_KEEP = Number(process.env.IDEMPOTENCY_TTL_HOURS ?? 72);

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const cutoff = new Date(Date.now() - HOURS_TO_KEEP * 60 * 60 * 1000);

  const result = await prisma.idempotencyKey.deleteMany({
    where: {
      created_at: {
        lt: cutoff
      }
    }
  });

  console.log(
    JSON.stringify({
      action: "cleanup_idempotency_keys",
      ttl_hours: HOURS_TO_KEEP,
      cutoff: cutoff.toISOString(),
      deleted: result.count
    })
  );

  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error("cleanup_idempotency_keys_failed", error);
  process.exit(1);
});
