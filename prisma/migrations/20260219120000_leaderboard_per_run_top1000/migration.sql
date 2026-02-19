-- Rebuild leaderboard table to store ranked runs instead of one best row per player
CREATE TABLE "leaderboard_new" (
    "id" BIGSERIAL NOT NULL,
    "run_id" UUID,
    "player_id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "nickname" VARCHAR(16) NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leaderboard_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "leaderboard_new" ("run_id", "player_id", "user_id", "nickname", "score", "created_at", "updated_at")
SELECT "best_run_id", "player_id", "user_id", "nickname", "best_score", "updated_at", "updated_at"
FROM "leaderboard";

DROP TABLE "leaderboard";
ALTER TABLE "leaderboard_new" RENAME TO "leaderboard";

CREATE UNIQUE INDEX "leaderboard_run_id_key" ON "leaderboard"("run_id");
CREATE INDEX "leaderboard_score_created_at_idx" ON "leaderboard"("score" DESC, "created_at" ASC);
CREATE INDEX "leaderboard_player_id_idx" ON "leaderboard"("player_id");
CREATE INDEX "leaderboard_user_id_idx" ON "leaderboard"("user_id");

ALTER TABLE "leaderboard" ADD CONSTRAINT "leaderboard_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leaderboard" ADD CONSTRAINT "leaderboard_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
