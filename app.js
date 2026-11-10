// ==================== ТЕМА И ПАЛИТРА ====================
const setColor = (color) => {
  document.body.setAttribute('data-color', color);
  localStorage.setItem('siteColor', color);
  document.getElementById('palette').classList.remove('show');
  showToast('🎨 Цвет изменен');
};

// Загрузка сохраненного цвета
if (localStorage.getItem('siteColor')) {
  document.body.setAttribute('data-color', localStorage.getItem('siteColor'));
}

const togglePalette = () => {
  document.getElementById('palette').classList.toggle('show');
};

// ==================== НАВИГАЦИЯ ====================
const toggleMenu = () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('open');
};

const toggleSub = (id, btn) => {
  const sub = document.getElementById(id);
  sub.classList.toggle('open');
  const arrow = btn.querySelector('span');
  if (arrow) arrow.style.transform = sub.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0)';
};

const nav = (id, btn) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .sub-btn').forEach(b => b.classList.remove('active'));
  
  const target = document.getElementById('page-' + id);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (btn) btn.classList.add('active');
  
  if (window.innerWidth < 768) toggleMenu();
};

// ==================== АДМИНКА (ВХОД) ====================
const askAdminPass = () => {
  const pass = prompt('Введите пароль администратора:');
  if (pass === '1742staW02') {
    nav('admin');
    loadAdminData();
  } else if (pass !== null) {
    showToast('❌ Неверный пароль');
  }
};

const switchAdmin = (tab, btn) => {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('admin-' + tab).classList.add('active');
};

// ==================== ЗАГРУЗКА ДАННЫХ АДМИНКИ ====================
const loadAdminData = async () => {
  // Юзеры
  try {
    const res = await fetch('/api/users');
    const users = await res.json();
    document.getElementById('stat-users').textContent = users.length;
    document.getElementById('admin-user-list').innerHTML = users.map(u => `
      <div class="user-row">
        <div class="user-header">
          <div>IP: ${u.ip}</div>
          <div style="font-weight:800; color:var(--primary);">${u.plan}</div>
        </div>
        <div style="font-size:11px; color:var(--text-muted);">${new Date(u.created_at).toLocaleString()} | Статус: ${u.status === 'banned' ? '❌ Забанен' : '✅ Активен'}</div>
      </div>
    `).join('') || '<p>Нет юзеров</p>';
  } catch(e) {}

  // Сервера
  try {
    const res = await fetch('/api/servers?all=true');
    const servers = await res.json();
    document.getElementById('stat-servers').textContent = servers.length;
    document.getElementById('admin-srv-list').innerHTML = servers.map(s => `
      <div class="user-row">
        <div class="user-header"><div>${s.country} ${s.name}</div></div>
        <div style="font-size:11px; color:var(--text-muted);">${s.protocol}</div>
      </div>
    `).join('') || '<p>Нет серверов</p>';
  } catch(e) {}

  // Новости
  try {
    const res = await fetch('/api/news');
    const news = await res.json();
    document.getElementById('stat-news').textContent = news.length;
    document.getElementById('admin-news-list').innerHTML = news.map(n => `
      <div class="user-row">
        <div class="user-header"><div>${n.title}</div></div>
        <div style="font-size:11px; color:var(--text-muted);">${n.body}</div>
      </div>
    `).join('') || '<p>Нет новостей</p>';
  } catch(e) {}
};

// ==================== ДОБАВЛЕНИЕ СЕРВЕРА ====================
const addServer = async () => {
  const name = document.getElementById('s-name').value;
  const country = document.getElementById('s-country').value;
  const protocol = document.getElementById('s-proto').value;
  const key = document.getElementById('s-key').value;
  
  if (!name || !key) return showToast('Заполните поля');
  
  await fetch('/api/add-server', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, country, protocol, key })
  });
  
  showToast('✅ Сервер добавлен');
  loadAdminData();
  loadSite(); // Принудительное обновление сайта
};

// ==================== ДОБАВЛЕНИЕ НОВОСТИ ====================
const addNews = async () => {
  const title = document.getElementById('n-title').value;
  const body = document.getElementById('n-body').value;
  
  if (!title) return showToast('Введите заголовок');
  
  await fetch('/api/add-news', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body })
  });
  
  showToast('✅ Новость добавлена');
  loadAdminData();
  loadSite(); // Принудительное обновление сайта
};

// ==================== БАННЕР ====================
const createBanner = () => {
  const text = document.getElementById('b-text').value;
  if (!text) return showToast('Введите текст');
  showToast('✅ Баннер создан!');
  document.getElementById('b-text').value = '';
};

// ==================== ЗАГРУЗКА НА САЙТ ====================
const loadSite = async () => {
  try {
    const res = await fetch('/api/servers');
    const servers = await res.json();
    
    // Твои добавленные сервера
    const extraServers = [
      { name: 'Польша', country: '🇵🇱', protocol: 'VLESS', key: 'vless://2232d904-8e6a-4202-8240-6efd8aec02e9@185.178.208.167:443?type=ws&host=lorettmay.top&path=/blog/posts&security=tls&sni=lorettmay.top&fp=chrome' },
      { name: 'Болгария', country: '🇧🇬', protocol: 'VLESS', key: 'vless://9aff658c-1f80-4c82-9213-48ca26996142@168.113.128.70:20105?flow=xtls-rprx-vision&type=tcp&security=tls&sni=ripelever.net&alpn=h2,http/1.1&fp=firefox' },
      { name: 'Канада', country: '🇨🇦', protocol: 'VLESS', key: 'vless://b48e1596-e835-4547-bdae-31daadf9ea17@5.53.124.191:8008?type=xhttp&host=&path=/&mode=auto&security=none' },
      { name: 'Кувейт', country: '🇰🇼', protocol: 'VLESS', key: 'vless://ea277838-a188-44f1-a2e8-94aa110c4f27@185.178.208.140:443?type=xhttp&host=static.bakarova-top.ru&path=/api/v2/events&mode=packet-up&security=tls&sni=static.bakarova-top.ru&fp=chrome' }
    ];
    
    const allServers = [...servers, ...extraServers];
    
    const render = (list) => list.map(s => `
      <div class="srv-item" onclick="copyKey('${s.key}', '${s.name}')">
        <div class="srv-info">
          <span class="srv-flag">${s.country}</span>
          <div>
            <div class="srv-name">${s.name}</div>
            <div class="srv-proto">${s.protocol}</div>
          </div>
        </div>
      </div>
    `).join('');
    
    document.getElementById('srv-eu').innerHTML = render(allServers.filter(s => ['🇵🇱','🇧🇬','🇩🇪','🇫🇷','🇬🇧'].includes(s.country))) || '<p style="font-size:12px; color:var(--text-muted);">Нет серверов</p>';
    document.getElementById('srv-us').innerHTML = render(allServers.filter(s => ['🇺🇸','🇨🇦'].includes(s.country))) || '<p style="font-size:12px; color:var(--text-muted);">Нет серверов</p>';
    document.getElementById('srv-as').innerHTML = render(allServers.filter(s => ['🇯🇵','🇸🇬','🇰🇷','🇭🇰','🇰🇼'].includes(s.country))) || '<p style="font-size:12px; color:var(--text-muted);">Нет серверов</p>';
  } catch(e) {}

  // Новости
  try {
    const res = await fetch('/api/news');
    const news = await res.json();
    if (news.length > 0) {
      document.getElementById('news-container').innerHTML = news.map(n => `
        <div style="margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid var(--border-glass);">
          <div style="font-weight:700; font-size:16px; margin-bottom:4px; color:var(--primary);">${n.title}</div>
          <div style="font-size:14px; color:var(--text-main); line-height:1.6;">${n.body}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">${n.date}</div>
        </div>
      `).join('');
    } else {
      document.getElementById('news-container').innerHTML = '<p style="text-align:center; color:var(--text-muted);">Новостей пока нет. Добавьте их в админке.</p>';
    }
  } catch(e) {}
};

// ==================== КОПИРОВАНИЕ (С ЗАЩИТОЙ ОТ БАГОВ) ====================
const copyKey = (key, name) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(key)
      .then(() => showToast('✅ ' + name + ' скопирован'))
      .catch(() => fallbackCopy(key, name));
  } else {
    fallbackCopy(key, name);
  }
};

const fallbackCopy = (text, name) => {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('✅ ' + name + ' скопирован');
  } catch(e) {
    showToast('❌ Ошибка копирования');
  }
  document.body.removeChild(ta);
};

// ==================== УВЕДОМЛЕНИЯ ====================
const showToast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toast);
  window._toast = setTimeout(() => t.classList.remove('show'), 2000);
};

// ==================== АНИМИРОВАННЫЙ ФОН ====================
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

const resize = () => { 
  canvas.width = window.innerWidth; 
  canvas.height = window.innerHeight; 
};
window.addEventListener('resize', resize); 
resize();

for (let i = 0; i < 40; i++) {
  particles.push({
    x: Math.random() * canvas.width, 
    y: Math.random() * canvas.height, 
    vx: (Math.random() - 0.5) * 0.5, 
    vy: (Math.random() - 0.5) * 0.5, 
    r: Math.random() * 2 + 1
  });
}

const animate = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.x += p.vx; 
    p.y += p.vy;
    if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--primary').trim() + '80';
    ctx.fill();
  });
  requestAnimationFrame(animate);
};
animate();

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
// Отправляем сигнал о заходе на сервер
fetch('/api/visit', { method: 'POST' }).catch(e => console.log('Offline'));

// Загружаем сервера и новости на сайт
loadSite();
