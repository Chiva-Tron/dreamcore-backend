import "dotenv/config";
import { defineConfig } from "prisma/config";

const prismaDatasourceUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL ?? createDefaultShadowDatabaseUrl(process.env.DIRECT_URL);

if (!prismaDatasourceUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set for Prisma CLI");
}

function createDefaultShadowDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    return undefined;
  }

  const shadowUrl = new URL(databaseUrl);
  shadowUrl.searchParams.set("schema", "prisma_shadow");

  return shadowUrl.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url: prismaDatasourceUrl,
    shadowDatabaseUrl
  }
});
