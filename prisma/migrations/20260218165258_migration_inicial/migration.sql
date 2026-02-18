-- CreateEnum
CREATE TYPE "PlayerClass" AS ENUM ('titan', 'arcane', 'umbralist', 'no_class');

-- CreateEnum
CREATE TYPE "RunResult" AS ENUM ('finished', 'quit', 'defeat', 'victory');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('cards', 'events', 'relics', 'full_bundle');

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('invocation', 'hex');

-- CreateEnum
CREATE TYPE "EventClass" AS ENUM ('enemy', 'boss', 'rest', 'shop', 'sacrifice', 'upgrade', 'beginning', 'exit', 'mystery');

-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('client_submit', 'admin', 'internal');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('active', 'revoked', 'expired', 'disabled');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "TelemetrySource" AS ENUM ('server', 'client', 'worker');

-- CreateEnum
CREATE TYPE "TelemetryTrustLevel" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "TelemetryEventName" AS ENUM ('run_started', 'run_submitted', 'run_finished', 'floor_completed', 'node_entered', 'battle_started', 'battle_finished', 'card_picked', 'relic_picked', 'shop_purchase', 'player_banned', 'fraud_flag_created');

-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "nickname" VARCHAR(16) NOT NULL,
    "avatar_id" VARCHAR(64),
    "platform" VARCHAR(32),
    "platform_user_id" VARCHAR(128),
    "app_version" VARCHAR(32),
    "player_level" INTEGER NOT NULL DEFAULT 1,
    "player_xp" INTEGER NOT NULL DEFAULT 0,
    "gems_balance" INTEGER NOT NULL DEFAULT 0,
    "gold_balance" INTEGER NOT NULL DEFAULT 0,
    "best_score" INTEGER NOT NULL DEFAULT 0,
    "best_run_id" UUID,
    "rank_position_cached" INTEGER,
    "trust_score" INTEGER NOT NULL DEFAULT 100,
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "ban_reason" TEXT,
    "ban_until" TIMESTAMPTZ(6),
    "first_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessions_count" INTEGER NOT NULL DEFAULT 0,
    "total_playtime_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "nickname_snapshot" VARCHAR(16) NOT NULL,
    "score" INTEGER NOT NULL,
    "seed" VARCHAR(128) NOT NULL,
    "run_seed" BIGINT NOT NULL,
    "run_time_ms" INTEGER NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "current_floor" INTEGER NOT NULL,
    "start_class" "PlayerClass" NOT NULL,
    "start_deck" JSONB NOT NULL,
    "start_relics" JSONB NOT NULL,
    "end_class" "PlayerClass" NOT NULL,
    "end_deck" JSONB NOT NULL,
    "end_relics" JSONB NOT NULL,
    "floor_events" JSONB NOT NULL,
    "nodes_state" JSONB NOT NULL,
    "inputs_hash" VARCHAR(256),
    "proof_hash" VARCHAR(256),
    "flags" JSONB,
    "run_result" "RunResult" NOT NULL DEFAULT 'finished',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard" (
    "user_id" VARCHAR(64) NOT NULL,
    "player_id" UUID NOT NULL,
    "nickname" VARCHAR(16) NOT NULL,
    "best_score" INTEGER NOT NULL DEFAULT 0,
    "best_run_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leaderboard_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "run_events" (
    "id" BIGSERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "floor" INTEGER NOT NULL,
    "node_type" VARCHAR(32) NOT NULL,
    "event_id" INTEGER,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_versions" (
    "id" UUID NOT NULL,
    "content_type" "ContentType" NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "checksum_sha256" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" INTEGER NOT NULL,
    "card_class" VARCHAR(32) NOT NULL,
    "rarity" VARCHAR(32) NOT NULL,
    "tier" VARCHAR(32) NOT NULL,
    "name_es" VARCHAR(128) NOT NULL,
    "name_en" VARCHAR(128) NOT NULL,
    "image" VARCHAR(256) NOT NULL,
    "gold_coins" INTEGER NOT NULL DEFAULT 0,
    "red_coins" INTEGER NOT NULL DEFAULT 0,
    "life_cost" INTEGER NOT NULL DEFAULT 0,
    "additional_cost" INTEGER NOT NULL DEFAULT 0,
    "attack" INTEGER,
    "speed" INTEGER,
    "health" INTEGER,
    "skill1" VARCHAR(64),
    "skill2" VARCHAR(64),
    "skill3" VARCHAR(64),
    "skill_value1" INTEGER,
    "skill_value2" INTEGER,
    "skill_value3" INTEGER,
    "displayed_text" TEXT,
    "condition" VARCHAR(64),
    "target" VARCHAR(64),
    "effect1" VARCHAR(64),
    "effect2" VARCHAR(64),
    "effect3" VARCHAR(64),
    "value1" INTEGER,
    "value2" INTEGER,
    "value3" INTEGER,
    "turn_duration1" INTEGER,
    "turn_duration2" INTEGER,
    "turn_duration3" INTEGER,
    "chance1" INTEGER,
    "chance2" INTEGER,
    "chance3" INTEGER,
    "priority1" INTEGER,
    "priority2" INTEGER,
    "priority3" INTEGER,
    "type" "CardType" NOT NULL,
    "ethereal" BOOLEAN NOT NULL DEFAULT false,
    "content_version_id" UUID NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relics" (
    "id" INTEGER NOT NULL,
    "tier" VARCHAR(32) NOT NULL,
    "name_es" VARCHAR(128) NOT NULL,
    "name_en" VARCHAR(128) NOT NULL,
    "description" TEXT NOT NULL,
    "image" VARCHAR(256) NOT NULL,
    "rarity" VARCHAR(32) NOT NULL,
    "special_conditions" TEXT,
    "effect1" VARCHAR(64),
    "effect2" VARCHAR(64),
    "effect3" VARCHAR(64),
    "value1" INTEGER,
    "value2" INTEGER,
    "value3" INTEGER,
    "content_version_id" UUID NOT NULL,

    CONSTRAINT "relics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" INTEGER NOT NULL,
    "event_class" "EventClass" NOT NULL,
    "name_es" VARCHAR(128) NOT NULL,
    "name_en" VARCHAR(128) NOT NULL,
    "enemy_skill" VARCHAR(128),
    "enemy_explanation" TEXT,
    "deck" JSONB NOT NULL,
    "image" VARCHAR(256),
    "scene" VARCHAR(128),
    "health" INTEGER NOT NULL DEFAULT 0,
    "reward_multiplier" INTEGER NOT NULL DEFAULT 0,
    "relic_reward" INTEGER,
    "starting_gold_coins" INTEGER NOT NULL DEFAULT 0,
    "starting_cards_in_hand" INTEGER NOT NULL DEFAULT 0,
    "cards_per_turn" INTEGER NOT NULL DEFAULT 0,
    "discards_per_turn" INTEGER NOT NULL DEFAULT 0,
    "special_conditions" TEXT,
    "content_version_id" UUID NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "key_hash" VARCHAR(128) NOT NULL,
    "scope" "ApiKeyScope" NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_logs" (
    "id" BIGSERIAL NOT NULL,
    "request_id" UUID NOT NULL,
    "path" VARCHAR(128) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "user_id" VARCHAR(64),
    "ip_hash" VARCHAR(128),
    "status_code" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "error_code" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_flags" (
    "id" BIGSERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "rule_code" VARCHAR(64) NOT NULL,
    "severity" "FraudSeverity" NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_events" (
    "id" BIGSERIAL NOT NULL,
    "event_id" UUID NOT NULL,
    "event_name" "TelemetryEventName" NOT NULL,
    "event_ts" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" VARCHAR(64),
    "player_id" UUID,
    "run_id" UUID,
    "app_version" VARCHAR(32),
    "platform" VARCHAR(32),
    "session_id" VARCHAR(64),
    "floor" INTEGER,
    "node_type" VARCHAR(32),
    "event_payload" JSONB,
    "source" "TelemetrySource" NOT NULL,
    "trust_level" "TelemetryTrustLevel" NOT NULL DEFAULT 'high',

    CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_user_id_key" ON "players"("user_id");

-- CreateIndex
CREATE INDEX "players_best_score_idx" ON "players"("best_score" DESC);

-- CreateIndex
CREATE INDEX "players_last_seen_idx" ON "players"("last_seen" DESC);

-- CreateIndex
CREATE INDEX "players_is_banned_is_flagged_idx" ON "players"("is_banned", "is_flagged");

-- CreateIndex
CREATE INDEX "runs_user_id_created_at_idx" ON "runs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "runs_score_created_at_idx" ON "runs"("score" DESC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "runs_run_seed_idx" ON "runs"("run_seed");

-- CreateIndex
CREATE INDEX "runs_version_idx" ON "runs"("version");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_player_id_key" ON "leaderboard"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_best_run_id_key" ON "leaderboard"("best_run_id");

-- CreateIndex
CREATE INDEX "leaderboard_best_score_updated_at_idx" ON "leaderboard"("best_score" DESC, "updated_at" ASC);

-- CreateIndex
CREATE INDEX "run_events_run_id_floor_idx" ON "run_events"("run_id", "floor");

-- CreateIndex
CREATE INDEX "run_events_node_type_idx" ON "run_events"("node_type");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_content_type_version_key" ON "content_versions"("content_type", "version");

-- CreateIndex
CREATE INDEX "cards_content_version_id_idx" ON "cards"("content_version_id");

-- CreateIndex
CREATE INDEX "relics_content_version_id_idx" ON "relics"("content_version_id");

-- CreateIndex
CREATE INDEX "events_content_version_id_idx" ON "events"("content_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "request_logs_created_at_idx" ON "request_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "request_logs_path_method_idx" ON "request_logs"("path", "method");

-- CreateIndex
CREATE INDEX "request_logs_status_code_created_at_idx" ON "request_logs"("status_code", "created_at" DESC);

-- CreateIndex
CREATE INDEX "fraud_flags_run_id_idx" ON "fraud_flags"("run_id");

-- CreateIndex
CREATE INDEX "fraud_flags_user_id_created_at_idx" ON "fraud_flags"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "fraud_flags_severity_created_at_idx" ON "fraud_flags"("severity", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_events_event_id_key" ON "telemetry_events"("event_id");

-- CreateIndex
CREATE INDEX "telemetry_events_event_ts_idx" ON "telemetry_events"("event_ts" DESC);

-- CreateIndex
CREATE INDEX "telemetry_events_user_id_event_ts_idx" ON "telemetry_events"("user_id", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "telemetry_events_run_id_event_ts_idx" ON "telemetry_events"("run_id", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "telemetry_events_event_name_event_ts_idx" ON "telemetry_events"("event_name", "event_ts" DESC);

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_best_run_id_fkey" FOREIGN KEY ("best_run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard" ADD CONSTRAINT "leaderboard_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard" ADD CONSTRAINT "leaderboard_best_run_id_fkey" FOREIGN KEY ("best_run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relics" ADD CONSTRAINT "relics_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
