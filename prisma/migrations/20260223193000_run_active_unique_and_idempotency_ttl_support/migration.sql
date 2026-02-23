CREATE UNIQUE INDEX IF NOT EXISTS runs_one_in_progress_per_player_idx
ON runs (player_id)
WHERE status = 'in_progress';
