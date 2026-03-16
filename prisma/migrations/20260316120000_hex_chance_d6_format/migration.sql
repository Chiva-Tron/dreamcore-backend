DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hex_database'
      AND column_name = 'chance1'
      AND data_type <> 'character varying'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE "hex_database"
      ALTER COLUMN "chance1" TYPE VARCHAR(3)
      USING (
        CASE
          WHEN "chance1" IS NULL THEN NULL
          WHEN "chance1" BETWEEN 1 AND 5 THEN "chance1"::text || '/6'
          ELSE NULL
        END
      ),
      ALTER COLUMN "chance2" TYPE VARCHAR(3)
      USING (
        CASE
          WHEN "chance2" IS NULL THEN NULL
          WHEN "chance2" BETWEEN 1 AND 5 THEN "chance2"::text || '/6'
          ELSE NULL
        END
      ),
      ALTER COLUMN "chance3" TYPE VARCHAR(3)
      USING (
        CASE
          WHEN "chance3" IS NULL THEN NULL
          WHEN "chance3" BETWEEN 1 AND 5 THEN "chance3"::text || '/6'
          ELSE NULL
        END
      )
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hex_database_chance_format_check'
  ) THEN
    ALTER TABLE "hex_database"
    ADD CONSTRAINT "hex_database_chance_format_check"
    CHECK (
      ("chance1" IS NULL OR "chance1" ~ '^[1-5]/6$') AND
      ("chance2" IS NULL OR "chance2" ~ '^[1-5]/6$') AND
      ("chance3" IS NULL OR "chance3" ~ '^[1-5]/6$')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hex_database_single_proc_check'
  ) THEN
    ALTER TABLE "hex_database"
    ADD CONSTRAINT "hex_database_single_proc_check"
    CHECK (
      (CASE WHEN "chance1" IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN "chance2" IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN "chance3" IS NULL THEN 0 ELSE 1 END) <= 1
    );
  END IF;
END $$;

-- After this migration, reload canonical content from the runtime CSV files in database/.