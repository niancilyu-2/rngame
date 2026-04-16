# The Build Story of RENI ARCADE

## What Is It?

RENI ARCADE is a two-player daily game leaderboard built for Reid and Nianci. Every day, both players compete in a set of online puzzle games, log their scores, and the site tracks who won each game and who's winning overall. Think of it as a personal scoreboard for your daily puzzle rivalry.

No frameworks, no build tools — just HTML, CSS, vanilla JS, and a Supabase database.

---

## The Games

Four daily puzzle games, each with its own scoring rules:

| Game | Source | What You Do | How You Win |
|------|--------|-------------|-------------|
| **Redactle** | redactle.net | Guess a Wikipedia article from redacted text | Fewest words guessed, then fastest time |
| **Connections** | NYT | Group 16 words into 4 categories | Must complete it, then fastest time |
| **Flickle** | flickle.app | Guess a movie from screenshots | Must complete it, then fewest guesses (1–6), then fastest time |
| **Mini Crossword** | LA Times | 5×5 daily crossword | Fastest time |

Redactle and Flickle can be played inside the site via iframe. Connections and Mini Crossword block embedding, so those open in a new tab.

---

## Win Logic

The win system is rule-based and extensible. Each game has an ordered list of comparison rules — the first rule that produces a difference decides the winner:

```
Redactle:    fewer words_guessed → faster time
Connections: completed beats DNF → faster time
Flickle:     completed beats DNF → fewer guesses → faster time
Mini:        faster time
```

Three rule types:
- **lower** — lower value wins (time, guesses)
- **higher** — higher value wins (not used yet, but supported)
- **true** — true beats false (completion)

If only one player has logged a score, they auto-win. If all rules tie, it's a tie. If a game has no rules defined, it shows "PENDING."

The daily winner is whoever wins more individual games that day. The cumulative leaderboard tracks day wins over time.

---

## Score Logging

Two ways to log a score:

### 1. Paste Share Text
Most daily games have a "share result" button that copies formatted text. Paste it into the modal and the parser auto-fills the form. Each game has its own parser:

- **Redactle**: Reads `🎲 37` for guesses, `⏱️ 120s` or `12m duration` for time
- **Connections**: Counts emoji grid rows (🟨🟩🟦🟪) — uniform rows = correct, extras = mistakes
- **Flickle**: Finds 🟩 position in the `🎬` sequence — position = guess number. ❌ = DNF
- **Mini**: Extracts `Time MM:SS` from the share block

### 2. Fill Manually
The form adapts per game based on `ui_config` stored in the database:
- **has_time**: shows MM:SS input
- **has_completion**: shows completed checkbox
- **has_share_paste**: shows paste textarea
- **extra_fields**: dynamically generates labeled inputs (e.g., "WORDS GUESSED", "MISTAKES (0-4)")

The player selection persists in localStorage so you don't have to pick yourself every time.

Scores upsert on `(game, player, date)` — logging again for the same game on the same day overwrites the previous entry.

---

## The Database

Three tables in Supabase (PostgreSQL):

**games** — Game registry with name, URL, embed flag, sort order, and `ui_config` (JSONB) that drives form generation.

**players** — Just `reid` and `nianci` with display names.

**scores** — One row per player per game per day. Stores `time_seconds`, `completed`, and a `details` JSONB column for game-specific fields (words_guessed, mistakes, guesses). Unique constraint on `(game, player, played_date)` enables upsert.

The app loads game config from the DB on startup, falling back to hardcoded defaults if Supabase is unreachable. Extra fields from the DB are filtered against the fallback config to prevent unexpected fields from appearing in the form.

---

## Pixel Art Avatars

Each player has a 16×16 pixel art sprite with two animation frames:

- **Reid**: Brown hair, white karate gi, dark belt. Frame 1 is neutral stance, frame 2 has arms raised in guard position.
- **Nianci**: Black hair, pink outfit. Frame 1 is neutral, frame 2 is a ready stance with shoulders back.

Sprites are stored as arrays of strings where each character maps to a hex color via a palette object. A `drawSprite()` function iterates the grid and fills 1×1 pixel rectangles on a canvas. CSS `image-rendering: pixelated` scales them up to 96×96px.

The avatars alternate frames every 500ms for an idle animation. Drawing skips when the browser tab is hidden to save resources.

---

## Taunt System

When one player leads by 2+ games in the daily scoreboard, the winning player's avatar gets a speech bubble with a random taunt:

> SKILL ISSUE · YOU ARE COOKED · GET REKT · TOO EASY · I MISS U :3 · TRY HARDER · I LOVE YA · HI BB

The bubble floats with a gentle bounce animation and has an arrow pointing toward the player's card. On desktop it appears beside the card; on mobile it floats above.

---

## Timezone Handling

All dates use **US Eastern time** (America/New_York). The `today()` function uses `toLocaleDateString` with the `en-CA` locale (which gives YYYY-MM-DD format) and the `America/New_York` timezone. This means both players always see the same "today" regardless of where they are, and the date rolls over at midnight Eastern.

---

## The Leaderboard

### Daily View
A table showing each game with both players' score summaries and the result (P1 WINS / P2 WINS / TIE / PENDING). Score summaries combine time, game-specific metrics, and DNF status with `·` separators.

Above the table: player cards with pixel art avatars and win counts. Below: a banner announcing who's leading (or if it's tied). The banner glows in the leader's color — orange for Reid, green for Nianci, yellow for ties.

### History View
A scrollable list of all past days, showing which games each player won and the overall day result. Running totals at the top track cumulative day wins. The leading player's total has a glow effect.

---

## Game Embedding

Clicking "PLAY" on a game tile opens a full-screen overlay. If the game is marked `embeddable: true`, it loads in a sandboxed iframe (`allow-scripts allow-same-origin allow-forms allow-popups`). 

The embed detection works in two stages:
1. **On load**: tries to access `frame.contentDocument` — if it throws (cross-origin), the game loaded successfully. If the body is empty, it's blocked.
2. **Timeout**: if nothing loads within 8 seconds, shows a "this site doesn't allow embedding" message with a link to open in a new tab.

Games marked `embeddable: false` skip the iframe entirely and go straight to the blocked message.

---

## Visual Design

Arcade aesthetic throughout:
- **Font**: Press Start 2P (pixel font from Google Fonts)
- **Color scheme**: Dark background (#0a0a14), orange for Reid (#ff6622), green for Nianci (#22cc66), yellow accents (#ffcc00)
- **Effects**: Scanline overlay via repeating gradient, pulsing glow animations on avatars and banners, pixel heart cursor
- **Marquee**: Instructions scroll across the header — "CLICK ▶ PLAY · FINISH THE GAME · COPY YOUR RESULT · CLICK + SCORE & PASTE". The marquee clones its content to fill the viewport and animates by exactly one item width for seamless looping.

---

## Adding a New Game

To add a new game, you need:

1. **Database**: Insert a row into the `games` table with `ui_config` defining the form fields
2. **Win rules**: Add an entry to `WIN_RULES` in app.js with comparison rules
3. **Share parser** (optional): Add a `parseGameName()` function and a case in `parseShareText()`
4. **Score summary** (optional): Add formatting logic in `scoreSummary()` for the game's specific fields

The form, tiles, and leaderboard all generate dynamically from the game config — no HTML changes needed.

---

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS, zero dependencies
- **Backend**: Supabase (PostgreSQL + REST API + Row Level Security)
- **Hosting**: GitHub Pages (static files served from the repo)
- **Fonts**: Google Fonts CDN (Press Start 2P)
- **Supabase SDK**: CDN-hosted UMD bundle
