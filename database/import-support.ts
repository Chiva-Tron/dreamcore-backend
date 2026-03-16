import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { EventClass, PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { Pool } from "pg";

export type ImportResult = {
  upserted: number;
  skipped: number;
};

export type ImportContext = {
  prisma: PrismaClient;
  contentVersionId: string;
};

type ContentVersionRow = {
  id: string;
};

export async function withImportContext<T>(
  run: (context: ImportContext) => Promise<T>
): Promise<T> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const contentVersionId = await resolveContentVersionId(prisma);
    return await run({ prisma, contentVersionId });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

export async function readCsvRows<T extends Record<string, string | undefined>>(
  inputPath: string
): Promise<T[]> {
  const csvText = await readFile(resolve(inputPath), "utf8");
  return parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as T[];
}

export function toText(value: string | undefined): string {
  return (value ?? "").trim();
}

export function toNullableText(value: string | undefined): string | null {
  const trimmed = toText(value);
  return trimmed.length > 0 ? trimmed : null;
}

export function toInt(value: string | undefined, fallback = 0): number {
  const trimmed = toText(value);
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function toNullableInt(value: string | undefined): number | null {
  const trimmed = toText(value);
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function toFloat(value: string | undefined, fallback = 0): number {
  const trimmed = toText(value);
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function toBoolean(value: string | undefined): boolean {
  const normalized = toText(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function toDeckJson(value: string | undefined): unknown {
  const trimmed = toText(value);
  if (!trimmed) {
    return [];
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return [];
  }
}

export function getFirstDefinedValue(
  row: Record<string, string | undefined>,
  aliases: string[]
): string | undefined {
  return aliases.find((alias) => row[alias] !== undefined)
    ? row[aliases.find((alias) => row[alias] !== undefined)!]
    : undefined;
}

export function toEventClass(value: string | undefined): EventClass | null {
  const normalized = toText(value).toLowerCase();

  if (
    normalized === "enemy" ||
    normalized === "boss" ||
    normalized === "rest" ||
    normalized === "shop" ||
    normalized === "sacrifice" ||
    normalized === "upgrade" ||
    normalized === "beginning" ||
    normalized === "initial_picks" ||
    normalized === "exit" ||
    normalized === "mystery"
  ) {
    return normalized;
  }

  if (normalized === "initial_pick") {
    return "initial_picks";
  }

  return null;
}

async function resolveContentVersionId(prisma: PrismaClient): Promise<string> {
  const row = (await prisma.$queryRaw`
    SELECT id
    FROM content_versions
    WHERE is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  `) as ContentVersionRow[];

  const contentVersionId = row[0]?.id;
  if (!contentVersionId) {
    throw new Error("No active content_version found");
  }

  return contentVersionId;
}