-- ABOUTME: Supabase schema for RN Games score tracking.
-- ABOUTME: One score row per player per game per day; game-specific data in details JSONB.

CREATE TYPE game_type AS ENUM ('redactle', 'connections', 'flickle', 'mini');
CREATE TYPE player_type AS ENUM ('reid', 'nianci');

CREATE TABLE scores (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  game         game_type   NOT NULL,
  player       player_type NOT NULL,
  played_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  time_seconds INTEGER,      -- null if not tracked or not completed
  completed    BOOLEAN     NOT NULL DEFAULT true,
  details      JSONB,        -- game-specific fields (see below)
  created_at   TIMESTAMPTZ DEFAULT NOW(),

  -- One entry per player per game per day
  UNIQUE (game, player, played_date)
);

-- details shape per game:
--   redactle:    { "words_guessed": int, "hits": int }
--   connections: {}  (time + completed are sufficient)
--   flickle:     { "guesses": int }
--   mini:        {}  (time only)

-- Row-level security: open read/write (no auth for now)
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read"
  ON scores FOR SELECT USING (true);

CREATE POLICY "public insert"
  ON scores FOR INSERT WITH CHECK (true);

CREATE POLICY "public update"
  ON scores FOR UPDATE USING (true) WITH CHECK (true);
