const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Создание таблиц
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, ip VARCHAR(50), user_agent TEXT, plan VARCHAR(20) DEFAULT 'Free', status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS servers (id SERIAL PRIMARY KEY, name VARCHAR(100), country VARCHAR(10), protocol VARCHAR(20), key TEXT, active BOOLEAN DEFAULT TRUE);
      CREATE TABLE IF NOT EXISTS news (id SERIAL PRIMARY KEY, title TEXT, body TEXT, date VARCHAR(50));
    `);
    console.log("DB Ready");
  } catch (err) { console.error(err); }
};
initDB();

// Заходы
app.post('/api/visit', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    await pool.query('INSERT INTO users (ip, user_agent) VALUES ($1, $2)', [ip, req.headers['user-agent']]);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false }); }
});

// --- АДМИН API ---
app.get('/api/users', async (req, res) => {
  const r = await pool.query('SELECT * FROM users ORDER BY id DESC');
  res.json(r.rows);
});
app.post('/api/grant', async (req, res) => {
  await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [req.body.plan, req.body.id]);
  res.json({ ok: true });
});
app.post('/api/ban', async (req, res) => {
  await pool.query('UPDATE users SET status = $1 WHERE id = $2', [req.body.status, req.body.id]);
  res.json({ ok: true });
});
app.post('/api/del-user', async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.body.id]);
  res.json({ ok: true });
});

// Сервера
app.get('/api/servers', async (req, res) => {
  const q = req.query.all === 'true' ? 'SELECT * FROM servers' : 'SELECT * FROM servers WHERE active = TRUE';
  const r = await pool.query(q);
  res.json(r.rows);
});
app.post('/api/add-server', async (req, res) => {
  const { name, country, protocol, key } = req.body;
  await pool.query('INSERT INTO servers (name, country, protocol, key) VALUES ($1, $2, $3, $4)', [name, country, protocol, key]);
  res.json({ ok: true });
});
app.post('/api/toggle-server', async (req, res) => {
  await pool.query('UPDATE servers SET active = $1 WHERE id = $2', [req.body.active, req.body.id]);
  res.json({ ok: true });
});
app.post('/api/del-server', async (req, res) => {
  await pool.query('DELETE FROM servers WHERE id = $1', [req.body.id]);
  res.json({ ok: true });
});

// Новости
app.get('/api/news', async (req, res) => {
  const r = await pool.query('SELECT * FROM news ORDER BY id DESC');
  res.json(r.rows);
});
app.post('/api/add-news', async (req, res) => {
  const { title, body } = req.body;
  const date = new Date().toLocaleDateString();
  await pool.query('INSERT INTO news (title, body, date) VALUES ($1, $2, $3)', [title, body, date]);
  res.json({ ok: true });
});
app.post('/api/del-news', async (req, res) => {
  await pool.query('DELETE FROM news WHERE id = $1', [req.body.id]);
  res.json({ ok: true });
});

app.listen(port, () => console.log('Server started'));
