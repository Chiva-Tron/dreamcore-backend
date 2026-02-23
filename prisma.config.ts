import "dotenv/config";
import { defineConfig } from "prisma/config";

const prismaDatasourceUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!prismaDatasourceUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set for Prisma CLI");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url: prismaDatasourceUrl
  }
});
