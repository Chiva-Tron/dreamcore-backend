-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlayerClass" AS ENUM ('titan', 'arcane', 'umbralist', 'no_class');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('in_progress', 'finished', 'abandoned');

-- CreateEnum
CREATE TYPE "RunResult" AS ENUM ('victory', 'loss');

-- CreateEnum
CREATE TYPE "SnapshotType" AS ENUM ('map', 'combat_strategy');

-- CreateEnum
CREATE TYPE "AbandonReason" AS ENUM ('new_run_started', 'crash_recovery', 'server_invalidation', 'manual_quit');

-- CreateEnum
CREATE TYPE "EventClass" AS ENUM ('enemy', 'boss', 'rest', 'shop', 'sacrifice', 'upgrade', 'beginning', 'exit', 'mystery');

-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('admin', 'internal');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('active', 'revoked', 'expired', 'disabled');

-- CreateEnum
CREATE TYPE "TelemetrySource" AS ENUM ('server', 'client', 'worker');

-- CreateEnum
CREATE TYPE "TelemetryTrustLevel" AS ENUM ('high', 'medium', 'low');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "nickname" VARCHAR(16) NOT NULL,
    "best_score" INTEGER NOT NULL DEFAULT 0,
    "best_run_id" UUID,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "ban_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(128) NOT NULL,
    "device_id" VARCHAR(128) NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "client_run_id" VARCHAR(64) NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'in_progress',
    "run_seed" BIGINT NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "current_floor" INTEGER NOT NULL DEFAULT 1,
    "start_class" "PlayerClass" NOT NULL,
    "end_class" "PlayerClass",
    "start_deck" JSONB NOT NULL,
    "start_relics" JSONB NOT NULL,
    "end_deck" JSONB,
    "end_relics" JSONB,
    "nodes_state" JSONB NOT NULL,
    "floor_events" JSONB NOT NULL,
    "run_time_ms" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "result" "RunResult",
    "abandon_reason" "AbandonReason",
    "inputs_hash" VARCHAR(256),
    "proof_hash" VARCHAR(256),
    "flags" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_snapshots" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "snapshot_type" "SnapshotType" NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard" (
    "id" BIGSERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "nickname" VARCHAR(16) NOT NULL,
    "score" INTEGER NOT NULL,
    "run_time_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leaderboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_versions" (
    "id" UUID NOT NULL,
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
    "type" VARCHAR(32) NOT NULL,
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
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(128) NOT NULL,
    "player_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" VARCHAR(128) NOT NULL,
    "response_payload" JSONB NOT NULL,
    "status_code" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_events" (
    "id" BIGSERIAL NOT NULL,
    "event_id" UUID NOT NULL,
    "event_name" VARCHAR(64) NOT NULL,
    "event_ts" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "player_id" UUID,
    "run_id" UUID,
    "app_version" VARCHAR(32),
    "platform" VARCHAR(32),
    "event_payload" JSONB,
    "source" "TelemetrySource" NOT NULL,
    "trust_level" "TelemetryTrustLevel" NOT NULL DEFAULT 'high',

    CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_logs" (
    "id" BIGSERIAL NOT NULL,
    "request_id" UUID NOT NULL,
    "path" VARCHAR(128) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "player_id" UUID,
    "ip_hash" VARCHAR(128),
    "status_code" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "error_code" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "players_account_id_key" ON "players"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "players_user_id_key" ON "players"("user_id");

-- CreateIndex
CREATE INDEX "players_best_score_idx" ON "players"("best_score" DESC);

-- CreateIndex
CREATE INDEX "players_is_banned_idx" ON "players"("is_banned");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_account_id_created_at_idx" ON "sessions"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "runs_player_id_status_updated_at_idx" ON "runs"("player_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "runs_score_finished_at_idx" ON "runs"("score" DESC, "finished_at" ASC);

-- CreateIndex
CREATE INDEX "runs_started_at_idx" ON "runs"("started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "runs_player_id_client_run_id_key" ON "runs"("player_id", "client_run_id");

-- CreateIndex
CREATE INDEX "run_snapshots_run_id_created_at_idx" ON "run_snapshots"("run_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_run_id_key" ON "leaderboard"("run_id");

-- CreateIndex
CREATE INDEX "leaderboard_score_run_time_ms_created_at_idx" ON "leaderboard"("score" DESC, "run_time_ms", "created_at" ASC);

-- CreateIndex
CREATE INDEX "leaderboard_player_id_idx" ON "leaderboard"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_version_key" ON "content_versions"("version");

-- CreateIndex
CREATE INDEX "content_versions_is_active_idx" ON "content_versions"("is_active");

-- CreateIndex
CREATE INDEX "cards_content_version_id_idx" ON "cards"("content_version_id");

-- CreateIndex
CREATE INDEX "relics_content_version_id_idx" ON "relics"("content_version_id");

-- CreateIndex
CREATE INDEX "events_content_version_id_idx" ON "events"("content_version_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_player_id_idempotency_key_key" ON "idempotency_keys"("scope", "player_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_events_event_id_key" ON "telemetry_events"("event_id");

-- CreateIndex
CREATE INDEX "telemetry_events_event_ts_idx" ON "telemetry_events"("event_ts" DESC);

-- CreateIndex
CREATE INDEX "telemetry_events_event_name_event_ts_idx" ON "telemetry_events"("event_name", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "telemetry_events_run_id_event_ts_idx" ON "telemetry_events"("run_id", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "request_logs_created_at_idx" ON "request_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "request_logs_path_method_idx" ON "request_logs"("path", "method");

-- CreateIndex
CREATE INDEX "request_logs_status_code_created_at_idx" ON "request_logs"("status_code", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_best_run_id_fkey" FOREIGN KEY ("best_run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_snapshots" ADD CONSTRAINT "run_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard" ADD CONSTRAINT "leaderboard_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard" ADD CONSTRAINT "leaderboard_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relics" ADD CONSTRAINT "relics_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

