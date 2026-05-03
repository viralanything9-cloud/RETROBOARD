/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RETROBOARD - RETRO ARCADE JS (fixed card states)
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const icons = ['\u{1F319}','\u2B50','\u2600\uFE0F','\u{1F30D}','\u{1F680}','\u{1F6F8}','\u{1F30C}','\u{1F320}','\u{1F6F0}\uFE0F','\u2604','\u{1F48E}','\u{1F52E}','\u26A1','\u{1F525}','\u{1F30A}'];

const difficulties = {
  easy:   { cols: 4, pairs: 6,  label: 'EASY',    timeLimit: null },
  medium: { cols: 4, pairs: 8,  label: 'MEDIUM',   timeLimit: null },
  hard:   { cols: 5, pairs: 10, label: 'HARD',     timeLimit: null },
  insane: { cols: 6, pairs: 15, label: 'INSANE',   timeLimit: null },
  blitz:  { cols: 4, pairs: 8,  label: 'BLITZ',  timeLimit: 22  },
};

let first=null, second=null, lock=false;
let moves=0, seconds=0, minutes=0;
let gameTimer=null, running=false;
let player='', sessionToken='', difficulty='easy';
let matched=0, totalPairs=0;
let combo=0, comboMax=0, score=0;
let soundEnabled=true;
let blitzInterval=null, blitzRemaining=0;
let hasStarted=false;
let authMode='login';

const board       = document.getElementById('gameBoard');
const movesEl     = document.getElementById('movesDisplay');
const timerEl     = document.getElementById('timerDisplay');
const playerLabel = document.getElementById('playerLabel');
const scoreEl     = document.getElementById('scoreDisplay');
const pairsEl     = document.getElementById('pairsLeft');
const diffLbl     = document.getElementById('diffLabel');
const currentScoreEl = document.getElementById('currentScore');
const currentComboEl = document.getElementById('currentCombo');
const comboMsg    = document.getElementById('comboMsg');
const authPanel   = document.getElementById('authPanel');
const setupPanel  = document.getElementById('setupPanel');
const authUsernameInput = document.getElementById('authUsername');
const authPasswordInput = document.getElementById('authPassword');
const authConfirmInput  = document.getElementById('authConfirmPassword');
const authErrorEl = document.getElementById('authError');
const authSubtitle = document.getElementById('authSubtitle');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authPlayerCard = document.getElementById('authPlayerCard');
const leaderboardTabs = document.querySelectorAll('#leaderboardModal .tab');
const SESSION_KEY = 'retrolocal_session_user';
const TOKEN_KEY   = 'retrolocal_session_token';
let achievementsCache = { quickest: [], fewest: [], hardMode: [] };

function getSessionUser() {
  try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}
function getSessionToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function setSessionUser(name, token) {
  try {
    if (name) {
      localStorage.setItem(SESSION_KEY, name);
      localStorage.setItem(TOKEN_KEY, token || '');
    } else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'SERVER ERROR');
  }
  return data;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   AUDIO
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, type, duration, vol=0.15, delay=0) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime+delay);
    gain.gain.setValueAtTime(0, ctx.currentTime+delay);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime+delay+0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+delay+duration);
    osc.start(ctx.currentTime+delay);
    osc.stop(ctx.currentTime+delay+duration);
  } catch {}
}

const SFX = {
  flip:  () => { playTone(440,'square',0.08,0.08); playTone(550,'square',0.08,0.06,0.05); },
  match: () => { [523,659,784,1046].forEach((f,i) => playTone(f,'square',0.15,0.12,i*0.07)); },
  wrong: () => { playTone(180,'sawtooth',0.12,0.1); playTone(140,'sawtooth',0.12,0.1,0.1); },
  win:   () => { [523,523,523,392,523,659,784].forEach((f,i) => playTone(f,'square',0.18,0.12,i*0.12)); },
  gameOver: () => { [300,250,200,150].forEach((f,i) => playTone(f,'sawtooth',0.25,0.15,i*0.15)); },
  combo: () => { playTone(880,'square',0.1,0.12); playTone(1100,'square',0.1,0.1,0.08); },
  start: () => { [261,329,392,523].forEach((f,i) => playTone(f,'square',0.12,0.1,i*0.1)); },
  tick:  () => playTone(800,'square',0.04,0.06),
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SHUFFLE
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function shuffle(arr) {
  const a = [...arr];
  for (let t=0; t<4; t++)
    for (let i=a.length-1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
  for (let i=0; i<a.length-1; i++) {
    if (a[i]===a[i+1]) {
      const j = (i+2)%a.length;
      [a[i+1],a[j]] = [a[j],a[i+1]];
    }
  }
  return a;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TIMER
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function startTimer() {
  if (running) return;
  running = true;
  const cfg = difficulties[difficulty];
  if (cfg.timeLimit) {
    blitzRemaining = cfg.timeLimit;
    updateBlitzBar();
    blitzInterval = setInterval(() => {
      blitzRemaining--;
      updateBlitzBar();
      if (blitzRemaining <= 10) SFX.tick();
      if (blitzRemaining <= 0) triggerGameOver();
    }, 1000);
  } else {
    gameTimer = setInterval(() => {
      seconds++;
      if (seconds===60) { minutes++; seconds=0; }
      const m = minutes, s = seconds;
      timerEl.textContent = `TIME: ${m}:${String(s).padStart(2,'0')}`;
    }, 1000);
  }
}

function updateBlitzBar() {
  const limit = difficulties[difficulty].timeLimit;
  const pct = (blitzRemaining/limit)*100;
  const fill = document.getElementById('blitzFill');
  const bar  = document.getElementById('blitzBar');
  if (!fill||!bar) return;
  bar.style.display = 'block';
  fill.style.width = pct+'%';
  fill.style.background = pct>50 ? 'var(--green)' : pct>25 ? 'var(--yellow)' : 'var(--red)';
  timerEl.textContent = `TIME: ${formatElapsedTime(blitzRemaining)}`;
}

function resetTimer() {
  clearInterval(gameTimer); clearInterval(blitzInterval);
  running=false; seconds=minutes=0;
  timerEl.textContent = 'TIME: 0 seconds';
  const bar = document.getElementById('blitzBar');
  if (bar) bar.style.display = 'none';
}

function formatElapsedTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins <= 0) {
    return `${secs} second${secs === 1 ? '' : 's'}`;
  }
  return `${mins} minute${mins === 1 ? '' : 's'} ${secs} second${secs === 1 ? '' : 's'}`;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SCORE
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function calcPoints(comboMult) {
  const base = {easy:100,medium:150,hard:200,insane:300,blitz:250}[difficulty]||100;
  return base * comboMult;
}

function showScorePopup(pts, card) {
  const rect = card.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'score-popup';
  el.textContent = `+${pts}`;
  el.style.left = rect.left+'px';
  el.style.top  = (rect.top-20)+'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   BUILD BOARD
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function createBoard() {
  board.innerHTML = '';
  resetTimer();
  moves=0; score=0; combo=0; comboMax=0; matched=0;
  first=second=null; lock=false;

  const cfg = difficulties[difficulty];
  totalPairs = cfg.pairs;
  document.body.classList.toggle('blitz-mode', difficulty === 'blitz');

  movesEl.textContent = 'MOVES: 0';
  scoreEl.textContent = 'POINTS: 0';
  currentScoreEl.textContent = '0';
  currentComboEl.textContent = 'x1';
  pairsEl.textContent = `${totalPairs}`;
  diffLbl.textContent = cfg.label;

  // Blitz bar
  let blitzBar = document.getElementById('blitzBar');
  if (!blitzBar) {
    blitzBar = document.createElement('div');
    blitzBar.id = 'blitzBar';
    blitzBar.innerHTML = '<div id="blitzFill"></div>';
    board.parentElement.insertBefore(blitzBar, board);
  }

  board.style.gridTemplateColumns = `repeat(${cfg.cols}, var(--card-w))`;

  const deck = shuffle([...icons.slice(0,cfg.pairs), ...icons.slice(0,cfg.pairs)]);

  deck.forEach((icon, idx) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animationDelay = `${idx*0.03}s`;
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-front"></div>
        <div class="card-back">${icon}</div>
      </div>
    `;
    card.addEventListener('click', () => flipCard(card, icon));
    board.appendChild(card);
  });

}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   FLIP
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function flipCard(card, icon) {
  if (lock || card.classList.contains('flip') || card.classList.contains('matched')) return;
  startTimer();
  SFX.flip();
  card.classList.add('flip');

  if (!first) { first={card,icon}; return; }

  second = {card,icon};
  moves++;
  movesEl.textContent = `MOVES: ${moves}`;

  if (first.icon===second.icon) {
    // MATCH
    combo++;
    comboMax = Math.max(comboMax, combo);
    const pts = calcPoints(combo);
    score += pts;
    matched++;

    currentComboEl.textContent = `x${combo}`;
    scoreEl.textContent = `POINTS: ${score}`;
    currentScoreEl.textContent = `${score}`;
    pairsEl.textContent = `${totalPairs-matched}`;

    showScorePopup(pts, second.card);
    showComboMsg(combo);
    if (combo>=3) SFX.combo();

    const f = first, s = second;
    first = second = null; // clear refs immediately

    const matchDelay = difficulty === 'blitz' ? 120 : 200;
    setTimeout(() => {
      // Add matched - CSS locks them face-up via .card.matched .card-inner
      // Do NOT remove .flip - matched takes precedence via CSS specificity
      f.card.classList.add('matched');
      s.card.classList.add('matched');
      SFX.match();
      checkWin();
    }, matchDelay);

  } else {
    // MISS
    combo = 0;
    currentComboEl.textContent = 'x1';
    lock = true;

    const f = first, s = second;
    first = second = null;

    const wrongFlashDelay = difficulty === 'blitz' ? 150 : 300;
    const unflipDelay = difficulty === 'blitz' ? 500 : 900;
    setTimeout(() => {
      f.card.classList.add('wrong');
      s.card.classList.add('wrong');
      SFX.wrong();
    }, wrongFlashDelay);

    setTimeout(() => {
      f.card.classList.remove('flip','wrong');
      s.card.classList.remove('flip','wrong');
      lock = false;
    }, unflipDelay);
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   COMBO MESSAGE
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const COMBO_MSGS = {
  2: {text:'NICE!',    color:'var(--cyan)'},
  3: {text:'GREAT!!',  color:'var(--green)'},
  4: {text:'AWESOME!', color:'var(--yellow)'},
  5: {text:'ON FIRE!', color:'var(--orange)'},
};

function showComboMsg(c) {
  if (c<2) return;
  const msg = COMBO_MSGS[Math.min(c,5)] || COMBO_MSGS[5];
  comboMsg.textContent = `${c}x COMBO - ${msg.text}`;
  comboMsg.style.color = msg.color;
  comboMsg.classList.remove('show');
  void comboMsg.offsetWidth;
  comboMsg.classList.add('show');
  setTimeout(() => comboMsg.classList.remove('show'), 1200);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   WIN / GAME OVER
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function checkWin() {
  if (matched < totalPairs) return;
  clearInterval(gameTimer); clearInterval(blitzInterval);
  running = false;
  const total = minutes*60+seconds;
  saveScore(total).catch(error => {
    console.error('Save score failed:', error);
  });
  SFX.win();
  document.getElementById('finalStats').innerHTML =
    `PLAYER: ${player}<br>DIFFICULTY: ${difficulties[difficulty].label}<br>MOVES: ${moves}<br>TIME: ${formatElapsedTime(total)}<br>SCORE: ${score} POINTS<br>COMBO MAX: x${comboMax}`;
  document.getElementById('winModal').classList.add('show');
}

function triggerGameOver() {
  clearInterval(blitzInterval); clearInterval(gameTimer);
  running = false;
  SFX.gameOver();
  document.getElementById('overStats').innerHTML =
    `PLAYER: ${player}<br>PAIRS FOUND: ${matched}/${totalPairs}<br>MOVES: ${moves}<br>SCORE: ${score} POINTS`;
  document.getElementById('gameOverModal').classList.add('show');
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   LEADERBOARD / ACHIEVEMENTS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function saveScore(totalSec) {
  await apiRequest('/api/scores', {
    method: 'POST',
    body: JSON.stringify({
      token: sessionToken,
      score,
      moves,
      timeSeconds: totalSec,
      comboMax,
      difficulty
    })
  });
}

async function renderLeaderboard(diff) {
  const medals = ['1.','2.','3.','4.','5.'];
  const content = document.getElementById('leaderboardContent');
  content.innerHTML = '<div class="lb-empty">LOADING SCORES...</div>';
  let lb = [];

  try {
    const result = await apiRequest(`/api/leaderboard?difficulty=${encodeURIComponent(diff)}`);
    lb = result.leaderboard || [];
  } catch (error) {
    content.innerHTML = `<div class="lb-empty">${error.message}<br>TRY AGAIN</div>`;
    return;
  }

  if (!lb.length) { content.innerHTML='<div class="lb-empty">NO SCORES YET<br>BE THE FIRST!</div>'; return; }
  content.innerHTML = lb.map((e,i) => `
    <div class="lb-row">
      <span class="lb-rank">${medals[i]}</span>
      <span class="lb-name">${e.username.toUpperCase()}</span>
      <span class="lb-time">${typeof e.score === 'number' ? e.score + ' POINTS' : ''}</span>
    </div>
  `).join('');
}

async function renderAchievements() {
  const content = document.getElementById('leaderboardContent');
  content.innerHTML = '<div class="lb-empty">LOADING ACHIEVEMENTS...</div>';

  try {
    const result = await apiRequest('/api/achievements');
    achievementsCache = {
      quickest: result.quickest || [],
      fewest: result.fewest || [],
      hardMode: result.hardMode || []
    };
  } catch (error) {
    content.innerHTML = `<div class="lb-empty">${error.message}<br>TRY AGAIN</div>`;
    return;
  }

  const topQuickest = achievementsCache.quickest[0];
  const topFewest = achievementsCache.fewest[0];
  const topHardMode = achievementsCache.hardMode[0];
  const achvs = [
    {id:'quickest', title:'QUICKEST TIME', value: d=>d?`${d.username} ${d.value} seconds`:'-', data:topQuickest},
    {id:'fewest', title:'FEWEST MOVES', value: d=>d?`${d.username} ${d.value} moves`:'-', data:topFewest},
    {id:'hardMode', title:'HARD MODE MASTER', value: d=>d?`${d.username} ${d.value} wins`:'-', data:topHardMode},
  ];

  content.innerHTML = `
    ${achvs.map(ac=>`
      <div class="achv-row" data-achv="${ac.id}">
        <div class="achv-title">${ac.title}</div>
        <div class="achv-holder">${ac.value(ac.data)}</div>
      </div>
    `).join('')}
  `;

  content.querySelectorAll('.achv-row').forEach(row => {
    row.addEventListener('click', () => renderAchievementLeaders(row.dataset.achv));
  });
}

function renderAchievementLeaders(achvId) {
  const content = document.getElementById('leaderboardContent');
  const medals = ['1.','2.','3.','4.','5.'];
  let title = '';
  let rows = [];

  if (achvId === 'quickest') {
    title = 'QUICKEST TIME - TOP 5';
    rows = achievementsCache.quickest
      .slice(0,5)
      .map((e,i) => ({rank: medals[i], name: e.username, val: `${e.value} seconds`}));
  } else if (achvId === 'fewest') {
    title = 'FEWEST MOVES - TOP 5';
    rows = achievementsCache.fewest
      .slice(0,5)
      .map((e,i) => ({rank: medals[i], name: e.username, val: `${e.value} moves`}));
  } else {
    title = 'HARD MODE MASTER - TOP 5';
    rows = achievementsCache.hardMode
      .slice(0,5)
      .map((e,i) => ({rank: medals[i], name: e.username, val: `${e.value} wins`}));
  }

  if (!rows.length) {
    content.innerHTML = '<div class="lb-empty">NO ACHIEVEMENTS YET<br>START PLAYING!</div>';
    return;
  }

  content.innerHTML = `
    <div class="lb-row" style="border-top: 1px solid var(--border);">
      <span class="lb-rank"></span>
      <span class="lb-name" style="color: var(--yellow);">${title}</span>
      <span class="lb-time"></span>
    </div>
    ${rows.map(r => `
      <div class="lb-row">
        <span class="lb-rank">${r.rank}</span>
        <span class="lb-name">${r.name.toUpperCase()}</span>
        <span class="lb-time">${r.val}</span>
      </div>
    `).join('')}
    <button class="arcade-btn btn-red btn-small achv-back-btn" id="achvBack">BACK</button>
  `;

  document.getElementById('achvBack').addEventListener('click', () => renderAchievements());
}

function normalizePlayerName(name) {
  return name.trim().toUpperCase().slice(0,12);
}

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('showLoginBtn').classList.toggle('active', mode === 'login');
  document.getElementById('showSignupBtn').classList.toggle('active', mode === 'signup');
  authSubtitle.textContent = mode === 'login' ? 'LOG IN TO YOUR ACCOUNT' : 'CREATE A NEW ACCOUNT';
  authSubmitBtn.textContent = mode === 'login' ? 'LOG IN' : 'SIGN UP';
  authConfirmInput.classList.toggle('hidden', mode !== 'signup');
  authErrorEl.textContent = '';
}

function showSetupPanel() {
  authPanel.classList.add('hidden');
  setupPanel.classList.remove('hidden');
  authPlayerCard.textContent = `PLAYER: ${player}`;
  playerLabel.textContent = `PLAYER: ${player}`;
}

function showAuthPanel() {
  setupPanel.classList.add('hidden');
  authPanel.classList.remove('hidden');
  authErrorEl.textContent = '';
}

async function handleAuthSubmit() {
  const username = normalizePlayerName(authUsernameInput.value);
  const password = authPasswordInput.value.trim();
  const confirmPassword = authConfirmInput.value.trim();

  if (!username) {
    authErrorEl.textContent = 'ENTER A USERNAME';
    return;
  }
  if (!password) {
    authErrorEl.textContent = 'ENTER A PASSWORD';
    return;
  }

  if (authMode === 'signup' && password !== confirmPassword) {
    authErrorEl.textContent = 'PASSWORDS DO NOT MATCH';
    return;
  }

  authErrorEl.textContent = '';
  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = authMode === 'login' ? 'LOGGING IN...' : 'SIGNING UP...';

  try {
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    const result = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    player = result.player.username;
    sessionToken = result.token || '';
    setSessionUser(player, sessionToken);
    authUsernameInput.value = player;
    authPasswordInput.value = '';
    authConfirmInput.value = '';
    showSetupPanel();
  } catch (error) {
    authErrorEl.textContent = error.message;
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authMode === 'login' ? 'LOG IN' : 'SIGN UP';
  }
}

function setActiveDifficultyButtons(diff) {
  document.querySelectorAll('.start-diff, .level-diff').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  });
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   BUTTONS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
document.getElementById('startGameBtn').addEventListener('click', () => {
  if (!player) {
    showAuthPanel();
    authErrorEl.textContent = 'LOG IN FIRST';
    return;
  }

  playerLabel.textContent = `PLAYER: ${player}`;
  difficulty = document.querySelector('.start-diff.active')?.dataset.diff || 'easy';
  setActiveDifficultyButtons(difficulty);
  document.getElementById('startModal').classList.remove('show');
  hasStarted = true;
  SFX.start();
  createBoard();
});

authUsernameInput.addEventListener('input', () => { authErrorEl.textContent = ''; });
authPasswordInput.addEventListener('input', () => { authErrorEl.textContent = ''; });
authConfirmInput.addEventListener('input', () => { authErrorEl.textContent = ''; });
authSubmitBtn.addEventListener('click', handleAuthSubmit);
document.getElementById('showLoginBtn').addEventListener('click', () => setAuthMode('login'));
document.getElementById('showSignupBtn').addEventListener('click', () => setAuthMode('signup'));
document.getElementById('switchAccountBtn').addEventListener('click', () => {
  player = '';
  sessionToken = '';
  setSessionUser('', '');
  authUsernameInput.value = '';
  authPasswordInput.value = '';
  authConfirmInput.value = '';
  showAuthPanel();
});

// Difficulty buttons in start modal
document.querySelectorAll('.start-diff').forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveDifficultyButtons(btn.dataset.diff);
  });
});

document.querySelectorAll('.level-diff').forEach(btn => {
  btn.addEventListener('click', () => {
    difficulty = btn.dataset.diff;
    setActiveDifficultyButtons(difficulty);
    document.getElementById('levelModal').classList.remove('show');
    createBoard();
  });
});

document.getElementById('restart').addEventListener('click', createBoard);
document.getElementById('logoutBtn').addEventListener('click', () => {
  player = '';
  sessionToken = '';
  hasStarted = false;
  setSessionUser('', '');
  authUsernameInput.value = '';
  authPasswordInput.value = '';
  authConfirmInput.value = '';
  showAuthPanel();
  document.getElementById('startModal').classList.add('show');
  playerLabel.textContent = 'PLAYER: -';
});
document.getElementById('changeDifficulty').addEventListener('click', () => {
  if (!hasStarted) return;
  setActiveDifficultyButtons(difficulty);
  document.getElementById('levelModal').classList.add('show');
});
document.getElementById('playAgain').addEventListener('click', () => { document.getElementById('winModal').classList.remove('show'); createBoard(); });
document.getElementById('newDifficulty').addEventListener('click', () => {
  document.getElementById('winModal').classList.remove('show');
  setActiveDifficultyButtons(difficulty);
  document.getElementById('levelModal').classList.add('show');
});
document.getElementById('closeLevelModal').addEventListener('click', () => {
  document.getElementById('levelModal').classList.remove('show');
});
document.getElementById('closeWin').addEventListener('click', () => document.getElementById('winModal').classList.remove('show'));
document.getElementById('overPlayAgain').addEventListener('click', () => { document.getElementById('gameOverModal').classList.remove('show'); createBoard(); });
document.getElementById('closeOver').addEventListener('click', () => document.getElementById('gameOverModal').classList.remove('show'));

let activeTab = 'easy';
document.getElementById('leaderboardBtn').addEventListener('click', () => {
  document.getElementById('leaderboardModal').classList.add('show');
  leaderboardTabs.forEach(t => t.classList.toggle('active', t.dataset.tab===activeTab));
  activeTab==='achievements' ? renderAchievements() : renderLeaderboard(activeTab);
});

document.getElementById('closeLeaderboard').addEventListener('click', () => document.getElementById('leaderboardModal').classList.remove('show'));

leaderboardTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    leaderboardTabs.forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    activeTab==='achievements' ? renderAchievements() : renderLeaderboard(activeTab);
  });
});

document.getElementById('soundToggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  document.getElementById('soundToggle').textContent = soundEnabled ? 'SFX ON' : 'SFX OFF';
});

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target!==modal) return;
    if (modal.id==='startModal' && !hasStarted) return;
    modal.classList.remove('show');
  });
});

// Keyboard
document.addEventListener('keydown', e => {
  if (e.key==='Escape') ['winModal','gameOverModal','leaderboardModal','levelModal'].forEach(id=>document.getElementById(id).classList.remove('show'));
  if (e.key==='Escape' && hasStarted) document.getElementById('startModal').classList.remove('show');
  if ((e.key==='r'||e.key==='R') && document.activeElement.tagName!=='INPUT') createBoard();
});

const sessionUser = getSessionUser();
const storedToken = getSessionToken();
setAuthMode('login');
if (sessionUser && storedToken) {
  player = sessionUser;
  sessionToken = storedToken;
  authUsernameInput.value = sessionUser;
  showSetupPanel();
} else {
  showAuthPanel();
}