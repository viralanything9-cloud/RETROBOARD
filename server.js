const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(__dirname, 'data', 'memory-game.db');
const db = new sqlite3.Database(dbPath);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      player_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      moves INTEGER NOT NULL,
      time_seconds INTEGER NOT NULL,
      combo_max INTEGER DEFAULT 1,
      difficulty TEXT NOT NULL,
      played_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS achievements (
      player_id INTEGER PRIMARY KEY,
      quickest_time INTEGER,
      fewest_moves INTEGER,
      hard_wins INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);
}

function normalizeUsername(value = '') {
  return value.trim().replace(/\s+/g, ' ').slice(0, 12);
}

function validateDifficulty(value) {
  return ['easy', 'medium', 'hard', 'insane', 'blitz'].includes(value);
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Simple in-memory rate limiter for auth endpoints
const authAttempts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = authAttempts.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60000; }
  entry.count++;
  authAttempts.set(ip, entry);
  return entry.count <= 10; // max 10 attempts per minute per IP
}

app.post('/api/register', async (req, res) => {
  if (!checkRateLimit(req.ip)) {
    return res.status(429).json({ error: 'TOO MANY ATTEMPTS - WAIT A MINUTE' });
  }
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || '').trim();

    if (!username) {
      return res.status(400).json({ error: 'ENTER A USERNAME' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'PASSWORD MUST BE 4+ CHARS' });
    }

    const existing = await get('SELECT id FROM players WHERE username = ?', [username]);
    if (existing) {
      return res.status(409).json({ error: 'USERNAME ALREADY EXISTS' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await run(
      'INSERT INTO players (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );

    await run('INSERT INTO achievements (player_id) VALUES (?)', [result.lastID]);

    const token = generateToken();
    await run('INSERT INTO sessions (token, player_id) VALUES (?, ?)', [token, result.lastID]);

    res.status(201).json({
      message: 'ACCOUNT CREATED',
      player: { id: result.lastID, username },
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'SERVER ERROR' });
  }
});

app.post('/api/login', async (req, res) => {
  if (!checkRateLimit(req.ip)) {
    return res.status(429).json({ error: 'TOO MANY ATTEMPTS - WAIT A MINUTE' });
  }
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || '').trim();

    if (!username || !password) {
      return res.status(400).json({ error: 'ENTER USERNAME AND PASSWORD' });
    }

    const player = await get('SELECT * FROM players WHERE username = ?', [username]);
    if (!player) {
      return res.status(401).json({ error: 'INVALID USERNAME OR PASSWORD' });
    }

    const passwordOk = await bcrypt.compare(password, player.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'INVALID USERNAME OR PASSWORD' });
    }

    const token = generateToken();
    await run('INSERT INTO sessions (token, player_id) VALUES (?, ?)', [token, player.id]);

    res.json({
      message: 'LOGIN OK',
      player: { id: player.id, username: player.username },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'SERVER ERROR' });
  }
});

app.post('/api/scores', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const score = Number(req.body.score);
    const moves = Number(req.body.moves);
    const timeSeconds = Number(req.body.timeSeconds);
    const comboMax = Number(req.body.comboMax || 1);
    const difficulty = String(req.body.difficulty || '').toLowerCase();

    if (!token) {
      return res.status(401).json({ error: 'NOT AUTHENTICATED' });
    }
    if (!validateDifficulty(difficulty)) {
      return res.status(400).json({ error: 'INVALID DIFFICULTY' });
    }
    if ([score, moves, timeSeconds, comboMax].some(Number.isNaN)) {
      return res.status(400).json({ error: 'INVALID SCORE DATA' });
    }

    const session = await get(
      'SELECT s.player_id, p.username FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token = ?',
      [token]
    );
    if (!session) {
      return res.status(401).json({ error: 'INVALID SESSION - PLEASE LOG IN AGAIN' });
    }

    const { player_id, username } = session;

    await run(
      `INSERT INTO scores (player_id, score, moves, time_seconds, combo_max, difficulty)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [player_id, score, moves, timeSeconds, comboMax, difficulty]
    );

    const achievement = await get('SELECT * FROM achievements WHERE player_id = ?', [player_id]);
    const quickest = achievement?.quickest_time == null ? timeSeconds : Math.min(achievement.quickest_time, timeSeconds);
    const fewest = achievement?.fewest_moves == null ? moves : Math.min(achievement.fewest_moves, moves);
    const hardWins = difficulty === 'hard' ? (achievement?.hard_wins || 0) + 1 : (achievement?.hard_wins || 0);

    await run(
      `INSERT INTO achievements (player_id, quickest_time, fewest_moves, hard_wins, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(player_id) DO UPDATE SET
         quickest_time = excluded.quickest_time,
         fewest_moves = excluded.fewest_moves,
         hard_wins = excluded.hard_wins,
         updated_at = CURRENT_TIMESTAMP`,
      [player_id, quickest, fewest, hardWins]
    );

    res.status(201).json({ message: 'SCORE SAVED' });
  } catch (error) {
    console.error('Save score error:', error);
    res.status(500).json({ error: 'SERVER ERROR' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const difficulty = String(req.query.difficulty || '').toLowerCase();
    const params = [];
    let sql = `
      SELECT p.username, s.score, s.moves, s.time_seconds, s.combo_max, s.difficulty, s.played_at
      FROM scores s
      JOIN players p ON p.id = s.player_id
    `;

    if (difficulty && validateDifficulty(difficulty)) {
      sql += ' WHERE s.difficulty = ?';
      params.push(difficulty);
    }

    sql += ' ORDER BY s.score DESC, s.combo_max DESC, s.time_seconds ASC, s.moves ASC LIMIT 10';

    const rows = await all(sql, params);

    res.json({ leaderboard: rows });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'SERVER ERROR' });
  }
});

app.get('/api/achievements', async (_req, res) => {
  try {
    const quickest = await all(`
      SELECT p.username, a.quickest_time AS value
      FROM achievements a
      JOIN players p ON p.id = a.player_id
      WHERE a.quickest_time IS NOT NULL
      ORDER BY a.quickest_time ASC
      LIMIT 5
    `);

    const fewest = await all(`
      SELECT p.username, a.fewest_moves AS value
      FROM achievements a
      JOIN players p ON p.id = a.player_id
      WHERE a.fewest_moves IS NOT NULL
      ORDER BY a.fewest_moves ASC
      LIMIT 5
    `);

    const hardMode = await all(`
      SELECT p.username, a.hard_wins AS value
      FROM achievements a
      JOIN players p ON p.id = a.player_id
      WHERE a.hard_wins > 0
      ORDER BY a.hard_wins DESC, p.username ASC
      LIMIT 5
    `);

    res.json({ quickest, fewest, hardMode });
  } catch (error) {
    console.error('Achievements error:', error);
    res.status(500).json({ error: 'SERVER ERROR' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'RETROBOARD backend running' });
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`RETROBOARD server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database init error:', error);
    process.exit(1);
  });