ALTER TABLE IF EXISTS "relics" RENAME TO "relics_database";
ALTER TABLE IF EXISTS "events" RENAME TO "events_database";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'relics_pkey'
  ) THEN
    ALTER TABLE "relics_database" RENAME CONSTRAINT "relics_pkey" TO "relics_database_pkey";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_pkey'
  ) THEN
    ALTER TABLE "events_database" RENAME CONSTRAINT "events_pkey" TO "events_database_pkey";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'relics_content_version_id_fkey'
  ) THEN
    ALTER TABLE "relics_database" RENAME CONSTRAINT "relics_content_version_id_fkey" TO "relics_database_content_version_id_fkey";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_content_version_id_fkey'
  ) THEN
    ALTER TABLE "events_database" RENAME CONSTRAINT "events_content_version_id_fkey" TO "events_database_content_version_id_fkey";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'relics_content_version_id_idx'
  ) THEN
    ALTER INDEX "relics_content_version_id_idx" RENAME TO "relics_database_content_version_id_idx";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'events_content_version_id_idx'
  ) THEN
    ALTER INDEX "events_content_version_id_idx" RENAME TO "events_database_content_version_id_idx";
  END IF;
END $$;

ALTER TABLE "events_database"
  ALTER COLUMN "reward_multiplier" TYPE DOUBLE PRECISION
  USING COALESCE("reward_multiplier", 0)::DOUBLE PRECISION,
  ALTER COLUMN "reward_multiplier" SET DEFAULT 0;