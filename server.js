const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Инициализация всех таблиц
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        ip VARCHAR(50),
        user_agent TEXT,
        plan VARCHAR(20) DEFAULT 'Free',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS custom_servers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        country VARCHAR(10),
        protocol VARCHAR(20),
        key TEXT,
        active BOOLEAN DEFAULT TRUE
      );
      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        title TEXT,
        body TEXT,
        date VARCHAR(50)
      );
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS broadcast (
        id SERIAL PRIMARY KEY,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Добавление колонок, если таблицы были созданы ранее
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';`);
    await pool.query(`ALTER TABLE custom_servers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;`);
    console.log("DB Ready");
  } catch (err) { console.error("DB Error", err); }
};
initDB();

// ==== ЗАХОДЫ ====
app.post('/api/visit', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || 'unknown';
    await pool.query('INSERT INTO users (ip, user_agent) VALUES ($1, $2)', [ip, ua]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==== АДМИН: ПОЛЬЗОВАТЕЛИ ====
app.get('/api/admin/users', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/grant', async (req, res) => {
  try {
    await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [req.body.plan, req.body.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/ban', async (req, res) => {
  try {
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', [req.body.status, req.body.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/delete-user', async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.body.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==== АДМИН: СЕРВЕРА ====
app.get('/api/servers', async (req, res) => {
  try {
    const isAdmin = req.query.admin === 'true';
    const q = isAdmin ? 'SELECT * FROM custom_servers' : 'SELECT * FROM custom_servers WHERE active = TRUE';
    const r = await pool.query(q);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/servers', async (req, res) => {
  const { name, country, protocol, key } = req.body;
  try {
    await pool.query('INSERT INTO custom_servers (name, country, protocol, key) VALUES ($1, $2, $3, $4)', [name, country, protocol, key]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/servers/:id', async (req, res) => {
  try {
    await pool.query('UPDATE custom_servers SET active = $1 WHERE id = $2', [req.body.active, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/servers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM custom_servers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==== АДМИН: НОВОСТИ ====
app.get('/api/news', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM news ORDER BY id DESC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/news', async (req, res) => {
  try {
    await pool.query('INSERT INTO news (title, body, date) VALUES ($1, $2, $3)', [req.body.title, req.body.body, req.body.date]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/news/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM news WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==== АДМИН: РАССЫЛКА ====
app.post('/api/admin/broadcast', async (req, res) => {
  try {
    await pool.query('INSERT INTO broadcast (message) VALUES ($1)', [req.body.message]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==== АДМИН: НАСТРОЙКИ ====
app.get('/api/admin/settings', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM settings');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/settings', async (req, res) => {
  const { key, value } = req.body;
  try {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, () => console.log(`Server live on ${port}`));
