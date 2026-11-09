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

// Инициализация базы (добавил новые поля)
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
    `);
    // Добавляем колонки, если база уже была создана старой версией
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';`);
    await pool.query(`ALTER TABLE custom_servers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;`);
    console.log("Database initialized");
  } catch (err) {
    console.error("DB Init Error", err);
  }
};
initDB();

// Логирование
app.post('/api/visit', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    await pool.query('INSERT INTO users (ip, user_agent) VALUES ($1, $2)', [ip, userAgent]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// АДМИН: Пользователи
app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 200');
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

app.post('/api/admin/ban', async (req, res) => {
  const { userId, status } = req.body;
  try {
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// АДМИН: Сервера
app.get('/api/servers', async (req, res) => {
  try {
    // Для сайта отдаем только активные, для админки — все (сделаем проверку по query параметру)
    const isAdmin = req.query.admin === 'true';
    const q = isAdmin ? 'SELECT * FROM custom_servers' : 'SELECT * FROM custom_servers WHERE active = TRUE';
    const result = await pool.query(q);
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

app.put('/api/admin/servers/:id', async (req, res) => {
  const { active } = req.body;
  try {
    await pool.query('UPDATE custom_servers SET active = $1 WHERE id = $2', [active, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/servers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM custom_servers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// АДМИН: Новости
app.get('/api/news', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM news ORDER BY id DESC LIMIT 20');
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

app.delete('/api/admin/news/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM news WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
