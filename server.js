const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Подключение к базе данных (Render передаст ссылку через переменную DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Разрешаем серверу отдавать файлы из текущей папки (index.html)
app.use(express.static(__dirname));

// API для записи захода пользователя
app.post('/api/visit', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Записываем в базу
    await pool.query(
      'INSERT INTO users (ip_address, user_agent) VALUES ($1, $2)',
      [ip, userAgent]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// API для получения списка пользователей (для админки)
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
