
'use strict';

// ================================================
// LIBREVPN — ОСНОВНОЙ КЛИЕНТ
// ================================================

const TOKEN_KEY = 'librevpn_admin_token';

// Безопасная работа с API
async function api(url, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);

  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const type = response.headers.get('content-type') || '';

  if (!response.ok) {
    let message = `Ошибка ${response.status}`;

    if (type.includes('application/json')) {
      const data = await response.json();
      message = data.error || message;
    }

    throw new Error(message);
  }

  return type.includes('application/json')
    ? response.json()
    : response;
}

// Безопасное создание элементов
function el(tag, className = '', text = '') {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text !== undefined && text !== null) {
    node.textContent = String(text);
  }

  return node;
}

// Уведомления
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(window._toastTimer);

  window._toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// ================================================
// ТЕМА И ЦВЕТА
// ================================================

function setColor(color) {
  document.body.setAttribute('data-color', color);
  localStorage.setItem('siteColor', color);

  document.getElementById('palette')?.classList.remove('show');

  showToast('🎨 Цвет изменён');
}

function togglePalette() {
  document.getElementById('palette')?.classList.toggle('show');
}

const savedColor = localStorage.getItem('siteColor');

if (savedColor) {
  document.body.setAttribute('data-color', savedColor);
}

// ================================================
// НАВИГАЦИЯ
// ================================================

function toggleMenu() {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('overlay')?.classList.toggle('open');
}

function toggleSub(id, button) {
  const submenu = document.getElementById(id);
  if (!submenu) return;

  submenu.classList.toggle('open');

  const arrow = button?.querySelector('span');

  if (arrow) {
    arrow.style.transform = submenu.classList.contains('open')
      ? 'rotate(180deg)'
      : 'rotate(0)';
  }
}

function nav(id, button) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });

  document.querySelectorAll('.nav-btn, .sub-btn').forEach(item => {
    item.classList.remove('active');
  });

  const page = document.getElementById('page-' + id);

  if (page) {
    page.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (button) button.classList.add('active');

  if (
    window.innerWidth < 768 &&
    document.getElementById('sidebar')?.classList.contains('open')
  ) {
    toggleMenu();
  }
}

// ================================================
// АДМИН-ПАНЕЛЬ: АВТОРИЗАЦИЯ
// ================================================

async function askAdminPass() {
  const password = prompt('Введите пароль администратора:');

  if (password === null) return;

  try {
    const result = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    });

    if (!result.token) {
      throw new Error('Не получен токен авторизации.');
    }

    sessionStorage.setItem(TOKEN_KEY, result.token);

    nav('admin');
    await loadAdminData();

    showToast('✅ Авторизация успешна');
  } catch (error) {
    showToast('❌ ' + error.message);
  }
}

async function adminLogout() {
  try {
    await api('/api/admin/logout', {
      method: 'POST'
    });
  } catch (error) {
    console.warn(error);
  }

  sessionStorage.removeItem(TOKEN_KEY);
  nav('home');

  showToast('Вы вышли из админки');
}

function switchAdmin(tab, button) {
  document.querySelectorAll('.admin-tab').forEach(item => {
    item.classList.remove('active');
  });

  document.querySelectorAll('.admin-section').forEach(item => {
    item.classList.remove('active');
  });

  button?.classList.add('active');

  document.getElementById('admin-' + tab)?.classList.add('active');
}

// ================================================
// ЗАГРУЗКА АДМИН-ПАНЕЛИ
// ================================================

async function loadAdminData() {
  try {
    const [users, servers, news, stats] = await Promise.all([
      api('/api/users'),
      api('/api/servers?all=true'),
      api('/api/news'),
      api('/api/admin/stats')
    ]);

    document.getElementById('stat-users').textContent =
      stats.total_users ?? users.length;

    document.getElementById('stat-servers').textContent =
      stats.total_servers ?? servers.length;

    document.getElementById('stat-news').textContent =
      stats.total_news ?? news.length;

    renderUsers(users);
    renderServers(servers);
    renderNewsAdmin(news);

  } catch (error) {
    showToast('❌ ' + error.message);

    if (error.message.includes('401')) {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }
}

// ================================================
// ПОЛЬЗОВАТЕЛИ
// ================================================

function renderUsers(users) {
  const container = document.getElementById('admin-user-list');
  if (!container) return;

  container.replaceChildren();

  if (!users.length) {
    container.append(el('p', '', 'Пользователей пока нет.'));
    return;
  }

  users.forEach(user => {
    const row = el('div', 'user-row');
    const header = el('div', 'user-header');

    header.append(
      el('strong', '', `Пользователь #${user.id}`),
      el('span', '', user.plan || 'Free')
    );

    const status = el(
      'div',
      '',
      user.status === 'banned' ? '❌ Заблокирован' : '✅ Активен'
    );

    const date = el(
      'small',
      '',
      `Регистрация: ${new Date(user.created_at).toLocaleString()}`
    );

    const actions = el('div');

    const banButton = el(
      'button',
      'btn',
      user.status === 'banned' ? 'Разблокировать' : 'Заблокировать'
    );

    banButton.type = 'button';

    banButton.addEventListener('click', async () => {
      try {
        await api('/api/ban', {
          method: 'POST',
          body: JSON.stringify({
            id: user.id,
            status: user.status === 'banned' ? 'active' : 'banned'
          })
        });

        showToast('Статус пользователя изменён');
        await loadAdminData();

      } catch (error) {
        showToast('❌ ' + error.message);
      }
    });

    actions.append(banButton);
    row.append(header, status, date, actions);
    container.append(row);
  });
}

// ================================================
// СЕРВЕРЫ В АДМИН-ПАНЕЛИ
// ================================================

function renderServers(servers) {
  const container = document.getElementById('admin-srv-list');
  if (!container) return;

  container.replaceChildren();

  if (!servers.length) {
    container.append(el('p', '', 'Серверов пока нет.'));
    return;
  }

  servers.forEach(server => {
    const row = el('div', 'server-row');
    const info = el('div');

    info.append(
      el('strong', '', server.name),
      el('p', '', `${server.country} · ${server.protocol}`),
      el('small', '', server.active ? 'Активен' : 'Выключен')
    );

    const actions = el('div');

    const toggle = el(
      'button',
      'btn',
      server.active ? 'Выключить' : 'Включить'
    );

    toggle.type = 'button';

    toggle.addEventListener('click', async () => {
      try {
        await api('/api/toggle-server', {
          method: 'POST',
          body: JSON.stringify({
            id: server.id,
            active: !server.active
          })
        });

        showToast('Статус сервера изменён');
        await loadAdminData();
      } catch (error) {
        showToast('❌ ' + error.message);
      }
    });

    const remove = el('button', 'btn', 'Удалить');
    remove.type = 'button';

    remove.addEventListener('click', async () => {
      if (!confirm(`Удалить сервер «${server.name}»?`)) return;

      try {
        await api('/api/del-server', {
          method: 'POST',
          body: JSON.stringify({ id: server.id })
        });

        showToast('Сервер удалён');
        await loadAdminData();
      } catch (error) {
        showToast('❌ ' + error.message);
      }
    });

    actions.append(toggle, remove);
    row.append(info, actions);
    container.append(row);
  });
}

// ================================================
// ДОБАВЛЕНИЕ СЕРВЕРА
// ================================================

async function addServer() {
  const name = document.getElementById('s-name')?.value.trim();
  const country = document.getElementById('s-country')?.value.trim();
  const protocol = document.getElementById('s-proto')?.value.trim();
  const key = document.getElementById('s-key')?.value.trim();

  if (!name || !country || !protocol || !key) {
    showToast('Заполни все обязательные поля');
    return;
  }

  try {
    await api('/api/add-server', {
      method: 'POST',
      body: JSON.stringify({
        name,
        country,
        protocol,
        key
      })
    });

    ['s-name', 's-country', 's-proto', 's-key'].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });

    showToast('Сервер добавлен');
    await loadAdminData();
  } catch (error) {
    showToast('❌ ' + error.message);
  }
}

// ================================================
// НОВОСТИ В АДМИН-ПАНЕЛИ
// ================================================

function renderNewsAdmin(news) {
  const container = document.getElementById('admin-news-list');
  if (!container) return;

  container.replaceChildren();

  if (!news.length) {
    container.append(el('p', '', 'Новостей пока нет.'));
    return;
  }

  news.forEach(item => {
    const row = el('div', 'news-row');
    const info = el('div');

    info.append(
      el('strong', '', item.title),
      el('p', '', item.date || '')
    );

    const remove = el('button', 'btn', 'Удалить');
    remove.type = 'button';

    remove.addEventListener('click', async () => {
      if (!confirm(`Удалить новость «${item.title}»?`)) return;

      try {
        await api('/api/del-news', {
          method: 'POST',
          body: JSON.stringify({ id: item.id })
        });

        showToast('Новость удалена');
        await loadAdminData();
        await loadSite();
      } catch (error) {
        showToast('❌ ' + error.message);
      }
    });

    row.append(info, remove);
    container.append(row);
  });
}

// ================================================
// ДОБАВЛЕНИЕ НОВОСТИ
// ================================================

async function addNews() {
  const title = document.getElementById('n-title')?.value.trim();
  const body = document.getElementById('n-body')?.value.trim();

  if (!title || !body) {
    showToast('Заполни заголовок и текст новости');
    return;
  }

  try {
    await api('/api/add-news', {
      method: 'POST',
      body: JSON.stringify({ title, body })
    });

    document.getElementById('n-title').value = '';
    document.getElementById('n-body').value = '';

    showToast('Новость опубликована');

    await loadAdminData();
    await loadSite();
  } catch (error) {
    showToast('❌ ' + error.message);
  }
}

// ================================================
// БАННЕРЫ
// ================================================

async function createBanner() {
  const input = document.getElementById('b-text');
  const text = input?.value.trim();

  if (!text) {
    showToast('Введи текст баннера');
    return;
  }

  try {
    await api('/api/banners', {
      method: 'POST',
      body: JSON.stringify({ text })
    });

    input.value = '';

    showToast('Баннер опубликован');
    await loadBanners();
  } catch (error) {
    showToast('❌ ' + error.message);
  }
}

async function deleteBanner(id) {
  if (!confirm('Удалить этот баннер?')) return;

  try {
    await api('/api/banners/delete', {
      method: 'POST',
      body: JSON.stringify({ id })
    });

    showToast('Баннер удалён');
    await loadBanners();
  } catch (error) {
    showToast('❌ ' + error.message);
  }
}

async function loadBanners() {
  try {
    const banners = await api('/api/banners');
    displayBanners(banners);
  } catch (error) {
    console.error('Banner loading error:', error);
  }
}

function displayBanners(banners) {
  const main = document.querySelector('main');
  if (!main) return;

  let container = document.getElementById('site-banners');

  if (!container) {
    container = el('div', 'site-banners');
    container.id = 'site-banners';
    main.prepend(container);
  }

  container.replaceChildren();

  banners.forEach(banner => {
    const item = el('div', 'site-banner');
    item.append(el('span', '', banner.text));
    container.append(item);
  });
}

// ================================================
// АДМИНСКИЙ СПИСОК БАННЕРОВ
// ================================================

async function loadAdminBanners() {
  const section = document.getElementById('admin-banner');
  if (!section) return;

  let container = document.getElementById('banner-list');

  if (!container) {
    container = el('div', 'banner-list');
    container.id = 'banner-list';
    section.append(container);
  }

  try {
    const banners = await api('/api/banners');
    container.replaceChildren();

    if (!banners.length) {
      container.append(el('p', '', 'Активных баннеров нет.'));
      return;
    }

    banners.forEach(banner => {
      const row = el('div', 'banner-row');
      const label = el('span', '', banner.text);
      const remove = el('button', 'btn', 'Удалить');

      remove.type = 'button';
      remove.addEventListener('click', () => deleteBanner(banner.id));

      row.append(label, remove);
      container.append(row);
    });
  } catch (error) {
    console.error('Admin banners error:', error);
  }
}

// ================================================
// ПУБЛИЧНЫЕ СЕРВЕРЫ
// ================================================

function renderPublicServers(servers) {
  const groups = {
    'srv-eu': [],
    'srv-us': [],
    'srv-as': []
  };

  servers.forEach(server => {
    const country = String(server.country || '').toLowerCase();

    if (
      country.includes('🇺🇸') ||
      country.includes('сша') ||
      country.includes('usa') ||
      country.includes('america')
    ) {
      groups['srv-us'].push(server);
    } else if (
      country.includes('🇯🇵') ||
      country.includes('🇸🇬') ||
      country.includes('🇰🇷') ||
      country.includes('япония') ||
      country.includes('сингапур') ||
      country.includes('корея') ||
      country.includes('asia')
    ) {
      groups['srv-as'].push(server);
    } else {
      groups['srv-eu'].push(server);
    }
  });

  Object.entries(groups).forEach(([id, items]) => {
    const container = document.getElementById(id);
    if (!container) return;

    container.replaceChildren();

    if (!items.length) {
      container.append(el('p', 'empty-state', 'Пока нет доступных серверов.'));
      return;
    }

    items.forEach(server => {
      const card = el('article', 'server-card');

      card.append(
        el('h3', '', server.name),
        el('p', '', `${server.country} · ${server.protocol}`),
        el('p', 'server-description', server.description || 'VPN-сервер LibreVPN')
      );

      const status = el(
        'span',
        'server-status',
        server.status === 'online' ? '● Онлайн' : '● Доступен'
      );

      const copy = el('button', 'btn', 'Скопировать ключ');
      copy.type = 'button';

      copy.addEventListener('click', () => copyKey(server.key));

      card.append(status, copy);
      container.append(card);
    });
  });
}

// ================================================
// КОПИРОВАНИЕ КЛЮЧЕЙ
// ================================================

async function copyKey(value) {
  if (!value) {
    showToast('Конфигурация отсутствует');
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showToast('✅ Конфигурация скопирована');
  } catch {
    const textarea = el('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';

    document.body.append(textarea);
    textarea.select();

    const copied = document.execCommand('copy');
    textarea.remove();

    showToast(
      copied ? '✅ Конфигурация скопирована' : 'Не удалось скопировать'
    );
  }
}

// ================================================
// ПУБЛИЧНЫЕ НОВОСТИ
// ================================================

function renderPublicNews(news) {
  const container = document.getElementById('news-container');
  if (!container) return;

  container.replaceChildren();

  if (!news.length) {
    container.append(el('p', '', 'Новостей пока нет.'));
    return;
  }

  news.forEach(item => {
    const card = el('article', 'news-card');

    card.append(
      el('h3', '', item.title),
      el('small', '', item.date || ''),
      el('p', '', item.body)
    );

    container.append(card);
  });
}

// ================================================
// ЗАГРУЗКА САЙТА
// ================================================

async function loadSite() {
  try {
    const [servers, news] = await Promise.all([
      api('/api/servers'),
      api('/api/news')
    ]);

    renderPublicServers(servers);
    renderPublicNews(news);

    await loadBanners();

  } catch (error) {
    console.error('Site loading error:', error);
    showToast('Не удалось загрузить данные сайта');
  }
}

// ================================================
// ВИЗИТЫ
// ================================================

async function registerVisit() {
  try {
    await api('/api/visit', {
      method: 'POST'
    });
  } catch (error) {
    console.warn('Visit registration failed:', error);
  }
}

// ================================================
// АДМИНКА: ДОПОЛНИТЕЛЬНЫЕ КНОПКИ
// ================================================

function setupAdminControls() {
  const admin = document.getElementById('page-admin');
  if (!admin) return;

  if (!document.getElementById('admin-logout')) {
    const button = el('button', 'btn', 'Выйти из админки');
    button.id = 'admin-logout';
    button.type = 'button';
    button.addEventListener('click', adminLogout);

    admin.prepend(button);
  }
}

// ================================================
// ВОССТАНОВЛЕНИЕ СЕССИИ
// ================================================

async function restoreAdminSession() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return;

  try {
    await api('/api/admin/me');
    setupAdminControls();
  } catch {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

// ================================================
// ЗАПУСК ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ================================================

document.addEventListener('DOMContentLoaded', async () => {
  setupAdminControls();

  await registerVisit();
  await loadSite();
  await restoreAdminSession();

  console.log('LibreVPN client initialized');
});

// ================================================
// СОВМЕСТИМОСТЬ С HTML
// ================================================

window.toggleMenu = toggleMenu;
window.toggleSub = toggleSub;
window.nav = nav;
window.setColor = setColor;
window.togglePalette = togglePalette;
window.askAdminPass = askAdminPass;
window.switchAdmin = switchAdmin;
window.addServer = addServer;
window.addNews = addNews;
window.createBanner = createBanner;
window.loadAdminData = loadAdminData;
window.loadBanners = loadBanners;
window.loadAdminBanners = loadAdminBanners;
window.adminLogout = adminLogout;
window.copyKey = copyKey;
