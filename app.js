// ABOUTME: Main app logic — pixel art avatars, score rendering, iframe game loader,
// ABOUTME: and score entry modal backed by Supabase.

// Game config loaded from DB (or fallback). Set by loadConfig().
let GAME_CONFIG = [];

// Fallback used when Supabase isn't configured (demo mode).
const GAME_FALLBACK = [
  {
    id: 'redactle', name: 'Redactle',
    description: 'Guess the Wikipedia article from redacted text',
    url: 'https://redactle.net/', embeddable: true,
    difficulty_label: 'MEDIUM', sort_order: 1,
    ui_config: {
      has_time: true, has_completion: false, has_share_paste: true,
      extra_fields: [
        { name: 'words_guessed', label: 'WORDS GUESSED', input_type: 'number', min: 1 },
        { name: 'hits',          label: 'HITS',          input_type: 'number', min: 0 },
      ],
    },
  },
  {
    id: 'connections', name: 'Connections',
    description: 'Group 16 words into 4 categories',
    url: 'https://www.nytimes.com/games/connections', embeddable: false,
    difficulty_label: 'NYT', sort_order: 2,
    ui_config: { has_time: true, has_completion: true, has_share_paste: true, extra_fields: [] },
  },
  {
    id: 'flickle', name: 'Flickle',
    description: 'Guess the movie from screenshots',
    url: 'https://flickle.app/', embeddable: true,
    difficulty_label: 'DAILY', sort_order: 3,
    ui_config: {
      has_time: true, has_completion: true, has_share_paste: true,
      extra_fields: [
        { name: 'guesses', label: 'GUESSES (1-6)', input_type: 'number', min: 1, max: 6 },
      ],
    },
  },
  {
    id: 'mini', name: 'Mini Crossword',
    description: '5x5 daily crossword',
    url: 'https://www.latimes.com/games/mini-crossword', embeddable: false,
    difficulty_label: 'LA TIMES', sort_order: 4,
    ui_config: { has_time: true, has_completion: false, has_share_paste: false, extra_fields: [] },
  },
];

// Win rules per game — ordered list applied by determineWinner().
// To add a new game: add an entry here. 'get' extracts the value from a score row.
// type: 'lower' (lower wins), 'higher' (higher wins), 'true' (true beats false)
const WIN_RULES = {
  redactle: [
    { type: 'lower',  get: r => r.time_seconds },
    { type: 'higher', get: r => r.details?.hits / (r.details?.words_guessed || 1) },
  ],
  connections: [
    { type: 'true',  get: r => r.completed },
    { type: 'lower', get: r => r.time_seconds },
  ],
  flickle: [
    { type: 'true',  get: r => r.completed },
    { type: 'lower', get: r => r.details?.guesses ?? 7 },
    { type: 'lower', get: r => r.time_seconds },
  ],
  mini: [
    { type: 'lower', get: r => r.time_seconds },
  ],
};

// Guard: createClient throws if the URL is not a valid URL (e.g. placeholder).
let db = null;
try {
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.warn('Supabase not configured — running in demo mode.');
}

// ── Pixel art sprites ─────────────────────────────────────────────────────────
// Each sprite is a 16×16 grid. Two frames per character for idle animation.
// Palette key → hex color. '.' = transparent.

const REID_PALETTE = {
  'H': '#5c3317', 'h': '#7a4828',  // brown hair
  'S': '#f5c5a3', 's': '#e8aa88',  // skin
  'W': '#f0f0f0', 'w': '#d0d0d0',  // white gi
  'R': '#cc2200',                   // red headband
  'B': '#1a1a2a', 'b': '#3a3a4a',  // dark / belt
  '.': null,
};

// Frame 1: neutral stance
const REID_F1 = [
  '....HHHHHHHH....',
  '...HhhhhhhhH....',
  '..HhSSSSSSsH....',
  '..HhSBSSBSsH....',
  '..RRRRRRRRRR....',
  '...hSSSSSSh.....',
  '..WWWsSSsWWW....',
  '.WWWWWWWWWWWW...',
  '.WwWWWWWWWWwW...',
  '..bbbbbbbbbb....',
  '..WWW....WWW....',
  '.WWWW....WWWW...',
  '.WwWW....WWwW...',
  '..WWW....WWW....',
  '...ww....ww.....',
  '...BB....BB.....',
];

// Frame 2: guard up (arms raised slightly)
const REID_F2 = [
  '....HHHHHHHH....',
  '...HhhhhhhhH....',
  '..HhSSSSSSsH....',
  '..HhSBSSBSsH....',
  '..RRRRRRRRRR....',
  '...hSSSSSSh.....',
  '.WWWWsSSsWWWW...',
  'WWWWWWWWWWWWwW..',
  '.WwWWWWWWWWwW...',
  '..bbbbbbbbbb....',
  '..WWW....WWW....',
  '.WWWW....WWWW...',
  '..WwW....WWw....',
  '..WWW....WWW....',
  '...ww....ww.....',
  '...BB....BB.....',
];

const NIANCI_PALETTE = {
  'K': '#111111', 'k': '#2a2a2a',  // black hair
  'S': '#f0e0d0', 's': '#d8c4b0',  // pale skin
  'B': '#111133', 'b': '#1a1a55',  // dark blue outfit
  'G': '#d4a800',                   // gold ornament
  'E': '#111111',                   // eyes
  'L': '#cc0044',                   // lips
  '.': null,
};

// Frame 1: neutral stance
const NIANCI_F1 = [
  '....KKKKKKKK....',
  '...KKkkkkkKK....',
  '..GKKkkkkkKKG...',
  '...KSSSSSSsK....',
  '...KSESSESsK....',
  '....SSSSSSs.....',
  '....sSSLSSs.....',
  '...BbbbbbbbB....',
  '..BBBbbbbbBBB...',
  '.BBBBbBbBbBBBB..',
  '..BBB.....BBB...',
  '..BBB.....BBB...',
  '..sBB.....BBs...',
  '...sB.....Bs....',
  '...SS.....SS....',
  '...ss.....ss....',
];

// Frame 2: ready stance (shoulders back, fists raised)
const NIANCI_F2 = [
  '....KKKKKKKK....',
  '...KKkkkkkKK....',
  '..GKKkkkkkKKG...',
  '...KSSSSSSsK....',
  '...KSESSESsK....',
  '....SSSSSSs.....',
  '....sSSLSSs.....',
  '..BBbbbbbbbBB...',
  '.BBBBbbbbbBBBB..',
  'BBBBBbBbBbBBBBB.',
  '..BBB.....BBB...',
  '..BBB.....BBB...',
  '..sBB.....BBs...',
  '...sB.....Bs....',
  '...SS.....SS....',
  '....s.....s.....',
];

function drawSprite(canvasEl, sprite, palette) {
  const size = 16;
  canvasEl.width  = size;
  canvasEl.height = size;
  const ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      const hex = palette[sprite[row][col]];
      if (!hex) continue;
      ctx.fillStyle = hex;
      ctx.fillRect(col, row, 1, 1);
    }
  }
}

function initAvatars() {
  const reidCanvas   = document.createElement('canvas');
  const nianciCanvas = document.createElement('canvas');
  document.getElementById('avatar-reid').appendChild(reidCanvas);
  document.getElementById('avatar-nianci').appendChild(nianciCanvas);

  // Alternate between 2 frames at ~3fps for an idle animation
  let frame = 0;
  drawSprite(reidCanvas, REID_F1, REID_PALETTE);
  drawSprite(nianciCanvas, NIANCI_F1, NIANCI_PALETTE);

  setInterval(() => {
    frame = 1 - frame;
    drawSprite(reidCanvas,   frame ? REID_F2   : REID_F1,   REID_PALETTE);
    drawSprite(nianciCanvas, frame ? NIANCI_F2 : NIANCI_F1, NIANCI_PALETTE);
  }, 500);
}

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
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function scoreSummary(row) {
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
  if (row.game === 'connections' && row.details?.mistakes != null) {
    parts.push(`${row.details.mistakes} err`);
  }
  if (row.game === 'flickle' && row.details?.guesses != null) {
    parts.push(`${row.details.guesses}/6`);
  }
  if (row.completed === false) parts.push('DNF');
  return parts.join(' · ') || '—';
}

// ── Win determination ─────────────────────────────────────────────────────────

function determineWinner(gameId, reid, nianci) {
  if (!reid || !nianci) return null;
  const rules = WIN_RULES[gameId];
  if (!rules) return null;

  for (const rule of rules) {
    const r = rule.get(reid);
    const n = rule.get(nianci);
    if (r == null && n == null) continue;
    if (r == null) return 'nianci';
    if (n == null) return 'reid';
    if (r === n)   continue;
    if (rule.type === 'lower')  return r < n ? 'reid' : 'nianci';
    if (rule.type === 'higher') return r > n ? 'reid' : 'nianci';
    if (rule.type === 'true')   return r && !n ? 'reid' : !r && n ? 'nianci' : null;
  }
  return 'tie';
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function resultCell(winner) {
  if (winner === 'tie')  return `<span class="result-tie">TIE</span>`;
  if (!winner)           return `<span class="result-pending">PENDING</span>`;
  return winner === 'reid'
    ? `<span class="result-win">P1 WINS</span>`
    : `<span class="result-win">P2 WINS</span>`;
}

// Generates a game tile DOM element from a game config row.
function buildGameTile(game, num) {
  const el = document.createElement('div');
  el.className  = 'game-tile';
  el.dataset.game = game.id;
  el.innerHTML = `
    <div class="tile-top">
      <span class="tile-num">${String(num).padStart(2, '0')}</span>
      <span class="tile-badge">${game.difficulty_label || ''}</span>
    </div>
    <h3>${game.name.toUpperCase()}</h3>
    <p class="tile-desc">${game.description}</p>
    <div class="tile-scores">
      <div class="player-score reid"><span class="ps-label">P1</span><span class="score-val" data-player="reid">—</span></div>
      <div class="player-score nianci"><span class="ps-label">P2</span><span class="score-val" data-player="nianci">—</span></div>
    </div>
    <div class="tile-actions">
      <button class="btn-play">▶ PLAY</button>
      <button class="btn-log">+ SCORE</button>
    </div>`;
  el.querySelector('.btn-play').onclick = () => openGame(game.id);
  el.querySelector('.btn-log').onclick  = () => openModal(game.id);
  return el;
}

function renderGameTiles(scores = {}) {
  const grid = document.getElementById('game-grid');
  grid.innerHTML = '';
  GAME_CONFIG.forEach((game, i) => {
    grid.appendChild(buildGameTile(game, i + 1));
  });
  if (Object.keys(scores).length) renderTileScores(scores);
}

function renderLeaderboard(scoresByGame) {
  const tbody = document.getElementById('leaderboard-body');
  document.getElementById('leaderboard-loading')?.remove();

  let reidWins = 0, nianciWins = 0;

  const rows = GAME_CONFIG.map(game => {
    const reid   = scoresByGame[game.id]?.reid;
    const nianci = scoresByGame[game.id]?.nianci;
    const winner = determineWinner(game.id, reid, nianci);

    if (winner === 'reid')   reidWins++;
    if (winner === 'nianci') nianciWins++;

    const rClass = winner === 'reid'   ? 'result-win' : winner === 'nianci' ? 'result-loss' : '';
    const nClass = winner === 'nianci' ? 'result-win' : winner === 'reid'   ? 'result-loss' : '';

    return `<tr>
      <td>${game.name.toUpperCase()}</td>
      <td class="col-reid ${rClass}">${scoreSummary(reid)}</td>
      <td class="col-nianci ${nClass}">${scoreSummary(nianci)}</td>
      <td>${resultCell(winner)}</td>
    </tr>`;
  });

  tbody.innerHTML = rows.join('');

  document.getElementById('reid-wins').textContent   = `${reidWins} WIN${reidWins !== 1 ? 'S' : ''}`;
  document.getElementById('nianci-wins').textContent = `${nianciWins} WIN${nianciWins !== 1 ? 'S' : ''}`;

  const banner = document.getElementById('overall-banner');
  if (reidWins === 0 && nianciWins === 0) {
    banner.textContent = 'NO SCORES YET TODAY';
    banner.style.color = 'var(--muted)';
  } else if (reidWins > nianciWins) {
    banner.innerHTML = `<span style="color:var(--reid)">★ P1 REID LEADS ${reidWins}–${nianciWins} ★</span>`;
  } else if (nianciWins > reidWins) {
    banner.innerHTML = `<span style="color:var(--nianci)">★ P2 NIANCI LEADS ${nianciWins}–${reidWins} ★</span>`;
  } else {
    banner.innerHTML = `<span style="color:var(--yellow)">★ ALL TIED UP ${reidWins}–${nianciWins} ★</span>`;
  }
}

function renderTileScores(scoresByGame) {
  for (const game of GAME_CONFIG) {
    const tile = document.querySelector(`.game-tile[data-game="${game.id}"]`);
    if (!tile) continue;
    for (const player of ['reid', 'nianci']) {
      const el  = tile.querySelector(`.score-val[data-player="${player}"]`);
      const row = scoresByGame[game.id]?.[player];
      if (el) el.textContent = scoreSummary(row);
    }
  }
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadConfig() {
  if (!db) {
    GAME_CONFIG = GAME_FALLBACK;
    renderGameTiles();
    return;
  }

  const { data, error } = await db
    .from('games')
    .select('*')
    .eq('active', true)
    .order('sort_order');

  GAME_CONFIG = (!error && data?.length) ? data : GAME_FALLBACK;

  // ui_config comes back as a string from Supabase if not parsed
  GAME_CONFIG = GAME_CONFIG.map(g => ({
    ...g,
    ui_config: typeof g.ui_config === 'string' ? JSON.parse(g.ui_config) : g.ui_config,
  }));

  renderGameTiles();
}

async function loadToday() {
  const date = today();
  document.getElementById('leaderboard-date').textContent = formatDate(date);

  if (!db) {
    document.getElementById('leaderboard-body').innerHTML =
      '<tr><td colspan="4" class="loading-cell">DEMO MODE — CONFIGURE SUPABASE</td></tr>';
    return;
  }

  const { data, error } = await db
    .from('scores')
    .select('*')
    .eq('played_date', date);

  if (error) {
    console.error('Failed to load scores:', error);
    document.getElementById('leaderboard-body').innerHTML =
      '<tr><td colspan="4" class="loading-cell">FAILED TO LOAD SCORES</td></tr>';
    return;
  }

  const byGame = {};
  for (const game of GAME_CONFIG) byGame[game.id] = {};
  for (const row of data) {
    // scores table uses game_id / player_id in new schema
    const gid = row.game_id ?? row.game;
    const pid = row.player_id ?? row.player;
    if (byGame[gid]) byGame[gid][pid] = row;
  }

  renderLeaderboard(byGame);
  renderTileScores(byGame);
}

// ── Game iframe overlay ───────────────────────────────────────────────────────

let activeOverlayGame = null;

function openGame(game) {
  const url = GAME_URLS[game];
  activeOverlayGame = game;

  document.getElementById('game-overlay-title').textContent = GAME_LABELS[game];
  document.getElementById('game-overlay-external').href = url;
  document.getElementById('blocked-link').href = url;
  document.getElementById('game-overlay-log').onclick = () => openModal(game);
  document.getElementById('game-overlay').classList.remove('hidden');

  if (!GAME_EMBEDDABLE[game]) {
    // Known non-embeddable — skip the iframe entirely.
    document.getElementById('game-frame').classList.add('hidden');
    document.getElementById('game-blocked').classList.remove('hidden');
    return;
  }

  // Attempt to embed; fall back if the site blocks it.
  document.getElementById('game-frame').src = '';
  document.getElementById('game-blocked').classList.add('hidden');
  document.getElementById('game-frame').classList.remove('hidden');

  const frame = document.getElementById('game-frame');
  let loadTimer = null;

  frame.onload = () => {
    clearTimeout(loadTimer);
    try {
      const doc = frame.contentDocument;
      if (doc && doc.body && doc.body.innerHTML === '') showBlocked(url);
    } catch (e) {
      // Cross-origin and loaded successfully — no action needed.
    }
  };

  loadTimer = setTimeout(() => showBlocked(url), 8000);
  frame.src = url;
}

function showBlocked(url) {
  document.getElementById('game-frame').classList.add('hidden');
  document.getElementById('game-blocked').classList.remove('hidden');
}

function closeGame(event) {
  // Close when clicking the backdrop, or when called directly (no event)
  if (event && event.target !== document.getElementById('game-overlay')) return;
  document.getElementById('game-overlay').classList.add('hidden');
  document.getElementById('game-frame').src = '';
  activeOverlayGame = null;
}

// ── Share text parsers ────────────────────────────────────────────────────────
// Each parser returns an object with any fields it could extract.
// Unrecognised share text returns {}.

function parseRedactle(text) {
  // Share format: "Redactle #N X/Y (Z%)" where X=hits, Y=total guesses, Z=accuracy
  const out = {};

  const fractionMatch = text.match(/(\d+)\/(\d+)/);
  if (fractionMatch) {
    out.hits          = parseInt(fractionMatch[1], 10);
    out.words_guessed = parseInt(fractionMatch[2], 10);
  }

  // Accuracy % can let us derive hits even if fraction is absent
  const pctMatch = text.match(/([\d.]+)%/);
  if (pctMatch && out.words_guessed && !fractionMatch) {
    out.hits = Math.round(out.words_guessed * parseFloat(pctMatch[1]) / 100);
  }

  // Time might appear as mm:ss even though it's not in standard share
  const timeMatch = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (timeMatch) out.time_seconds = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);

  return out;
}

function parseConnections(text) {
  // Share format: header line + emoji grid rows using 🟨🟩🟦🟪
  const COLORS = '🟨🟩🟦🟪';
  const rows = text.split('\n').map(l => [...l].filter(c => COLORS.includes(c))).filter(r => r.length === 4);

  if (rows.length === 0) return {};

  const isUniform = row => new Set(row).size === 1;
  const uniformCount = rows.filter(isUniform).length;
  const completed = uniformCount === 4;
  const mistakes  = rows.length - (completed ? 4 : uniformCount);

  return { completed, mistakes };
}

function parseFlickle(text) {
  // Share format: "#Flickle #N 🎬[squares]…" where 🟥=wrong 🟩=correct ⬜=unused
  const match = text.match(/🎬([🟥🟩⬜\s]+)/u);
  if (!match) return {};

  const squares = [...match[1]].filter(c => '🟥🟩⬜'.includes(c));
  const greenIdx = squares.indexOf('🟩');

  if (greenIdx === -1) return { completed: false, guesses: squares.filter(c => c === '🟥').length || 6 };
  return { completed: true, guesses: greenIdx + 1 };
}

function parseShareText(game, text) {
  if (!text.trim()) return null;
  switch (game) {
    case 'redactle':    return parseRedactle(text);
    case 'connections': return parseConnections(text);
    case 'flickle':     return parseFlickle(text);
    default:            return {};
  }
}

function applyParsed(game, parsed) {
  const resultEl = document.getElementById('parse-result');
  const form     = document.getElementById('score-form');

  if (!parsed || Object.keys(parsed).length === 0) {
    resultEl.textContent = '✕ COULD NOT PARSE — FILL MANUALLY';
    resultEl.className   = 'error';
    resultEl.classList.remove('hidden');
    return;
  }

  const lines = [];

  if (parsed.time_seconds != null) {
    form.time.value = fmtTime(parsed.time_seconds);
    lines.push(`TIME: ${fmtTime(parsed.time_seconds)}`);
  }

  if (parsed.completed != null) {
    form.completed.checked = parsed.completed;
    lines.push(`COMPLETED: ${parsed.completed ? 'YES' : 'NO'}`);
  }

  if (game === 'redactle') {
    if (parsed.words_guessed != null) {
      form.words_guessed.value = parsed.words_guessed;
      lines.push(`WORDS GUESSED: ${parsed.words_guessed}`);
    }
    if (parsed.hits != null) {
      form.hits.value = parsed.hits;
      lines.push(`HITS: ${parsed.hits}`);
    }
  }

  if (game === 'connections' && parsed.mistakes != null) {
    lines.push(`MISTAKES: ${parsed.mistakes}`);
    // Store mistakes for saving in details
    form.dataset.mistakes = parsed.mistakes;
  }

  if (game === 'flickle' && parsed.guesses != null) {
    form.guesses.value = parsed.guesses;
    lines.push(`GUESSES: ${parsed.guesses}/6`);
  }

  if (lines.length === 0) {
    resultEl.textContent = '✕ COULD NOT PARSE — FILL MANUALLY';
    resultEl.className   = 'error';
  } else {
    resultEl.innerHTML = '✓ PARSED: ' + lines.join(' · ');
    resultEl.className = '';
  }
  resultEl.classList.remove('hidden');
}

// ── Score modal ───────────────────────────────────────────────────────────────

let activeGame = null;

function openModal(gameId) {
  activeGame = gameId;
  const game = GAME_CONFIG.find(g => g.id === gameId);
  const cfg  = game?.ui_config ?? {};

  document.getElementById('modal-title').textContent = `LOG — ${game?.name?.toUpperCase() ?? gameId}`;
  document.getElementById('score-date').value = today();
  document.getElementById('form-error').classList.add('hidden');
  document.getElementById('parse-result').classList.add('hidden');
  document.getElementById('paste-input').value = '';
  delete document.getElementById('score-form').dataset.mistakes;

  // Paste section: hide for games without share text
  const noPaste = !cfg.has_share_paste;
  document.getElementById('paste-section').classList.toggle('hidden', noPaste);
  document.getElementById('score-form').querySelector('.form-divider').classList.toggle('hidden', noPaste);

  // Time field
  document.getElementById('time-field').classList.toggle('hidden', !cfg.has_time);

  // Completed checkbox
  document.getElementById('completed-field').classList.toggle('hidden', !cfg.has_completion);

  // Build extra fields from ui_config
  const extraEl = document.getElementById('extra-fields');
  extraEl.innerHTML = '';
  for (const field of cfg.extra_fields ?? []) {
    const label = document.createElement('label');
    const attrs = `type="${field.input_type}" name="${field.name}"` +
      (field.min != null ? ` min="${field.min}"` : '') +
      (field.max != null ? ` max="${field.max}"` : '');
    label.innerHTML = `${field.label}<input ${attrs} />`;
    extraEl.appendChild(label);
  }

  const saved = localStorage.getItem('rngame-player');
  if (saved) {
    const radio = document.querySelector(`input[name="player"][value="${saved}"]`);
    if (radio) radio.checked = true;
  }

  const pasteInput = document.getElementById('paste-input');
  pasteInput.oninput = () => applyParsed(gameId, parseShareText(gameId, pasteInput.value));

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
  const form  = event.target;
  const errEl = document.getElementById('form-error');
  errEl.classList.add('hidden');

  const player  = form.player.value;
  const date    = form.date.value;
  const timeRaw = form.time.value.trim();
  const game    = activeGame;

  localStorage.setItem('rngame-player', player);

  const game = GAME_CONFIG.find(g => g.id === activeGame);
  const cfg  = game?.ui_config ?? {};
  const row  = { game_id: activeGame, player_id: player, played_date: date, completed: true };

  if (timeRaw) {
    const secs = parseTime(timeRaw);
    if (secs === null) { showError(errEl, 'TIME MUST BE MM:SS (e.g. 4:32)'); return; }
    row.time_seconds = secs;
  }

  if (cfg.has_completion) row.completed = form.completed.checked;

  // Collect extra fields into details
  const extraFields = cfg.extra_fields ?? [];
  if (extraFields.length > 0 || form.dataset.mistakes != null) {
    row.details = {};
    for (const field of extraFields) {
      const val = form[field.name]?.value;
      if (val != null && val !== '') row.details[field.name] = Number(val);
    }
    // Mistakes parsed from share text (connections)
    if (form.dataset.mistakes != null) {
      row.details.mistakes = parseInt(form.dataset.mistakes, 10);
    }
  }

  // Redactle validation
  if (activeGame === 'redactle' && row.details) {
    const { words_guessed: wg, hits: h } = row.details;
    if (wg == null || h == null) { showError(errEl, 'WORDS GUESSED + HITS REQUIRED'); return; }
    if (h > wg) { showError(errEl, 'HITS CANNOT EXCEED WORDS GUESSED'); return; }
  }

  if (!db) { showError(errEl, 'SUPABASE NOT CONFIGURED'); return; }

  const { error } = await db
    .from('scores')
    .upsert(row, { onConflict: 'game,player,played_date' });

  if (error) { showError(errEl, `SAVE FAILED: ${error.message}`); return; }

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

initAvatars();
// loadConfig runs first (renders tiles), then loadToday fills in scores.
// Deferred so mock.js (loaded after this script) can override window.loadToday.
loadConfig().then(() => setTimeout(() => window.loadToday(), 0));
