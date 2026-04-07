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
      ],
    },
  },
  {
    id: 'connections', name: 'Connections',
    description: 'Group 16 words into 4 categories',
    url: 'https://www.nytimes.com/games/connections', embeddable: false,
    difficulty_label: 'NYT', sort_order: 2,
    ui_config: {
      has_time: false, has_completion: true, has_share_paste: true,
      extra_fields: [
        { name: 'mistakes', label: 'MISTAKES (0-4)', input_type: 'number', min: 0, max: 4 },
      ],
    },
  },
  {
    id: 'flickle', name: 'Flickle',
    description: 'Guess the movie from screenshots',
    url: 'https://flickle.app/', embeddable: true,
    difficulty_label: 'DAILY', sort_order: 3,
    ui_config: {
      has_time: false, has_completion: true, has_share_paste: true,
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
    ui_config: { has_time: true, has_completion: false, has_share_paste: true, extra_fields: [] },
  },
];

// Win rules per game — ordered list applied by determineWinner().
// To add a new game: add an entry here. 'get' extracts the value from a score row.
// type: 'lower' (lower wins), 'higher' (higher wins), 'true' (true beats false)
const WIN_RULES = {
  redactle: [
    { type: 'lower', get: r => r.details?.words_guessed },
    { type: 'lower', get: r => r.time_seconds },
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
  console.error('Supabase init failed:', e.message, '| URL:', SUPABASE_URL?.slice(0, 30));
}

// ── Pixel art sprites ─────────────────────────────────────────────────────────
// Each sprite is a 16×16 grid. Two frames per character for idle animation.
// Palette key → hex color. '.' = transparent.

const REID_PALETTE = {
  'H': '#5c3317', 'h': '#7a4828',  // brown hair
  'S': '#f5c5a3', 's': '#e8aa88',  // skin
  'W': '#f0f0f0', 'w': '#d0d0d0',  // white gi
  'B': '#1a1a2a', 'b': '#3a3a4a',  // dark / belt
  '.': null,
};

// Frame 1: neutral stance
const REID_F1 = [
  '....HHHHHHHH....',
  '...HhhhhhhhH....',
  '..HhSSSSSSsH....',
  '..HhSBSSBSsH....',
  '...hSSSSSSh.....',
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
  '...hSSSSSSh.....',
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
  'B': '#cc3388', 'b': '#881155',  // pink outfit
  'E': '#111111',                   // eyes
  'L': '#cc0044',                   // lips
  '.': null,
};

// Frame 1: neutral stance
const NIANCI_F1 = [
  '....KKKKKKKK....',
  '...KKkkkkkKKK...',
  '..KKKkkkkkKKKK..',
  '..KKSSSSSSsKK...',
  '..KKSESSESsKK...',
  '..KKSSSSSSsKK...',
  '..KKsSSLSSsKK...',
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
  '...KKkkkkkKKK...',
  '..KKKkkkkkKKKK..',
  '..KKSSSSSSsKK...',
  '..KKSESSESsKK...',
  '..KKSSSSSSsKK...',
  '..KKsSSLSSsKK...',
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

function formatDate(iso, includeYear = false) {
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (includeYear) opts.year = 'numeric';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', opts);
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
  if (row.game === 'redactle' && row.details?.words_guessed != null) {
    parts.push(`${row.details.words_guessed} guesses`);
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
    let anyPlayed = false;
    for (const player of ['reid', 'nianci']) {
      const el  = tile.querySelector(`.score-val[data-player="${player}"]`);
      const row = scoresByGame[game.id]?.[player];
      if (el) el.textContent = scoreSummary(row);
      if (row) anyPlayed = true;
    }
    tile.querySelector('.btn-play').classList.toggle('played', anyPlayed);
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
    const gid = row.game;
    const pid = row.player;
    if (byGame[gid]) byGame[gid][pid] = row;
  }

  renderLeaderboard(byGame);
  renderTileScores(byGame);
}

async function loadHistory() {
  if (!db) return;

  const { data, error } = await db
    .from('scores')
    .select('*')
    .order('played_date', { ascending: false });

  if (error || !data) return;

  // Group by date → game → player
  const byDate = {};
  for (const row of data) {
    const d = row.played_date;
    if (!byDate[d]) byDate[d] = {};
    if (!byDate[d][row.game]) byDate[d][row.game] = {};
    byDate[d][row.game][row.player] = row;
  }

  renderHistory(byDate);
}

function renderHistory(byDate) {
  const ticker = document.getElementById('history-ticker');
  ticker.innerHTML = '';
  ticker.classList.remove('scrolling');

  let reidDays = 0, nianciDays = 0;
  const dates = Object.keys(byDate).sort().reverse();
  const rowEls = [];

  dates.forEach((date, i) => {
    const gameScores = byDate[date];
    let reidWins = 0, nianciWins = 0;
    const reidGames = [], nianciGames = [];

    for (const game of GAME_CONFIG) {
      const scores = gameScores[game.id];
      if (!scores) continue;
      const winner = determineWinner(game.id, scores.reid, scores.nianci);
      if (winner === 'reid')   { reidWins++;   reidGames.push(game.name); }
      if (winner === 'nianci') { nianciWins++; nianciGames.push(game.name); }
    }

    let dayWinner = null;
    if (reidWins > nianciWins)      { dayWinner = 'reid';   reidDays++; }
    else if (nianciWins > reidWins) { dayWinner = 'nianci'; nianciDays++; }
    else if (reidWins > 0)          { dayWinner = 'tie'; }

    const div = document.createElement('div');
    div.className = `hist-row${dayWinner ? ' hist-' + dayWinner : ''}`;
    div.innerHTML = `
      <span class="hist-rank">${String(i + 1).padStart(2, '0')}</span>
      <span class="hist-date">${formatDate(date, true)}</span>
      <span class="hist-games col-reid">${reidGames.join(' · ') || '—'}</span>
      <span class="hist-games col-nianci">${nianciGames.join(' · ') || '—'}</span>
      <span class="hist-day">${resultCell(dayWinner)}</span>`;
    rowEls.push(div);
    ticker.appendChild(div);
  });

  if (rowEls.length === 0) {
    ticker.innerHTML = '<div class="loading-cell">NO HISTORY YET</div>';
  } else if (rowEls.length > 4) {
    // Duplicate rows for seamless infinite scroll
    rowEls.forEach(r => ticker.appendChild(r.cloneNode(true)));
    ticker.style.animationDuration = `${rowEls.length * 2.5}s`;
    ticker.classList.add('scrolling');
  }

  const leader = reidDays > nianciDays ? 'reid'
               : nianciDays > reidDays ? 'nianci'
               : 'tie';
  document.getElementById('history-totals').innerHTML = `
    <div class="htotal reid ${leader === 'reid' ? 'leader' : ''}">
      <span class="htotal-name">REID</span>
      <span class="htotal-num">${reidDays}</span>
    </div>
    <div class="htotal-vs">VS</div>
    <div class="htotal nianci ${leader === 'nianci' ? 'leader' : ''}">
      <span class="htotal-name">NIANCI</span>
      <span class="htotal-num">${nianciDays}</span>
    </div>`;
}

// ── Game iframe overlay ───────────────────────────────────────────────────────

let activeOverlayGame = null;

function openGame(gameId) {
  const gameCfg = GAME_CONFIG.find(g => g.id === gameId);
  const url = gameCfg?.url;
  activeOverlayGame = gameId;

  document.getElementById('game-overlay-title').textContent = gameCfg?.name?.toUpperCase() ?? gameId;
  document.getElementById('game-overlay-external').href = url;
  document.getElementById('blocked-link').href = url;
  document.getElementById('game-overlay-log').onclick = () => openModal(gameId);
  document.getElementById('game-overlay').classList.remove('hidden');

  if (!gameCfg?.embeddable) {
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
  // Format A: "I cracked Redactle #N in M guesses! 🎲 M | … ⏱️ Xs"
  // Format B: "37 guesses\n67.6% accuracy\n12m duration"
  const out = {};

  out.completed = /cracked/i.test(text);

  const guessMatch = text.match(/🎲\s*(\d+)/u) ?? text.match(/(\d+)\s+guesses?/i);
  if (guessMatch) out.words_guessed = parseInt(guessMatch[1], 10);

  // Time: ⏱️ 14s  |  MM:SS  |  12m duration  |  1h 12m duration
  const secMatch  = text.match(/⏱️\s*(\d+)s/u);
  const mmssMatch = text.match(/\b(\d{1,2}):(\d{2})\b/);
  const durMatch  = text.match(/(?:(\d+)h\s*)?(\d+)m\s+duration/i);
  if (secMatch) {
    out.time_seconds = parseInt(secMatch[1], 10);
  } else if (mmssMatch) {
    out.time_seconds = parseInt(mmssMatch[1], 10) * 60 + parseInt(mmssMatch[2], 10);
  } else if (durMatch) {
    out.time_seconds = (parseInt(durMatch[1] ?? 0, 10) * 60 + parseInt(durMatch[2], 10)) * 60;
  }

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
  // Share format: "#Flickle #N\n🎬[squares]" where ⬛=skipped 🟥=wrong 🟩=correct ❌=loss
  if (text.includes('❌')) return { completed: false };
  const match = text.match(/🎬([⬛🟥🟩]+)/u);
  if (!match) return {};
  const squares = [...match[1]];
  const greenIdx = squares.findIndex(c => c === '🟩');
  if (greenIdx === -1) return {};
  return { completed: true, guesses: greenIdx + 1 };
}
function parseMini(text) {
  // Share format: "Score\n259\nTime\n03:10"
  const match = text.match(/Time\s+(\d{1,2}):(\d{2})/i);
  if (!match) return {};
  return { completed: true, time_seconds: parseInt(match[1], 10) * 60 + parseInt(match[2], 10) };
}

function parseShareText(game, text) {
  if (!text.trim()) return null;
  switch (game) {
    case 'redactle':    return parseRedactle(text);
    case 'connections': return parseConnections(text);
    case 'flickle':     return parseFlickle(text);
    case 'mini':        return parseMini(text);
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

  if (game === 'redactle' && parsed.words_guessed != null) {
    form.words_guessed.value = parsed.words_guessed;
    lines.push(`WORDS GUESSED: ${parsed.words_guessed}`);
  }

  if (game === 'connections' && parsed.mistakes != null) {
    if (form.mistakes) form.mistakes.value = parsed.mistakes;
    lines.push(`MISTAKES: ${parsed.mistakes}`);
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

  localStorage.setItem('rngame-player', player);

  const game = GAME_CONFIG.find(g => g.id === activeGame);
  const cfg  = game?.ui_config ?? {};
  const row  = { game: activeGame, player: player, played_date: date, completed: true };

  if (timeRaw) {
    const secs = parseTime(timeRaw);
    if (secs === null) { showError(errEl, 'TIME MUST BE MM:SS (e.g. 4:32)'); return; }
    row.time_seconds = secs;
  }

  if (cfg.has_completion) row.completed = form.completed.checked;

  // Collect extra fields into details
  const extraFields = cfg.extra_fields ?? [];
  if (extraFields.length > 0) {
    row.details = {};
    for (const field of extraFields) {
      const val = form[field.name]?.value;
      if (val != null && val !== '') row.details[field.name] = Number(val);
    }
  }

  // Redactle validation
  if (activeGame === 'redactle' && !row.details?.words_guessed) {
    showError(errEl, 'WORDS GUESSED REQUIRED'); return;
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
loadConfig().then(() => setTimeout(() => {
  window.loadToday();
  loadHistory();
}, 0));
