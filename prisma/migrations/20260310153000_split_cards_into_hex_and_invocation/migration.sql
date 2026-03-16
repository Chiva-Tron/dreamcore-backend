-- CreateTable
CREATE TABLE "hex_database" (
    "id" INTEGER NOT NULL,
    "card_class" VARCHAR(32) NOT NULL,
    "rarity" VARCHAR(32) NOT NULL,
    "name_es" VARCHAR(128) NOT NULL,
    "name_en" VARCHAR(128) NOT NULL,
    "image" VARCHAR(256) NOT NULL,
    "gold_coins" INTEGER NOT NULL DEFAULT 0,
    "red_coins" INTEGER NOT NULL DEFAULT 0,
    "life_cost" INTEGER NOT NULL DEFAULT 0,
    "displayed_text_es" TEXT,
    "displayed_text_en" TEXT,
    "target" VARCHAR(64),
    "effect1" VARCHAR(64),
    "effect2" VARCHAR(64),
    "effect3" VARCHAR(64),
    "condition1" VARCHAR(64),
    "condition2" VARCHAR(64),
    "condition3" VARCHAR(64),
    "value1" INTEGER,
    "value2" INTEGER,
    "value3" INTEGER,
    "turn_duration1" INTEGER,
    "turn_duration2" INTEGER,
    "turn_duration3" INTEGER,
    "chance1" INTEGER,
    "chance2" INTEGER,
    "chance3" INTEGER,
    "ethereal" BOOLEAN NOT NULL DEFAULT false,
    "content_version_id" UUID NOT NULL,

    CONSTRAINT "hex_database_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invocation_database" (
    "id" INTEGER NOT NULL,
    "rarity" VARCHAR(32) NOT NULL,
    "tier" VARCHAR(32) NOT NULL,
    "name_es" VARCHAR(128) NOT NULL,
    "name_en" VARCHAR(128) NOT NULL,
    "image" VARCHAR(256) NOT NULL,
    "gold_coins" INTEGER NOT NULL DEFAULT 0,
    "red_coins" INTEGER NOT NULL DEFAULT 0,
    "life_cost" INTEGER NOT NULL DEFAULT 0,
    "attack" INTEGER,
    "speed" INTEGER,
    "health" INTEGER,
    "skill1" VARCHAR(64),
    "skill2" VARCHAR(64),
    "skill3" VARCHAR(64),
    "skill_value1" INTEGER,
    "skill_value2" INTEGER,
    "skill_value3" INTEGER,
    "lore" TEXT,
    "content_version_id" UUID NOT NULL,

    CONSTRAINT "invocation_database_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hex_database_content_version_id_idx" ON "hex_database"("content_version_id");

-- CreateIndex
CREATE INDEX "invocation_database_content_version_id_idx" ON "invocation_database"("content_version_id");

-- AddForeignKey
ALTER TABLE "hex_database" ADD CONSTRAINT "hex_database_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invocation_database" ADD CONSTRAINT "invocation_database_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data load note
-- After this migration, load canonical content with:
-- npx tsx database/import-hex-database.ts
-- npx tsx database/import-invocation-database.ts
-- npx tsx database/import-relics-database.ts

-- DropForeignKey
ALTER TABLE "cards" DROP CONSTRAINT "cards_content_version_id_fkey";

-- DropTable
DROP TABLE "cards";