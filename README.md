# RN GAMES

Arcade-themed daily game leaderboard for two players (Reid & Nianci). Play daily puzzle games, log scores, and track who's winning.

## Games

- **Redactle** — Guess the Wikipedia article from redacted text
- **Connections** — Group 16 words into 4 categories
- **Flickle** — Guess the movie from screenshots
- **Mini Crossword** — 5x5 daily crossword

## Features

- Pixel art avatars with idle animations
- Score logging with share text auto-parsing (paste your game result and it fills the form)
- Daily leaderboard with win/loss tracking
- Cumulative history with all-time standings
- Taunts when someone takes a 2+ game lead
- Embedded game player (for sites that allow iframing)

## Setup

1. Create a [Supabase](https://supabase.com) project
2. Run `schema.sql` to create the tables
3. Copy `config.example.js` to `config.js` and fill in your Supabase URL and anon key
4. Serve the files (any static host works)

## Tech

Plain HTML/CSS/JS — no build step, no frameworks. Supabase handles the backend. All dates use US Eastern timezone.
