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

// Создание таблиц при запуске
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        ip VARCHAR(50),
        user_agent TEXT,
        plan VARCHAR(20) DEFAULT 'Free',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS custom_servers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        country VARCHAR(10),
        protocol VARCHAR(20),
        key TEXT
      );
      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        title TEXT,
        body TEXT,
        date VARCHAR(50)
      );
    `);
    console.log("Database initialized");
  } catch (err) {
    console.error("DB Init Error", err);
  }
};
initDB();

// Логирование заходов
app.post('/api/visit', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    await pool.query('INSERT INTO users (ip, user_agent) VALUES ($1, $2)', [ip, userAgent]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API для админки
app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/grant', async (req, res) => {
  const { userId, plan } = req.body;
  try {
    await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/servers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM custom_servers');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/servers', async (req, res) => {
  const { name, country, protocol, key } = req.body;
  try {
    await pool.query('INSERT INTO custom_servers (name, country, protocol, key) VALUES ($1, $2, $3, $4)', [name, country, protocol, key]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/servers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM custom_servers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/news', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM news ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/news', async (req, res) => {
  const { title, body, date } = req.body;
  try {
    await pool.query('INSERT INTO news (title, body, date) VALUES ($1, $2, $3)', [title, body, date]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
