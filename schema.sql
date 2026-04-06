-- ABOUTME: Supabase schema for RENI's Arcade — extensible game registry and scores.
-- ABOUTME: Add new games by inserting into the games table; no schema changes needed.

-- ── Tables ────────────────────────────────────────────────────────────────────

-- Game registry. ui_config describes what the score entry form collects.
-- Adding a new game: INSERT a row here + add win rules in app.js WIN_RULES.
CREATE TABLE games (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  url              TEXT NOT NULL,
  embeddable       BOOLEAN NOT NULL DEFAULT false,
  difficulty_label TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  -- ui_config shape:
  --   has_time:       boolean  — show time input
  --   has_completion: boolean  — show completed checkbox
  --   has_share_paste:boolean  — show paste-share-text area
  --   extra_fields:   array of { name, label, input_type, min?, max? }
  ui_config        JSONB NOT NULL DEFAULT '{}',
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Players. Extend by inserting new rows.
CREATE TABLE players (
  id           TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- One score row per player per game per day.
CREATE TABLE scores (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game         TEXT NOT NULL REFERENCES games(id),
  player       TEXT NOT NULL REFERENCES players(id),
  played_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  time_seconds INTEGER,
  completed    BOOLEAN NOT NULL DEFAULT true,
  -- Game-specific fields (e.g. words_guessed, hits, guesses, mistakes)
  details      JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (game, player, played_date)
);

-- ── Seed data ─────────────────────────────────────────────────────────────────

INSERT INTO players (id, display_name) VALUES
  ('reid',   'Reid'),
  ('nianci', 'Nianci');

INSERT INTO games (id, name, description, url, embeddable, difficulty_label, sort_order, ui_config) VALUES
(
  'redactle',
  'Redactle',
  'Guess the Wikipedia article from redacted text',
  'https://redactle.net/',
  true,
  'MEDIUM',
  1,
  '{
    "has_time": true,
    "has_completion": false,
    "has_share_paste": true,
    "extra_fields": [
      {"name": "words_guessed", "label": "WORDS GUESSED", "input_type": "number", "min": 1}
    ]
  }'
),
(
  'connections',
  'Connections',
  'Group 16 words into 4 categories',
  'https://www.nytimes.com/games/connections',
  false,
  'NYT',
  2,
  '{
    "has_time": false,
    "has_completion": true,
    "has_share_paste": true,
    "extra_fields": [
      {"name": "mistakes", "label": "MISTAKES (0-4)", "input_type": "number", "min": 0, "max": 4}
    ]
  }'
),
(
  'flickle',
  'Flickle',
  'Guess the movie from screenshots',
  'https://flickle.app/',
  true,
  'DAILY',
  3,
  '{
    "has_time": false,
    "has_completion": true,
    "has_share_paste": true,
    "extra_fields": [
      {"name": "guesses", "label": "GUESSES (1-6)", "input_type": "number", "min": 1, "max": 6}
    ]
  }'
),
(
  'mini',
  'Mini Crossword',
  '5x5 daily crossword',
  'https://www.latimes.com/games/mini-crossword',
  false,
  'LA TIMES',
  4,
  '{
    "has_time": true,
    "has_completion": false,
    "has_share_paste": true,
    "extra_fields": []
  }'
);

-- ── Row-level security ────────────────────────────────────────────────────────
-- Open read for everyone; open write for scores (no auth yet).

ALTER TABLE games   ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read"   ON games   FOR SELECT USING (true);
CREATE POLICY "public read"   ON players FOR SELECT USING (true);
CREATE POLICY "public read"   ON scores  FOR SELECT USING (true);
CREATE POLICY "public insert" ON scores  FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON scores  FOR UPDATE USING (true) WITH CHECK (true);
