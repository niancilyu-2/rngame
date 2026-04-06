// ABOUTME: Mock data for UI preview only — not used in production.
// ABOUTME: Overrides loadToday() to render sample scores without Supabase.

const MOCK_SCORES = {
  redactle: {
    reid:   { game_id: 'redactle', player_id: 'reid',   time_seconds: 263, completed: true, details: { words_guessed: 52, hits: 41 } },
    nianci: { game_id: 'redactle', player_id: 'nianci', time_seconds: 194, completed: true, details: { words_guessed: 38, hits: 35 } },
  },
  connections: {
    reid:   { game_id: 'connections', player_id: 'reid',   time_seconds: 187, completed: true  },
    nianci: { game_id: 'connections', player_id: 'nianci', time_seconds: 212, completed: false },
  },
  flickle: {
    reid:   { game_id: 'flickle', player_id: 'reid',   time_seconds: 95,  completed: true,  details: { guesses: 3 } },
    nianci: { game_id: 'flickle', player_id: 'nianci', time_seconds: 142, completed: true,  details: { guesses: 3 } },
  },
  mini: {
    reid:   { game_id: 'mini', player_id: 'reid',   time_seconds: 78,  completed: true },
    nianci: { game_id: 'mini', player_id: 'nianci', time_seconds: 104, completed: true },
  },
};

// Replace the real loader before it runs
window.loadToday = function () {
  const date = today();
  document.getElementById('leaderboard-date').textContent = formatDate(date);
  renderLeaderboard(MOCK_SCORES);
  renderTileScores(MOCK_SCORES);
};
