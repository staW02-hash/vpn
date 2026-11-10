
'use strict';

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : undefined,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

const ADMIN_CONFIGURED =
  ADMIN_PASSWORD.length >= 12 &&
  SESSION_SECRET.length >= 32;

const attempts = new Map();
const TOKEN_TTL = 8 * 60 * 60;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));

  return x.length === y.length &&
    crypto.timingSafeEqual(x, y);
}

function sign(payload) {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
}

function createToken() {
  const payload = Buffer.from(JSON.stringify({
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL
  })).toString('base64url');

  return payload + '.' + sign(payload);
}

function verifyToken(token) {
  if (!ADMIN_CONFIGURED || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;

  if (!safeEqual(signature, sign(payload))) {
    return false;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString()
    );

    return data.role === 'admin' &&
      Number.isInteger(data.exp) &&
      data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!ADMIN_CONFIGURED) {
    return res.status(503).json({
      ok: false,
      error: 'Админка не настроена на сервере.'
    });
  }

  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : '';

  if (!verifyToken(token)) {
    return res.status(401).json({
      ok: false,
      error: 'Требуется авторизация администратора.'
    });
  }

  next();
}

function clean(value, max = 5000) {
  return typeof value === 'string'
    ? value.trim().slice(0, max)
    : '';
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function audit(action, details = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (action, details)
       VALUES ($1, $2)`,
      [action, JSON.stringify(details)]
    );
  } catch (error) {
    console.error('Audit error:', error.message);
  }
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      ip VARCHAR(100),
      user_agent TEXT,
      plan VARCHAR(20) DEFAULT 'Free',
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS servers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      country VARCHAR(30),
      protocol VARCHAR(30),
      key TEXT,
      active BOOLEAN DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS news (
      id SERIAL PRIMARY KEY,
      title TEXT,
      body TEXT,
      date VARCHAR(50)
    );

    ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

    ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT '';

    ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'unchecked';

    ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS last_checked TIMESTAMP;

    ALTER TABLE news
      ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT TRUE;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP;

    CREATE TABLE IF NOT EXISTS banners (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      action VARCHAR(100) NOT NULL,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('PostgreSQL ready');
}

// Авторизация администратора

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_CONFIGURED) {
    return res.status(503).json({
      ok: false,
      error: 'Настрой секреты ADMIN_PASSWORD и SESSION_SECRET в Render.'
    });
  }

  const ip = req.ip || 'unknown';
  const now = Date.now();
  const record = attempts.get(ip) || {
    count: 0,
    blockedUntil: 0
  };

  if (record.blockedUntil > now) {
    return res.status(429).json({
      ok: false,
      error: 'Слишком много попыток. Попробуй позже.'
    });
  }

  if (!safeEqual(clean(req.body.password, 256), ADMIN_PASSWORD)) {
    record.count++;

    if (record.count >= 5) {
      record.count = 0;
      record.blockedUntil = now + 10 * 60 * 1000;
    }

    attempts.set(ip, record);

    return res.status(401).json({
      ok: false,
      error: 'Неверный пароль.'
    });
  }

  attempts.delete(ip);

  const token = createToken();

  res.json({
    ok: true,
    token,
    expiresIn: TOKEN_TTL
  });

  audit('admin_login', { ip });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ ok: true, role: 'admin' });
});

// Посещения сайта

app.post('/api/visit', async (req, res) => {
  try {
    const userAgent = clean(req.get('user-agent'), 500);

    // Не сохраняем полный IP посетителя.
    const ip = crypto
      .createHash('sha256')
      .update(String(req.ip || 'unknown'))
      .digest('hex')
      .slice(0, 24);

    await pool.query(
      `INSERT INTO users (ip, user_agent, last_seen)
       VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [ip, userAgent]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Visit error:', error.message);
    res.status(500).json({ ok: false });
  }
});

// Пользователи

app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, plan, status, created_at, last_seen
       FROM users
       ORDER BY id DESC
       LIMIT 500`
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: 'Не удалось загрузить пользователей.'
    });
  }
});

app.post('/api/grant', requireAdmin, async (req, res) => {
  try {
    const id = validId(req.body.id);
    const plan = clean(req.body.plan, 20);
    const allowed = ['Free', 'Standard', 'Premium', 'VIP', 'All'];

    if (!id || !allowed.includes(plan)) {
      return res.status(400).json({
        ok: false,
        error: 'Некорректный ID или тариф.'
      });
    }

    const result = await pool.query(
      'UPDATE users SET plan = $1 WHERE id = $2 RETURNING id',
      [plan, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        ok: false,
        error: 'Пользователь не найден.'
      });
    }

    await audit('user_plan_changed', { id, plan });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/ban', requireAdmin, async (req, res) => {
  try {
    const id = validId(req.body.id);
    const status = clean(req.body.status, 20);

    if (!id || !['active', 'banned'].includes(status)) {
      return res.status(400).json({
        ok: false,
        error: 'Некорректные данные.'
      });
    }

    const result = await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2 RETURNING id',
      [status, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        ok: false,
        error: 'Пользователь не найден.'
      });
    }

    await audit('user_status_changed', { id, status });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

// Серверы

app.get('/api/servers', async (req, res) => {
  try {
    if (req.query.all === 'true' && !verifyToken(
      (req.get('authorization') || '').replace(/^Bearer /, '')
    )) {
      return res.status(401).json({
        ok: false,
        error: 'Требуется авторизация.'
      });
    }

    const result = req.query.all === 'true'
      ? await pool.query('SELECT * FROM servers ORDER BY id DESC')
      : await pool.query(
          `SELECT id, name, country, protocol, description,
                  source_url, status, last_checked
           FROM servers
           WHERE active = TRUE
           ORDER BY id DESC`
        );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/add-server', requireAdmin, async (req, res) => {
  try {
    const name = clean(req.body.name, 100);
    const country = clean(req.body.country, 30);
    const protocol = clean(req.body.protocol, 30);
    const key = clean(req.body.key, 10000);
    const description = clean(req.body.description, 1000);
    const sourceUrl = clean(req.body.source_url, 500);

    if (!name || !country || !protocol || !key) {
      return res.status(400).json({
        ok: false,
        error: 'Заполни название, страну, протокол и конфигурацию.'
      });
    }

    await pool.query(
      `INSERT INTO servers
       (name, country, protocol, key, description, source_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, country, protocol, key, description, sourceUrl]
    );

    await audit('server_created', { name, country, protocol });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/toggle-server', requireAdmin, async (req, res) => {
  try {
    const id = validId(req.body.id);

    if (!id || typeof req.body.active !== 'boolean') {
      return res.status(400).json({ ok: false });
    }

    await pool.query(
      'UPDATE servers SET active = $1 WHERE id = $2',
      [req.body.active, id]
    );

    await audit('server_toggled', {
      id,
      active: req.body.active
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/del-server', requireAdmin, async (req, res) => {
  try {
    const id = validId(req.body.id);

    if (!id) {
      return res.status(400).json({ ok: false });
    }

    await pool.query('DELETE FROM servers WHERE id = $1', [id]);
    await audit('server_deleted', { id });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

// Новости

app.get('/api/news', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, body, date
       FROM news
       WHERE published = TRUE
       ORDER BY id DESC
       LIMIT 100`
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/add-news', requireAdmin, async (req, res) => {
  try {
    const title = clean(req.body.title, 200);
    const body = clean(req.body.body, 10000);

    if (!title || !body) {
      return res.status(400).json({
        ok: false,
        error: 'Заполни заголовок и текст новости.'
      });
    }

    const date = new Date().toLocaleDateString('ru-RU');

    const result = await pool.query(
      `INSERT INTO news (title, body, date)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [title, body, date]
    );

    await audit('news_created', { id: result.rows[0].id });
    res.json({ ok: true, id: result.rows[0].id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/del-news', requireAdmin, async (req, res) => {
  try {
    const id = validId(req.body.id);

    if (!id) {
      return res.status(400).json({ ok: false });
    }

    await pool.query('DELETE FROM news WHERE id = $1', [id]);
    await audit('news_deleted', { id });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

// Баннеры

app.get('/api/banners', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, text
       FROM banners
       WHERE active = TRUE
       ORDER BY id DESC
       LIMIT 10`
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/banners', requireAdmin, async (req, res) => {
  try {
    const text = clean(req.body.text, 1000);

    if (!text) {
      return res.status(400).json({ ok: false });
    }

    const result = await pool.query(
      `INSERT INTO banners (text)
       VALUES ($1)
       RETURNING id`,
      [text]
    );

    await audit('banner_created', { id: result.rows[0].id });
    res.json({ ok: true, id: result.rows[0].id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/banners/delete', requireAdmin, async (req, res) => {
  try {
    const id = validId(req.body.id);

    if (!id) {
      return res.status(400).json({ ok: false });
    }

    await pool.query('DELETE FROM banners WHERE id = $1', [id]);
    await audit('banner_deleted', { id });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

// Настройки сайта

app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT key, value FROM site_settings'
    );

    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/settings', requireAdmin, async (req, res) => {
  try {
    const allowed = [
      'maintenance',
      'announcement',
      'show_servers',
      'show_news',
      'show_plans',
      'support_link',
      'site_version'
    ];

    const entries = Object.entries(req.body || {});

    if (!entries.length || entries.length > allowed.length) {
      return res.status(400).json({ ok: false });
    }

    for (const [key, value] of entries) {
      if (!allowed.includes(key) || typeof value !== 'string') {
        return res.status(400).json({ ok: false });
      }

      await pool.query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key)
         DO UPDATE SET value = EXCLUDED.value,
                       updated_at = CURRENT_TIMESTAMP`,
        [key, clean(value, 1000)]
      );
    }

    await audit('site_settings_updated', {
      keys: entries.map(([key]) => key)
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

// Статистика

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users
          WHERE status = 'active') AS active_users,
        (SELECT COUNT(*) FROM users
          WHERE status = 'banned') AS banned_users,
        (SELECT COUNT(*) FROM users
          WHERE created_at >= NOW() - INTERVAL '7 days') AS new_users_week,
        (SELECT COUNT(*) FROM users
          WHERE created_at >= NOW() - INTERVAL '30 days') AS new_users_month,
        (SELECT COUNT(*) FROM servers) AS total_servers,
        (SELECT COUNT(*) FROM servers
          WHERE active = TRUE) AS active_servers,
        (SELECT COUNT(*) FROM news) AS total_news
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

// Журнал действий

app.get('/api/admin/audit', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, action, details, created_at
       FROM audit_logs
       ORDER BY id DESC
       LIMIT 100`
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

// Проверка базы данных

app.get('/api/admin/health', requireAdmin, async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      ok: true,
      database: 'connected',
      adminConfigured: ADMIN_CONFIGURED,
      uptime: Math.floor(process.uptime())
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      database: 'error'
    });
  }
});

// Экспорт пользователей в CSV

app.get('/api/admin/export/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, plan, status, created_at, last_seen
       FROM users ORDER BY id DESC LIMIT 10000`
    );

    const escapeCSV = value =>
      '"' + String(value ?? '').replace(/"/g, '""') + '"';

    const rows = [
      ['ID', 'Plan', 'Status', 'Created', 'Last seen'],
      ...result.rows.map(user => [
        user.id,
        user.plan,
        user.status,
        user.created_at,
        user.last_seen
      ])
    ];

    const csv = '\uFEFF' +
      rows.map(row => row.map(escapeCSV).join(',')).join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="librevpn-users.csv"'
    );

    res.send(csv);
    await audit('users_exported');
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

// Главная страница и статические файлы

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.js'));
});

app.get('/style.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'style.css'));
});

// Обработка ошибок

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    ok: false,
    error: 'Внутренняя ошибка сервера.'
  });
});

// Запуск только после подключения базы данных

async function start() {
  try {
    await pool.query('SELECT 1');
    await initDB();

    app.listen(port, () => {
      console.log(`LibreVPN started on port ${port}`);
      console.log(
        `Admin configured: ${ADMIN_CONFIGURED ? 'yes' : 'no'}`
      );
    });
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }
}

start();
