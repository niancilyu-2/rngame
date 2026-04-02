// ABOUTME: Main app logic — loads scores from Supabase, renders leaderboard and tiles,
// ABOUTME: and handles score entry via modal form.

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GAMES = ['redactle', 'connections', 'flickle', 'mini'];

const GAME_LABELS = {
  redactle:    'Redactle',
  connections: 'Connections',
  flickle:     'Flickle',
  mini:        'Mini Crossword',
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ── Score formatting ──────────────────────────────────────────────────────────

function fmtTime(seconds) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function parseTime(str) {
  // Accepts "4:32" → 272 seconds
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function scoreSummary(row) {
  // Returns a short human-readable string for a score row.
  if (!row) return '—';
  const parts = [];
  if (row.time_seconds != null) parts.push(fmtTime(row.time_seconds));
  if (row.game === 'redactle' && row.details) {
    const { words_guessed, hits } = row.details;
    if (words_guessed != null && hits != null) {
      const pct = Math.round((hits / words_guessed) * 100);
      parts.push(`${hits}/${words_guessed} (${pct}%)`);
    }
  }
  if (row.game === 'flickle' && row.details?.guesses != null) {
    parts.push(`${row.details.guesses}/6`);
  }
  if (row.completed === false) parts.push('DNF');
  return parts.join(' · ') || '—';
}

// ── Win determination ─────────────────────────────────────────────────────────
// Returns 'reid', 'nianci', or 'tie'. Returns null if either score is missing.

function determineWinner(game, reid, nianci) {
  if (!reid || !nianci) return null;

  if (game === 'redactle') {
    // Lower time wins; accuracy (hits/words_guessed) as tiebreaker
    if (reid.time_seconds !== nianci.time_seconds) {
      return reid.time_seconds < nianci.time_seconds ? 'reid' : 'nianci';
    }
    const rAcc = reid.details ? reid.details.hits / reid.details.words_guessed : 0;
    const nAcc = nianci.details ? nianci.details.hits / nianci.details.words_guessed : 0;
    if (rAcc !== nAcc) return rAcc > nAcc ? 'reid' : 'nianci';
    return 'tie';
  }

  if (game === 'connections') {
    // Completed beats DNF; then lower time wins
    if (reid.completed !== nianci.completed) {
      return reid.completed ? 'reid' : 'nianci';
    }
    if (reid.time_seconds !== nianci.time_seconds) {
      return reid.time_seconds < nianci.time_seconds ? 'reid' : 'nianci';
    }
    return 'tie';
  }

  if (game === 'flickle') {
    // Completed beats DNF; then fewer guesses; then lower time
    if (reid.completed !== nianci.completed) {
      return reid.completed ? 'reid' : 'nianci';
    }
    const rG = reid.details?.guesses ?? 7;
    const nG = nianci.details?.guesses ?? 7;
    if (rG !== nG) return rG < nG ? 'reid' : 'nianci';
    if (reid.time_seconds !== nianci.time_seconds) {
      return reid.time_seconds < nianci.time_seconds ? 'reid' : 'nianci';
    }
    return 'tie';
  }

  if (game === 'mini') {
    if (reid.time_seconds !== nianci.time_seconds) {
      return reid.time_seconds < nianci.time_seconds ? 'reid' : 'nianci';
    }
    return 'tie';
  }

  return null;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function resultBadge(winner, perspective) {
  // perspective: which player we're rendering results for (null for neutral)
  if (winner === 'tie') return `<span class="result-tie">Tie</span>`;
  if (!winner)          return `<span class="result-pending">Pending</span>`;
  if (!perspective)     return `<span class="result-win">${winner === 'reid' ? 'Reid' : 'Nianci'} wins</span>`;
  return winner === perspective
    ? `<span class="result-win">Win</span>`
    : `<span class="result-loss">Loss</span>`;
}

function renderLeaderboard(scoresByGame) {
  const tbody = document.getElementById('leaderboard-body');
  document.getElementById('leaderboard-loading')?.remove();

  let reidWins = 0, nianciWins = 0;

  const rows = GAMES.map(game => {
    const reid   = scoresByGame[game]?.reid;
    const nianci = scoresByGame[game]?.nianci;
    const winner = determineWinner(game, reid, nianci);

    if (winner === 'reid')   reidWins++;
    if (winner === 'nianci') nianciWins++;

    return `<tr>
      <td>${GAME_LABELS[game]}</td>
      <td class="player-col reid">${scoreSummary(reid)}</td>
      <td class="player-col nianci">${scoreSummary(nianci)}</td>
      <td>${resultBadge(winner, null)}</td>
    </tr>`;
  });

  tbody.innerHTML = rows.join('');

  // Totals row
  document.getElementById('reid-wins').textContent   = `${reidWins} W`;
  document.getElementById('nianci-wins').textContent = `${nianciWins} W`;
  const overall = reidWins > nianciWins ? 'Reid leads'
                : nianciWins > reidWins ? 'Nianci leads'
                : reidWins === 0        ? '—'
                : 'Tied';
  document.getElementById('overall-result').innerHTML = reidWins === nianciWins && reidWins > 0
    ? `<span class="result-tie">${overall}</span>`
    : reidWins > nianciWins
      ? `<span class="result-win">${overall}</span>`
      : nianciWins > reidWins
        ? `<span class="result-loss">${overall}</span>`
        : overall;
}

function renderTileScores(scoresByGame) {
  for (const game of GAMES) {
    const tile = document.querySelector(`.game-tile[data-game="${game}"]`);
    if (!tile) continue;
    for (const player of ['reid', 'nianci']) {
      const el  = tile.querySelector(`.score-val[data-player="${player}"]`);
      const row = scoresByGame[game]?.[player];
      if (el) el.textContent = scoreSummary(row);
    }
  }
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadToday() {
  const date = today();
  document.getElementById('leaderboard-date').textContent = formatDate(date);

  const { data, error } = await db
    .from('scores')
    .select('*')
    .eq('played_date', date);

  if (error) {
    console.error('Failed to load scores:', error);
    document.getElementById('leaderboard-body').innerHTML =
      '<tr><td colspan="4">Failed to load scores.</td></tr>';
    return;
  }

  // Index by game → player
  const byGame = {};
  for (const game of GAMES) byGame[game] = {};
  for (const row of data) {
    if (byGame[row.game]) byGame[row.game][row.player] = row;
  }

  renderLeaderboard(byGame);
  renderTileScores(byGame);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

let activeGame = null;

function openModal(game) {
  activeGame = game;
  document.getElementById('modal-title').textContent = `Log Score — ${GAME_LABELS[game]}`;
  document.getElementById('score-date').value = today();
  document.getElementById('form-error').classList.add('hidden');

  // Show/hide game-specific fields
  document.getElementById('completed-field').classList.toggle('hidden',
    game !== 'connections' && game !== 'flickle');
  document.getElementById('redactle-fields').classList.toggle('hidden', game !== 'redactle');
  document.getElementById('flickle-fields').classList.toggle('hidden',  game !== 'flickle');

  // Pre-select saved player preference
  const saved = localStorage.getItem('rngame-player');
  if (saved) {
    const radio = document.querySelector(`input[name="player"][value="${saved}"]`);
    if (radio) radio.checked = true;
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal(event) {
  if (event && event.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('score-form').reset();
  activeGame = null;
}

async function submitScore(event) {
  event.preventDefault();
  const form   = event.target;
  const errEl  = document.getElementById('form-error');
  errEl.classList.add('hidden');

  const player = form.player.value;
  const date   = form.date.value;
  const timeRaw = form.time.value.trim();
  const game   = activeGame;

  // Persist player preference
  localStorage.setItem('rngame-player', player);

  const row = { game, player, played_date: date, completed: true };

  if (timeRaw) {
    const secs = parseTime(timeRaw);
    if (secs === null) {
      showError(errEl, 'Time must be in mm:ss format (e.g. 4:32)');
      return;
    }
    row.time_seconds = secs;
  }

  if (game === 'connections' || game === 'flickle') {
    row.completed = form.completed.checked;
  }

  if (game === 'redactle') {
    const wg = parseInt(form.words_guessed.value, 10);
    const h  = parseInt(form.hits.value, 10);
    if (isNaN(wg) || isNaN(h)) {
      showError(errEl, 'Words guessed and hits are required for Redactle');
      return;
    }
    if (h > wg) {
      showError(errEl, 'Hits cannot exceed words guessed');
      return;
    }
    row.details = { words_guessed: wg, hits: h };
  }

  if (game === 'flickle' && form.guesses.value) {
    row.details = { ...(row.details || {}), guesses: parseInt(form.guesses.value, 10) };
  }

  const { error } = await db
    .from('scores')
    .upsert(row, { onConflict: 'game,player,played_date' });

  if (error) {
    showError(errEl, `Save failed: ${error.message}`);
    return;
  }

  document.getElementById('modal-overlay').classList.add('hidden');
  form.reset();
  activeGame = null;
  await loadToday();
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadToday();
