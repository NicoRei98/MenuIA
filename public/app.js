// ── DATA ──────────────────────────────────────────────────────────────
let MENU = [];

const CAT_LABELS = {
  todos: 'Todo',
  entradas: 'Entradas', principales: 'Principales', pastas: 'Pastas',
  postres: 'Postres', bebestibles: 'Bebestibles',
  frescos: 'Frescos', calientes: 'Calientes', fritos: 'Fritos',
  sandwich: 'Sandwich', cocteles: 'Cócteles', 'sin-alcohol': 'Sin Alcohol',
  espirituosos: 'Espirituosos', cervezas: 'Cervezas', bebidas: 'Bebidas',
  vinos: 'Vinos',
};

// ── STATE ─────────────────────────────────────────────────────────────
let activeRestaurant = null;
let currentUserId = null;
let cart = {}, currentCat = 'todos', isLoggedIn = false;
let editTimer = null, editSecs = 120;
let aiRecsCache = {};
let userProfile = { restric: [], dieta: [], gustos: [] };
let userName = '';
let userPoints = 0;
let chatHistory = [];
let chatVisible = false;
const menuItemsActive = {};
let restaurantStats = null;
let networkStats = null;
let isQRMode = false;
let currentMesa = 0;

// ── UTILS ─────────────────────────────────────────────────────────────
function fmt(n) { return '$' + Math.round(n).toLocaleString('es-CL'); }

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── INIT ──────────────────────────────────────────────────────────────
async function init() {
  // Detect QR access: URL looks like /restaurant-id?mesa=N
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const urlRestId = pathParts[0] || null;
  currentMesa = parseInt(new URLSearchParams(window.location.search).get('mesa')) || 0;

  const urlEl = document.getElementById('admin-qr-url');
  if (urlEl) urlEl.textContent = window.location.origin;

  // Load restaurants from DB
  const rRes = await fetch('/api/restaurants');
  const rData = await rRes.json();
  NETWORK_RESTAURANTS.length = 0;
  (rData.restaurants || []).forEach(r => NETWORK_RESTAURANTS.push({
    ...r, orders: r.orders_count, avgTicket: r.avg_ticket,
    upsellPct: r.upsell_pct, registeredUsers: r.registered_users,
  }));

  // Determine which restaurant to load
  const targetRestId = (urlRestId && NETWORK_RESTAURANTS.find(x => x.id === urlRestId))
    ? urlRestId : 'el-rincon';
  isQRMode = !!(urlRestId && NETWORK_RESTAURANTS.find(x => x.id === urlRestId));

  const mRes = await fetch(`/api/restaurants/${targetRestId}/menu`);
  const mData = await mRes.json();
  MENU = mData.items || [];
  MENU.forEach(m => { menuItemsActive[m.id] = true; });
  activeRestaurant = NETWORK_RESTAURANTS.find(x => x.id === targetRestId) || NETWORK_RESTAURANTS[0] || null;

  // QR mode: customer-facing only — hide nav, show entry with login options
  if (isQRMode) {
    document.querySelector('.topnav')?.remove();
    document.querySelector('.entry-qr-section')?.remove();
    document.getElementById('demo-nav-btn')?.remove();
    document.getElementById('mobile-nav-sheet')?.remove();
    const r = activeRestaurant;
    if (r) {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('entry-rest-name', r.name);
      set('entry-rest-tagline', currentMesa ? `Mesa ${currentMesa} · ${r.city}` : r.city + ', ' + r.region);
      set('entry-rest-desc', `Bienvenido a ${r.name}. Elige cómo quieres continuar.`);
    }
    renderMenu();
    await loadRestaurantStats();
    switchTab('entry');
    return;
  }

  renderMenu();
  updateEntryQR();
  renderMenuAdmin();
  await loadRestaurantStats();
  renderDashboard();
  renderOrders();
  renderMesas();
}

// ── TABS ──────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + tab).classList.add('active');
  ['entry', 'client', 'admin', 'red'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('active', t === tab);
  });
  document.body.classList.toggle('mobile-client', tab === 'client' && isMobileLayout());
  if (tab === 'red' && !redInitialized) { redInitialized = true; initRedView(); }
}

function toggleDemoNav() {
  document.getElementById('mobile-nav-sheet').classList.toggle('show');
}

// ── MODALS ────────────────────────────────────────────────────────────
function showLoginModal()    { document.getElementById('modal-login').classList.add('show'); document.getElementById('login-error').style.display='none'; }
function showRegisterModal() { resetOnboarding(); document.getElementById('modal-register').classList.add('show'); }

async function loginUser() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Completa email y contraseña'; errEl.style.display = 'block'; return; }
  try {
    const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Error al iniciar sesión'; errEl.style.display = 'block'; return; }
    const u = data.user;
    currentUserId = u.id;
    userName      = u.name;
    userPoints    = u.points || 0;
    userProfile   = { restric: u.restric || [], dieta: u.dieta || [], gustos: u.gustos || [] };
    isLoggedIn    = true;
    closeModals();
    const pb = document.getElementById('prof-btn');
    pb.classList.add('logged-in');
    document.getElementById('prof-btn-name').textContent = userName;
    document.getElementById('prof-btn-icon').className = 'ti ti-star-filled';
    document.getElementById('ai-banner-title').textContent = 'Recomendaciones personalizadas';
    document.getElementById('ai-banner-sub').textContent   = 'Según tu perfil y lo que pidas hoy';
    document.getElementById('ai-personal-section').style.display = 'block';
    document.getElementById('ai-msg-text').textContent = `Bienvenido de vuelta, ${userName} 👋`;
    chatHistory = [];
    renderMenu();
    renderPersonalRecs();
    switchTab('client');
    showToast(`✓ Sesión iniciada como ${userName}`);
  } catch { errEl.textContent = 'Error de conexión'; errEl.style.display = 'block'; }
}

function validateAndContinueReg() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('reg-error');
  errEl.style.display = 'none';
  if (!name) { errEl.textContent = 'Ingresa tu nombre'; errEl.style.display = 'block'; return; }
  if (!email || !email.includes('@')) { errEl.textContent = 'Ingresa un email válido'; errEl.style.display = 'block'; return; }
  if (password && password.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres'; errEl.style.display = 'block'; return; }
  onbNext(1);
}
function closeModals()       { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show')); }

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModals(); });
});

document.querySelectorAll('.chip-grid').forEach(grid => {
  grid.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });
});

function resetOnboarding() {
  for (let i = 0; i < 4; i++) {
    document.getElementById('onb-' + i).classList.toggle('show', i === 0);
    document.getElementById('dot-' + i).classList.toggle('active', i === 0);
  }
}
function onbNext(step) {
  document.querySelectorAll('.onb-step').forEach(s => s.classList.remove('show'));
  document.getElementById('onb-' + step).classList.add('show');
  for (let i = 0; i < 4; i++) document.getElementById('dot-' + i).classList.toggle('active', i <= step);
}
function collectChips(gridId) {
  return [...document.getElementById(gridId).querySelectorAll('.chip.selected')].map(c => c.dataset.val);
}
async function finishOnboarding() {
  userProfile.restric = collectChips('chips-restric');
  userProfile.dieta   = collectChips('chips-dieta');
  userProfile.gustos  = collectChips('chips-gustos');
  const name     = document.getElementById('reg-name').value.trim() || 'Cliente';
  const email    = document.getElementById('reg-email').value.trim() || null;
  const password = document.getElementById('reg-password').value || null;
  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, restaurant_id: activeRestaurant?.id || 'el-rincon', restric: userProfile.restric, dieta: userProfile.dieta, gustos: userProfile.gustos }),
    });
    const data = await res.json();
    if (res.status === 409) { showToast('Ese email ya tiene cuenta — inicia sesión'); closeModals(); showLoginModal(); return; }
    if (data.userId) currentUserId = data.userId;
  } catch {}
  userName = name;
  enterAsUser();
}

// ── ENTRY ─────────────────────────────────────────────────────────────
function enterAsGuest() {
  isLoggedIn = false;
  userProfile = { restric: [], dieta: [], gustos: [] };
  userName = '';
  const pb = document.getElementById('prof-btn');
  pb.classList.remove('logged-in');
  document.getElementById('prof-btn-name').textContent = '';
  document.getElementById('prof-btn-icon').className = 'ti ti-user-circle';
  document.getElementById('ai-banner-title').textContent   = 'Recomendaciones IA';
  document.getElementById('ai-banner-sub').textContent     = 'Basado en popularidad y hora';
  document.getElementById('ai-personal-section').style.display = 'none';
  document.getElementById('ai-msg-text').textContent       = 'Son las 20:30 — hora peak de cenas. Los platos más pedidos esta noche:';
  chatHistory = [];
  renderMenu();
  switchTab('client');
}

function enterAsUser() {
  closeModals();
  isLoggedIn = true;
  const pb = document.getElementById('prof-btn');
  pb.classList.add('logged-in');
  document.getElementById('prof-btn-name').textContent = userName;
  document.getElementById('prof-btn-icon').className = 'ti ti-star-filled';
  document.getElementById('ai-banner-title').textContent = 'Recomendaciones personalizadas';
  document.getElementById('ai-banner-sub').textContent   = 'Según tu perfil y lo que pidas hoy';
  document.getElementById('ai-personal-section').style.display = 'block';

  const allPrefs = [...userProfile.restric, ...userProfile.dieta];
  document.getElementById('ai-msg-text').textContent = allPrefs.length
    ? `Hola ${userName} 👋 Tengo tu perfil: ${allPrefs.join(', ')}. Voy a filtrar y priorizar según eso.`
    : `Hola ${userName} 👋 Bienvenido a ${activeRestaurant?.name || 'el restaurante'}.`;

  chatHistory = [];
  renderMenu();
  renderPersonalRecs();
  switchTab('client');
}

// ── DIET HELPERS ──────────────────────────────────────────────────────
function dietConflict(item) {
  const r = userProfile.restric.map(x => x.toLowerCase());
  const c = item.contains;
  if (r.some(x => x.includes('gluten'))       && c.includes('gluten'))       return 'Contiene gluten';
  if (r.some(x => x.includes('lactosa'))      && c.includes('lactosa'))      return 'Contiene lactosa';
  if (r.some(x => x.includes('marisco'))      && c.includes('mariscos'))     return 'Contiene mariscos';
  if (r.some(x => x.includes('frutos secos')) && c.includes('frutos secos')) return 'Contiene frutos secos';
  if (r.some(x => x.includes('huevo'))        && c.includes('huevo'))        return 'Contiene huevo';
  return null;
}
function dietMatch(item) {
  const d = [...userProfile.dieta, ...userProfile.gustos].map(x => x.toLowerCase());
  if (!d.length) return false;
  return item.diet.some(tag => d.some(x => x.includes(tag) || tag.includes(x.split(' ')[0])));
}
function whyForProfile(item) {
  const g = userProfile.gustos.map(x => x.toLowerCase());
  const d = userProfile.dieta.map(x => x.toLowerCase());
  if (item.diet.includes('carne roja')       && g.some(x => x.includes('carne')))    return 'Te gustan las carnes rojas';
  if (item.diet.includes('pescado')          && g.some(x => x.includes('pescado')))  return 'Calza con tu gusto por pescados';
  if (item.diet.includes('fit')              && d.some(x => x.includes('fit') || x.includes('caloría'))) return 'Liviano, va con tu dieta';
  if (item.diet.includes('alto en proteína') && d.some(x => x.includes('proteína'))) return 'Alto en proteína, como prefieres';
  if (item.diet.includes('sin gluten'))      return 'Apto para tu perfil sin gluten';
  if (item.diet.includes('vegano'))          return 'Opción vegana para ti';
  return 'Calza con tus preferencias';
}

// ── MENU ──────────────────────────────────────────────────────────────
function renderCategoryChips() {
  const scroll = document.getElementById('cat-scroll');
  if (!scroll) return;
  const cats = ['todos', ...new Set(MENU.map(m => m.cat))];
  scroll.innerHTML = cats.map(c =>
    `<div class="cat-chip${c === currentCat ? ' active' : ''}" onclick="setCategory(this,'${c}')">${CAT_LABELS[c] || (c.charAt(0).toUpperCase() + c.slice(1))}</div>`
  ).join('');
}

function renderMenu() {
  renderCategoryChips();
  const filtered = currentCat === 'todos' ? MENU : MENU.filter(m => m.cat === currentCat);
  document.getElementById('menu-list').innerHTML = filtered.map(item => {
    const inCart   = !!cart[item.id];
    const conflict = isLoggedIn ? dietConflict(item) : null;
    const match    = isLoggedIn && !conflict ? dietMatch(item) : false;
    return `<div class="menu-item ${conflict ? 'dimmed' : ''}" onclick="showDetail(${item.id})">
      <div class="item-emoji">${item.emoji}</div>
      <div class="item-body">
        <div class="item-name">${item.name}</div>
        <div class="item-desc">${item.desc}</div>
        <div class="item-tags">
          ${inCart   ? '<span class="tag tag-incart">✓ En tu pedido</span>' : ''}
          ${match    ? '<span class="tag tag-fit">✦ Para tu perfil</span>' : ''}
          ${conflict ? `<span class="tag tag-warn">⚠ ${conflict}</span>` : ''}
          ${!match && !conflict && item.tags?.includes('Popular') ? '<span class="tag tag-pop">🔥 Popular</span>' : ''}
          ${!match && !conflict ? (item.tags?.filter(t => t !== 'Popular').slice(0, 1).map(t => `<span class="tag tag-neutral">${t}</span>`).join('') || '') : ''}
        </div>
        <div class="item-price">${fmt(item.price)}</div>
      </div>
      <button class="add-btn ${inCart ? 'added' : ''}" onclick="event.stopPropagation();addToCart(${item.id})" aria-label="Agregar">+</button>
    </div>`;
  }).join('');
}

function setCategory(el, cat) {
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  currentCat = cat;
  renderMenu();
}

// ── PANELS ────────────────────────────────────────────────────────────
function setSpHeader(title, sub) {
  document.getElementById('sp-title').textContent = title;
  document.getElementById('sp-sub').textContent   = sub;
}
function isMobileLayout() { return window.matchMedia('(max-width:920px)').matches; }
function openMobilePanel() {
  if (!isMobileLayout()) return;
  const panel = document.getElementById('side-panel');
  panel.classList.add('mobile-open');
  panel.style.transform = 'translateY(0)'; // force override in case CSS class isn't enough
  const bd = document.getElementById('mobile-backdrop');
  if (bd) bd.classList.add('show');
}
function closeMobilePanel() {
  const panel = document.getElementById('side-panel');
  panel.classList.remove('mobile-open');
  panel.style.transform = 'translateY(100%)'; // animate closed via inline style
  setTimeout(() => { panel.style.transform = ''; }, 350); // clear after transition
  const bd = document.getElementById('mobile-backdrop');
  if (bd) bd.classList.remove('show');
  chatVisible = false;
  document.getElementById('chat-toggle-btn').classList.remove('active');
}

(function () {
  const sheet  = document.getElementById('side-panel');
  const handle = document.querySelector('.sheet-handle');
  const header = document.getElementById('sp-header');
  let startY = 0, currentY = 0, dragging = false;
  function onStart(e) { if (!isMobileLayout()) return; dragging = true; startY = (e.touches ? e.touches[0].clientY : e.clientY); sheet.style.transition = 'none'; }
  function onMove(e)  { if (!dragging) return; currentY = (e.touches ? e.touches[0].clientY : e.clientY); const dy = Math.max(0, currentY - startY); sheet.style.transform = `translateY(${dy}px)`; }
  function onEnd()    {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    const dy = currentY - startY;
    if (dy > 90) {
      closeMobilePanel(); // let closeMobilePanel handle the transform
    } else {
      sheet.style.transform = 'translateY(0)'; // snap back open
    }
    currentY = 0;
  }
  [handle, header].forEach(el => {
    if (!el) return;
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: true });
    el.addEventListener('touchend',   onEnd);
  });
})();

const ALL_PANELS = ['panel-profile', 'panel-empty', 'panel-ai', 'panel-detail', 'panel-order', 'panel-chat'];
function showPanel(id) {
  ALL_PANELS.forEach(p => {
    const el = document.getElementById(p);
    el.style.display = 'none';
    el.classList.remove('show');
  });
  const t = document.getElementById(id);
  t.style.display = 'block';
  t.classList.add('show');
  if (id !== 'panel-empty') openMobilePanel();
}

// ── CHAT ──────────────────────────────────────────────────────────────
function toggleChat() {
  chatVisible = !chatVisible;
  document.getElementById('chat-toggle-btn').classList.toggle('active', chatVisible);
  if (chatVisible) {
    setSpHeader('Rincón AI', 'Tu garzón virtual · pregunta lo que quieras');
    showPanel('panel-chat');
  } else {
    setSpHeader('Bienvenido', 'Toca un plato o revisa las recomendaciones IA');
    showPanel('panel-empty');
    chatVisible = false;
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';

  chatHistory.push({ role: 'user', content: text });
  renderChatMessages();

  const typingId = appendTyping();

  try {
    const data = await api('/api/chat', { messages: chatHistory, profile: userProfile, cart, restaurantId: activeRestaurant?.id });
    removeTyping(typingId);
    chatHistory.push({ role: 'assistant', content: data.reply });
    renderChatMessages();
  } catch {
    removeTyping(typingId);
    chatHistory.push({ role: 'assistant', content: 'Hubo un problema. Intenta de nuevo.' });
    renderChatMessages();
  }
}

function renderChatMessages() {
  const box = document.getElementById('chat-messages');
  const initial = `<div class="chat-msg assistant">
    <div class="chat-avatar"><i class="ti ti-sparkles"></i></div>
    <div class="chat-bubble">Hola 👋 Soy tu asistente virtual. Estoy aquí para ayudarte a elegir, resolver dudas sobre el menú o sugerirte algo según tus preferencias. ¿En qué te puedo ayudar?</div>
  </div>`;
  box.innerHTML = initial + chatHistory.map(m => `
    <div class="chat-msg ${m.role}">
      ${m.role === 'assistant' ? '<div class="chat-avatar"><i class="ti ti-sparkles"></i></div>' : ''}
      <div class="chat-bubble">${m.content}</div>
    </div>`).join('');
  box.scrollTop = box.scrollHeight;
}

function appendTyping() {
  const id = 'typing-' + Date.now();
  const box = document.getElementById('chat-messages');
  box.insertAdjacentHTML('beforeend', `
    <div class="chat-msg assistant" id="${id}">
      <div class="chat-avatar"><i class="ti ti-sparkles"></i></div>
      <div class="chat-bubble chat-typing">
        <div class="chat-typing-dots"><span></span><span></span><span></span></div>
      </div>
    </div>`);
  box.scrollTop = box.scrollHeight;
  return id;
}
function removeTyping(id) { document.getElementById(id)?.remove(); }

// ── AI PANEL ──────────────────────────────────────────────────────────
function showAIPanel() {
  chatVisible = false;
  document.getElementById('chat-toggle-btn').classList.remove('active');
  setSpHeader('Recomendaciones IA', currentMesa ? `Para esta hora · Mesa ${currentMesa}` : 'Para esta hora');
  const topItems = restaurantStats?.topItems || [];
  document.getElementById('ai-recs-general').innerHTML = topItems.length
    ? topItems.slice(0, 3).map(it => {
        const menuItem = MENU.find(m => m.id === it.id) || it;
        return recCard({...menuItem, emoji: it.emoji, name: it.name, price: menuItem.price || 0}, `${it.count} pedido${it.count!==1?'s':''} — el más popular`, '');
      }).join('')
    : '<p style="font-size:12px;color:var(--tx3);padding:8px 0">Los populares aparecerán aquí con los primeros pedidos</p>';
  if (isLoggedIn) renderPersonalRecs();
  if (Object.keys(cart).length > 0) {
    document.getElementById('ai-label-live').style.display = 'block';
    renderLiveAIRecs();
  } else {
    document.getElementById('ai-label-live').style.display = 'none';
    document.getElementById('ai-recs-live').innerHTML = '';
  }
  showPanel('panel-ai');
}

function renderPersonalRecs() {
  let matches = MENU.filter(m => !dietConflict(m) && dietMatch(m)).slice(0, 3);
  if (!matches.length) matches = MENU.filter(m => !dietConflict(m)).slice(0, 3);
  document.getElementById('ai-recs-personal').innerHTML =
    matches.map(it => recCard(it, whyForProfile(it), 'personal')).join('');
}

function recCard(item, why, cls) {
  return `<div class="rec-card ${cls}" onclick="showDetail(${item.id})">
    <div class="rec-emoji">${item.emoji}</div>
    <div class="rec-info"><div class="rec-name">${item.name}</div><div class="rec-why">${why}</div></div>
    <div class="rec-price">${fmt(item.price)}</div>
    <button class="rec-add" onclick="event.stopPropagation();addToCart(${item.id})" aria-label="Agregar">+</button>
  </div>`;
}

async function renderLiveAIRecs() {
  const c = document.getElementById('ai-recs-live');
  c.innerHTML = `<div class="ai-thinking"><div class="ai-thinking-dots"><span></span><span></span><span></span></div> Analizando tu pedido${userProfile.restric.length ? ' y tu perfil' : ''}...</div><div class="ai-loading"><div class="ai-skel"></div><div class="ai-skel"></div></div>`;
  const key = Object.keys(cart).sort().join(',') + '|' + JSON.stringify(userProfile);
  let recs = aiRecsCache[key];
  if (!recs) {
    try {
      const data = await api('/api/recs', { cart, profile: userProfile, hour: new Date().getHours(), restaurantId: activeRestaurant?.id });
      recs = data.recs || [];
    } catch { recs = []; }
    if (!recs.length) recs = staticOrderFallback();
    aiRecsCache[key] = recs;
  }
  if (!recs.length) { c.innerHTML = ''; return; }
  c.innerHTML = recs.map(it =>
    `<div class="rec-card live" onclick="showDetail(${it.id})">
      <div class="rec-emoji">${it.emoji}</div>
      <div class="rec-info"><div class="rec-name">${it.name}</div><div class="rec-why">${it.why}</div></div>
      <div class="rec-price">${fmt(it.price)}</div>
      <button class="rec-add" onclick="event.stopPropagation();addToCart(${it.id})" aria-label="Agregar">+</button>
    </div>`
  ).join('');
}

function staticDetailFallback(itemId) {
  const item = MENU.find(m => m.id === itemId);
  if (!item) return [];
  const others = MENU.filter(m => m.id !== itemId && !dietConflict(m));
  const pick = (cat) => others.find(m => m.cat === cat);
  const map = {
    entradas:    [[pick('principales'), 'Ideal para continuar la experiencia'], [pick('bebestibles'), 'Perfecto para acompañar la entrada']],
    principales: [[MENU.find(m => m.id === 16 && m.id !== itemId) || pick('bebestibles'), 'Maridaje clásico con este plato'], [pick('postres'), 'Para cerrar la experiencia']],
    pastas:      [[pick('bebestibles'), 'Vino que realza los sabores de la pasta'], [pick('postres'), 'El postre perfecto para cerrar']],
    postres:     [[MENU.find(m => m.id === 20), 'Café de especialidad para acompañar'], [pick('bebestibles'), 'Combinación perfecta']],
    bebestibles: [[pick('principales'), 'Plato ideal para acompañar'], [pick('entradas'), 'Para comenzar bien la noche']],
  };
  return (map[item.cat] || []).filter(([it]) => it).map(([it, why]) => ({ ...it, why })).slice(0, 2);
}

async function renderDetailAIRecs(itemId) {
  const box = document.getElementById('det-ai-recs');
  box.innerHTML = `<div class="ai-thinking"><div class="ai-thinking-dots"><span></span><span></span><span></span></div> Buscando el mejor maridaje...</div><div class="ai-loading"><div class="ai-skel" style="height:50px"></div><div class="ai-skel" style="height:50px"></div></div>`;
  let recs = [];
  try {
    const data = await api('/api/detail-recs', { itemId, profile: userProfile, restaurantId: activeRestaurant?.id });
    recs = data.recs || [];
  } catch {}
  if (!recs.length) recs = staticDetailFallback(itemId);
  if (!recs.length) { box.innerHTML = '<p style="font-size:12px;color:var(--tx3)">Sin sugerencias disponibles</p>'; return; }
  box.innerHTML = recs.map(r =>
    `<div class="det-ai-rec" onclick="showDetail(${r.id})">
      <div class="det-ai-rec-emoji">${r.emoji}</div>
      <div class="det-ai-rec-info"><div class="det-ai-rec-name">${r.name}</div><div class="det-ai-rec-why">${r.why}</div></div>
      <div class="det-ai-rec-price">${fmt(r.price)}</div>
      <button class="det-ai-add" onclick="event.stopPropagation();addToCart(${r.id})" aria-label="Agregar">+</button>
    </div>`
  ).join('');
}

function staticOrderFallback() {
  const cartIds = new Set(Object.keys(cart).map(Number));
  const cartItems = [...cartIds].map(id => MENU.find(m => m.id === id)).filter(Boolean);
  const cats = new Set(cartItems.map(m => m.cat));
  const notInCart = MENU.filter(m => !cartIds.has(m.id) && !dietConflict(m));
  const result = [];
  if (!cats.has('bebestibles')) {
    const beb = notInCart.find(m => m.cat === 'bebestibles');
    if (beb) result.push({ ...beb, why: 'Maridaje para tu pedido' });
  }
  if (!cats.has('postres')) {
    const pos = notInCart.find(m => m.cat === 'postres');
    if (pos) result.push({ ...pos, why: 'Para cerrar la experiencia' });
  }
  if (!result.length && notInCart.length) result.push({ ...notInCart[0], why: 'Complementa tu pedido' });
  return result.slice(0, 2);
}

async function renderOrderAIStrip() {
  const strip = document.getElementById('order-ai-strip');
  if (!Object.keys(cart).length) { strip.innerHTML = ''; return; }
  strip.innerHTML = `<div class="order-ai-strip"><div class="oas-title"><i class="ti ti-sparkles"></i> La IA sugiere agregar</div><div id="oas-inner"><div class="ai-loading"><div class="ai-skel" style="height:50px"></div></div></div></div>`;
  const key = Object.keys(cart).sort().join(',') + '|' + JSON.stringify(userProfile);
  let recs = aiRecsCache[key];
  if (!recs) {
    try {
      const data = await api('/api/recs', { cart, profile: userProfile, hour: new Date().getHours(), restaurantId: activeRestaurant?.id });
      recs = data.recs || [];
    } catch { recs = []; }
    if (!recs.length) recs = staticOrderFallback();
    aiRecsCache[key] = recs;
  }
  if (!recs.length) { strip.innerHTML = ''; return; }
  const inner = document.getElementById('oas-inner');
  if (inner) inner.innerHTML = recs.slice(0, 2).map(it =>
    `<div class="oas-item" onclick="showDetail(${it.id})">
      <div class="oas-emoji">${it.emoji}</div>
      <div class="oas-info"><div class="oas-name">${it.name}</div><div class="oas-why">${it.why}</div></div>
      <div class="oas-price">${fmt(it.price)}</div>
      <button class="oas-add" onclick="event.stopPropagation();addToCart(${it.id})" aria-label="Agregar">+</button>
    </div>`
  ).join('');
}

// ── DETAIL ────────────────────────────────────────────────────────────
function showDetail(id) {
  chatVisible = false;
  document.getElementById('chat-toggle-btn').classList.remove('active');
  const item = MENU.find(m => m.id === id);
  setSpHeader(item.name, 'Detalles del plato');
  document.getElementById('det-emoji').textContent = item.emoji;
  document.getElementById('det-name').textContent  = item.name;
  document.getElementById('det-price').textContent = fmt(item.price);
  document.getElementById('det-desc').textContent  = item.desc;
  document.getElementById('det-tags').innerHTML    = (item.tags || []).map(t => `<span class="tag tag-neutral">${t}</span>`).join('');
  const conflict = isLoggedIn ? dietConflict(item) : null;
  const match    = isLoggedIn && !conflict ? dietMatch(item) : false;
  const flagWrap = document.getElementById('det-diet-flag-wrap');
  if (conflict) flagWrap.innerHTML = `<div class="det-diet-flag warn"><i class="ti ti-alert-triangle"></i> Atención: ${conflict.toLowerCase()} — fuera de tu perfil dietético</div>`;
  else if (match) flagWrap.innerHTML = `<div class="det-diet-flag"><i class="ti ti-circle-check"></i> Apto para tu perfil dietético</div>`;
  else flagWrap.innerHTML = '';
  document.getElementById('det-add-btn').onclick = () => { addToCart(id); showOrderPanel(); };
  showPanel('panel-detail');
  renderDetailAIRecs(id);
}

// ── CART ──────────────────────────────────────────────────────────────
function addToCart(id) {
  aiRecsCache = {};
  cart[id] = (cart[id] || 0) + 1;
  updateCartBar();
  renderMenu();
  const item = MENU.find(m => m.id === +id);
  document.getElementById('nudge-text').textContent = `Agregaste ${item.name} — la IA tiene sugerencias`;
  document.getElementById('ai-nudge').style.display = 'flex';
}
function changeQty(id, delta) {
  aiRecsCache = {};
  cart[id] = (cart[id] || 0) + delta;
  if (cart[id] <= 0) delete cart[id];
  updateCartBar();
  renderMenu();
  if (!Object.keys(cart).length) {
    setSpHeader('Pedido vacío', 'Agrega platos desde el menú');
    document.getElementById('ai-nudge').style.display = 'none';
    showPanel('panel-empty');
  } else { showOrderPanel(); }
}
function updateCartBar() {
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = Object.entries(cart).reduce((a, [id, q]) => a + (MENU.find(m => m.id === +id)?.price || 0) * q, 0);
  const fmtTotal = fmt(total);
  // Desktop cart bar
  document.getElementById('cart-count').textContent     = count;
  document.getElementById('cart-total-bar').textContent = fmtTotal;
  document.getElementById('cart-bar').style.display     = count > 0 ? 'flex' : 'none';
  // Mobile FAB
  const fab = document.getElementById('cart-fab');
  if (fab) {
    fab.classList.toggle('visible', count > 0);
    const fabCount = document.getElementById('cart-fab-count');
    const fabTotal = document.getElementById('cart-fab-total');
    if (fabCount) fabCount.textContent = count;
    if (fabTotal) fabTotal.textContent = fmtTotal;
  }
}
function showOrderPanel() {
  if (!Object.keys(cart).length) return;
  chatVisible = false;
  document.getElementById('chat-toggle-btn').classList.remove('active');
  setSpHeader('Tu pedido', 'Revisa antes de enviar a cocina');
  switchOrderTab('personal');
  document.getElementById('order-items').innerHTML = Object.entries(cart).map(([id, q]) => {
    const it = MENU.find(m => m.id === +id);
    const line = it.price * q;
    return `<div class="order-item">
      <span style="font-size:20px">${it.emoji}</span>
      <span class="oi-name">${it.name}</span>
      <div class="qty-ctrl">
        <button class="qty-btn" onclick="changeQty(${id},-1)">−</button>
        <span class="qty-num">${q}</span>
        <button class="qty-btn" onclick="changeQty(${id},1)">+</button>
      </div>
      <span class="oi-price">${fmt(line)}</span>
    </div>`;
  }).join('');
  showPanel('panel-order');
  renderOrderAIStrip();
}

// ── SEND ORDER ────────────────────────────────────────────────────────
async function sendOrder() {
  const cartItems = Object.entries(cart).map(([id, qty]) => {
    const it = MENU.find(m => m.id === +id);
    return it ? { id: +id, name: it.name, emoji: it.emoji, qty, price: it.price } : null;
  }).filter(Boolean);
  const total = cartItems.reduce((a, i) => a + i.price * i.qty, 0);
  const pts = Math.floor(total / 100);

  // Persist order to DB
  if (activeRestaurant) {
    fetch(`/api/restaurants/${activeRestaurant.id}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesa: currentMesa || 0, items: cartItems, total, user_name: userName || null, user_id: currentUserId || null }),
    }).catch(() => {});
  }
  // Persist user points if logged in
  if (isLoggedIn && currentUserId) {
    fetch(`/api/users/${currentUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: userPoints + pts }),
    }).catch(() => {});
  }
  cart = {};
  updateCartBar();
  renderMenu();
  aiRecsCache = {};
  document.getElementById('ai-nudge').style.display = 'none';
  editSecs = 120;
  setSpHeader('Pedido enviado', `${currentMesa ? `Mesa ${currentMesa} · ` : ''}${activeRestaurant?.name || ''}`);
  switchOrderTab('personal');
  document.getElementById('order-content-personal').innerHTML = `
    <div class="sent-box"><div class="big-emo">✅</div><h3>¡Pedido enviado a cocina!</h3><p>Tiempo estimado: 15–20 minutos</p></div>
    <div class="ewb" id="ewb">
      <div class="ewb-title"><i class="ti ti-pencil"></i> Puedes modificar tu pedido</div>
      <div class="ewb-desc">La cocina aún no comienza. Tienes 2 minutos para cambios.</div>
      <div class="ewb-timer" id="ewb-timer">2:00</div>
    </div>
    <button class="edit-btn" id="edit-btn" onclick="startEditing()"><i class="ti ti-pencil"></i> Modificar pedido</button>
    ${isLoggedIn
      ? `<div class="pts-earned"><div class="pts-big">+${pts}</div><div><p>Puntos ganados</p><span>Total: ${userPoints + pts} pts</span></div></div>`
      : `<div style="background:var(--amber-bg);border:1px solid rgba(224,168,82,0.3);border-radius:var(--rmd);padding:13px;margin-top:10px;text-align:center"><p style="font-size:12px;color:var(--amber);font-weight:600">Habrías ganado <strong>+${pts} puntos</strong> con cuenta</p><button class="mbtn" style="margin-top:8px;padding:9px" onclick="showRegisterModal()">Crear cuenta ahora</button></div>`
    }`;
  if (isLoggedIn) userPoints += pts;
  showPanel('panel-order');
  if (editTimer) clearInterval(editTimer);
  editTimer = setInterval(() => {
    editSecs--;
    const m = Math.floor(editSecs / 60), s = editSecs % 60;
    const el = document.getElementById('ewb-timer');
    if (el) el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    if (editSecs <= 0) {
      clearInterval(editTimer);
      const ewb = document.getElementById('ewb');
      const btn = document.getElementById('edit-btn');
      if (ewb) ewb.innerHTML = '<div class="ewb-title"><i class="ti ti-chef-hat"></i> En preparación</div><div class="ewb-desc">Ya no es posible modificar. ¡El equipo está cocinando!</div>';
      if (btn) btn.style.display = 'none';
    }
  }, 1000);
}

function startEditing() {
  if (editSecs <= 0) return;
  clearInterval(editTimer);
  cart = { 5: 1, 16: 1 };
  updateCartBar();
  renderMenu();
  setSpHeader('Modificar pedido', 'Confirma antes de que cierre la ventana');
  switchOrderTab('personal');
  document.getElementById('order-content-personal').innerHTML = `
    <div class="edit-notice"><i class="ti ti-pencil"></i><div><p>Ventana de modificación abierta</p><span>Tiempo: <span id="edit-countdown">${Math.floor(editSecs/60)}:${(editSecs%60).toString().padStart(2,'0')}</span></span></div></div>
    <div id="order-items"></div>
    <div id="order-ai-strip"></div>
    <button class="send-btn" onclick="sendOrder()"><i class="ti ti-refresh"></i> Confirmar cambios</button>`;
  showPanel('panel-order');
  showOrderPanel();
  editTimer = setInterval(() => {
    editSecs--;
    const el = document.getElementById('edit-countdown');
    if (el) el.textContent = `${Math.floor(editSecs/60)}:${(editSecs%60).toString().padStart(2,'0')}`;
    if (editSecs <= 0) { clearInterval(editTimer); sendOrder(); }
  }, 1000);
}

// ── PROFILE PANEL ─────────────────────────────────────────────────────
function showProfilePanel() {
  chatVisible = false;
  document.getElementById('chat-toggle-btn').classList.remove('active');
  if (isLoggedIn) {
    setSpHeader(userName, 'Tu perfil · El Rincón');
    const allPrefs = [...userProfile.restric, ...userProfile.dieta, ...userProfile.gustos];
    const pct = Math.min(100, Math.round((userPoints % 300) / 300 * 100));
    const ptsNext = 300 - (userPoints % 300);
    document.getElementById('profile-content').innerHTML = `
      <div class="prof-hero">
        <div class="prof-avatar"><i class="ti ti-star-filled"></i></div>
        <div class="prof-name">${userName}</div>
        <div class="prof-type">✦ Cliente registrado · El Rincón</div>
      </div>
      <div class="prof-pts-card">
        <div class="prof-pts-row">
          <span class="prof-pts-label">Puntos acumulados</span>
          <span class="prof-pts-val">${userPoints} pts</span>
        </div>
        <div class="prof-pts-bar-track"><div class="prof-pts-bar-fill" style="width:${pct}%"></div></div>
        <div class="prof-pts-next">${ptsNext} puntos más para un postre gratis</div>
      </div>
      <div class="prof-section">
        <div class="prof-section-label">Beneficios activos</div>
        <div style="background:var(--bgc);border:1px solid var(--line);border-radius:var(--rmd);padding:10px 12px">
          <div style="font-size:12px;color:var(--tx);margin-bottom:6px;display:flex;gap:8px;align-items:center"><span style="color:var(--gold)">✦</span> Recomendaciones IA personalizadas</div>
          <div style="font-size:12px;color:var(--tx);margin-bottom:6px;display:flex;gap:8px;align-items:center"><span style="color:var(--gold)">✦</span> Acumula puntos en cada visita</div>
          <div style="font-size:12px;color:var(--tx2);display:flex;gap:8px;align-items:center"><span style="color:var(--tx3)">○</span> Postre gratis al llegar a ${Math.ceil(userPoints / 300) * 300} pts</div>
        </div>
      </div>
      <div class="prof-section">
        <div class="prof-section-label">Restricciones dietéticas</div>
        <div class="prof-pref-chips">
          ${userProfile.restric.length ? userProfile.restric.map(r => `<span class="prof-pref-chip">⚠ ${r}</span>`).join('') : '<span class="prof-pref-empty">Sin restricciones declaradas</span>'}
        </div>
      </div>
      <div class="prof-section">
        <div class="prof-section-label">Dieta y preferencias</div>
        <div class="prof-pref-chips">
          ${[...userProfile.dieta, ...userProfile.gustos].length
            ? [...userProfile.dieta, ...userProfile.gustos].map(p => `<span class="prof-pref-chip">✦ ${p}</span>`).join('')
            : '<span class="prof-pref-empty">Sin preferencias declaradas</span>'}
        </div>
      </div>
      <button class="prof-action-btn primary" onclick="closeProfileAndEditPrefs()"><i class="ti ti-pencil"></i> Editar preferencias</button>
      <button class="prof-action-btn secondary" onclick="logOut()"><i class="ti ti-logout"></i> Cerrar sesión</button>`;
  } else {
    setSpHeader('Tu cuenta', 'Accede o regístrate');
    document.getElementById('profile-content').innerHTML = `
      <div class="prof-guest-box">
        <div class="big-emo">👤</div>
        <h3>Estás como invitado</h3>
        <p>Crea una cuenta para recomendaciones personalizadas, puntos y beneficios en toda la red MenuAI.</p>
        <button class="prof-action-btn primary" onclick="closePanelAndRegister()"><i class="ti ti-user-plus"></i> Crear cuenta gratis</button>
        <button class="prof-action-btn secondary" onclick="closePanelAndLogin()"><i class="ti ti-login"></i> Iniciar sesión</button>
      </div>`;
  }
  showPanel('panel-profile');
}
function closeProfileAndEditPrefs() {
  resetOnboarding();
  document.getElementById('modal-register').classList.add('show');
  closeMobilePanel();
}
function closePanelAndRegister() { closeMobilePanel(); showRegisterModal(); }
function closePanelAndLogin()    { closeMobilePanel(); showLoginModal(); }
function logOut() {
  isLoggedIn = false;
  currentUserId = null;
  userProfile = { restric: [], dieta: [], gustos: [] };
  userName = '';
  userPoints = 0;
  cart = {};
  updateCartBar();
  enterAsGuest();
}

// ── ORDER TABS ─────────────────────────────────────────────────────────
function switchOrderTab(tab) {
  document.getElementById('otab-personal').classList.toggle('active', tab === 'personal');
  document.getElementById('otab-mesa').classList.toggle('active', tab === 'mesa');
  document.getElementById('order-content-personal').style.display = tab === 'personal' ? '' : 'none';
  document.getElementById('order-content-mesa').style.display = tab === 'mesa' ? '' : 'none';
  if (tab === 'mesa') renderTableOrder();
}

function renderTableOrder() {
  const myItems = Object.entries(cart);
  document.getElementById('otab-mesa-badge').textContent = myItems.length > 0 ? '1' : '0';

  if (!myItems.length) {
    document.getElementById('table-order-list').innerHTML = '<p style="font-size:12px;color:var(--tx3);padding:12px 0">Agrega platos para ver tu pedido de mesa</p>';
    return;
  }

  const totalCount = myItems.reduce((a, [, q]) => a + q, 0);
  document.getElementById('table-order-list').innerHTML = `
    <div class="table-person-section mine">
      <div class="table-person-header">
        <div class="table-person-dot" style="background:var(--gold)"></div>
        <div class="table-person-name">${isLoggedIn ? userName : 'Tú (invitado)'}</div>
        <span class="table-person-mine-badge">Tú</span>
      </div>
      <div class="table-person-items">
        ${myItems.map(([id, q]) => {
          const it = MENU.find(m => m.id === +id);
          return it ? `<div class="table-person-item"><span class="tpi-emoji">${it.emoji}</span><span class="tpi-name">${it.name}</span><span class="tpi-qty">x${q}</span></div>` : '';
        }).join('')}
      </div>
    </div>
    <div class="table-mesa-summary"><span>Total de tu pedido</span><strong>${totalCount} plato${totalCount!==1?'s':''}</strong></div>`;
}

// ── ADMIN ─────────────────────────────────────────────────────────────
let adminPollTimer = null;
function showAdmin(name, el) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.getElementById('admin-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');

  if (adminPollTimer) clearInterval(adminPollTimer);

  const refresh = () => {
    if (name === 'pedidos') renderOrders();
    if (['dashboard','analytics','insights','clientes','mesas'].includes(name)) {
      loadRestaurantStats().then(() => {
        if (name === 'dashboard' || name === 'analytics') renderDashboard();
        if (name === 'insights') renderInsights();
        if (name === 'clientes') renderClientes();
        if (name === 'mesas') renderMesas();
      });
    }
  };
  refresh();
  adminPollTimer = setInterval(refresh, 20000);
}

async function loadRestaurantStats() {
  const id = activeRestaurant?.id;
  if (!id) return;
  try {
    const res = await fetch(`/api/restaurants/${id}/stats`);
    restaurantStats = await res.json();
  } catch { restaurantStats = null; }
}
function renderBarChart(id, values, labels, peakIdx) {
  const max = Math.max(...values, 1);
  document.getElementById(id).innerHTML = values.map((v, i) =>
    `<div class="bar-col"><div class="bar-rect ${i === peakIdx ? 'peak' : ''}" style="height:${Math.round(v / max * 80)}px" title="${v}"></div><div class="bar-label">${labels[i]}</div></div>`
  ).join('');
}

function renderTopList(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--tx3);padding:8px 0">Sin datos aún — aparecerán con los primeros pedidos</p>';
    return;
  }
  el.innerHTML = items.slice(0, 5).map((it, i) =>
    `<div class="top-item"><div class="top-rank">${i + 1}</div><div class="top-emoji">${it.emoji}</div><div class="top-info"><div class="top-name">${it.name}</div><div class="top-count">${it.count} pedido${it.count !== 1 ? 's' : ''}</div></div><div class="top-bar-track"><div class="top-bar-fill" style="width:${it.pct}%"></div></div></div>`
  ).join('');
}

function renderDashboard() {
  const stats = restaurantStats;
  const r = activeRestaurant;

  // Update date subtitle
  const sub = document.getElementById('admin-dash-sub');
  if (sub) sub.textContent = new Date().toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' }) + ' · ' + (r?.name || '');

  // KPI cards
  const kpis = document.getElementById('admin-kpis');
  if (kpis) {
    const orders = stats?.ordersCount || 0;
    const revenue = stats?.revenue || 0;
    const avgTicket = stats?.avgTicket || 0;
    const users = stats?.registeredUsers || 0;
    const noData = '<div class="mdelta neutral"><i class="ti ti-clock"></i> Sin datos aún</div>';
    kpis.innerHTML = `
      <div class="mcard"><div class="mlabel">Pedidos totales</div><div class="mval">${orders.toLocaleString('es-CL')}</div>${orders > 0 ? '<div class="mdelta up"><i class="ti ti-check"></i> Datos reales</div>' : noData}</div>
      <div class="mcard"><div class="mlabel">Ticket promedio</div><div class="mval">${avgTicket > 0 ? fmt(avgTicket) : '—'}</div>${avgTicket > 0 ? '<div class="mdelta neutral"><i class="ti ti-receipt"></i> Promedio real</div>' : noData}</div>
      <div class="mcard"><div class="mlabel">Ventas totales</div><div class="mval">${revenue > 0 ? '$' + (revenue/1000000).toFixed(2) + 'M' : '—'}</div>${revenue > 0 ? '<div class="mdelta up"><i class="ti ti-trending-up"></i> Acumulado</div>' : noData}</div>
      <div class="mcard"><div class="mlabel">Usuarios registrados</div><div class="mval">${users.toLocaleString('es-CL')}</div>${users > 0 ? '<div class="mdelta up"><i class="ti ti-users"></i> Cuentas activas</div>' : noData}</div>`;
  }

  // Hourly chart (hours 10–23)
  const byHour = stats?.byHour || Array(24).fill(0);
  const chartSlice = byHour.slice(10, 24);
  const labels = ['10','11','12','13','14','15','16','17','18','19','20','21','22','23'];
  const peakIdx = chartSlice.indexOf(Math.max(...chartSlice));
  renderBarChart('chart-hourly', chartSlice, labels, peakIdx);

  // Analytics hourly and weekly (reuse hourly data for weekly approximation)
  const analyticsKpis = document.getElementById('analytics-kpis');
  if (analyticsKpis) {
    const topCombo = stats?.topCombos?.[0];
    const peakHour = byHour.indexOf(Math.max(...byHour));
    const noData = '<div class="mdelta neutral"><i class="ti ti-clock"></i> Sin datos aún</div>';
    analyticsKpis.innerHTML = `
      <div class="mcard"><div class="mlabel">Pedidos totales</div><div class="mval">${(stats?.ordersCount||0).toLocaleString('es-CL')}</div>${(stats?.ordersCount||0)>0?'<div class="mdelta neutral"><i class="ti ti-receipt"></i> Acumulado</div>':noData}</div>
      <div class="mcard"><div class="mlabel">Ticket promedio</div><div class="mval">${(stats?.avgTicket||0)>0?fmt(stats.avgTicket):'—'}</div>${(stats?.avgTicket||0)>0?'<div class="mdelta neutral"><i class="ti ti-minus"></i> Real</div>':noData}</div>
      <div class="mcard"><div class="mlabel">Combo más pedido</div><div class="mval" style="font-size:13px">${topCombo?`${topCombo.a.emoji||''}${topCombo.b.emoji||''} ${topCombo.a.name?.split(' ')[0]||''} + ${topCombo.b.name?.split(' ')[0]||''}`:'—'}</div>${topCombo?`<div class="mdelta neutral">${topCombo.count} veces</div>`:noData}</div>
      <div class="mcard"><div class="mlabel">Hora peak</div><div class="mval">${Math.max(...byHour)>0?peakHour+':00':'—'}</div>${Math.max(...byHour)>0?'<div class="mdelta neutral"><i class="ti ti-clock"></i> Hora real</div>':noData}</div>`;
  }

  renderBarChart('chart-weekly', chartSlice, labels, peakIdx);
  renderTopList('top-list-dash', stats?.topItems);
  renderTopList('top-list-analytics', stats?.topItems);
  renderNotifs();
}
async function renderOrders() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--tx3);padding:20px">Cargando pedidos...</td></tr>';
  try {
    const restId = activeRestaurant?.id || 'el-rincon';
    const res = await fetch(`/api/restaurants/${restId}/orders`);
    const data = await res.json();
    const orders = data.orders || [];
    const L = { cooking:'En cocina', ready:'Listo', delivered:'Entregado', cancelled:'Cancelado' };
    const C = { cooking:'sc', ready:'sr', delivered:'sr', cancelled:'sa' };
    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--tx3);padding:20px">Sin pedidos aún para ${activeRestaurant?.name || 'este restaurante'}</td></tr>`;
      return;
    }
    tbody.innerHTML = orders.map(o => {
      const itemsSummary = o.items.map(i => `${i.emoji||''} ${i.name} x${i.qty}`).join(', ');
      const hora = new Date(o.created_at).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });
      return `<tr>
        <td style="color:var(--tx3);font-weight:600">#${o.id}</td>
        <td>Mesa ${o.mesa}</td>
        <td style="color:var(--tx2);font-size:12px">${itemsSummary}</td>
        <td style="font-weight:600">${fmt(o.total)}</td>
        <td style="color:var(--tx3)">${hora}</td>
        <td><span class="spill ${C[o.status]||'sc'}">${L[o.status]||o.status}</span></td>
        <td>—</td>
      </tr>`;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--tx3)">Error cargando pedidos</td></tr>';
  }
}
function renderMenuAdmin() {
  document.getElementById('menu-admin-list').innerHTML = MENU.map(it =>
    `<div class="menu-admin-item ${menuItemsActive[it.id] ? '' : 'off'}" id="mai-${it.id}">
      <div class="mai-emoji">${it.emoji}</div>
      <div class="mai-meta"><div class="mai-name">${it.name}</div><div class="mai-cat">${it.cat.charAt(0).toUpperCase() + it.cat.slice(1)}${it.contains?.length ? ' · contiene ' + it.contains.join(', ') : ''}</div></div>
      <div class="mai-price">${fmt(it.price)}</div>
      <label class="toggle"><input type="checkbox" ${menuItemsActive[it.id] ? 'checked' : ''} onchange="toggleItem(${it.id},this)"><span class="ttrack"></span></label>
    </div>`
  ).join('');
}
function toggleItem(id, cb) {
  menuItemsActive[id] = cb.checked;
  document.getElementById('mai-' + id).classList.toggle('off', !cb.checked);
}
function renderMesas() {
  const tableCount = activeRestaurant?.tables || 20;
  const act = new Set(restaurantStats?.activeMesas || []);
  document.getElementById('mesas-grid').innerHTML = Array.from({ length: tableCount }, (_, i) => i + 1).map(n => {
    const a = act.has(n);
    return `<div class="mesa-tile ${a ? 'active-order' : ''}"><div class="mesa-num">${n}</div><div class="mesa-st">${a ? 'Pedido activo' : 'Libre'}</div></div>`;
  }).join('');
}
function renderNotifs() {
  const el = document.getElementById('notif-list-dash');
  if (!el) return;
  const orders = restaurantStats?.recentOrders || [];
  if (!orders.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--tx3);padding:8px 0">Sin actividad aún — las notificaciones aparecerán con los primeros pedidos</p>';
    return;
  }
  el.innerHTML = orders.slice(0, 5).map((o, i) => {
    const summary = o.items.slice(0, 2).map(it => `${it.emoji||''}${it.name} x${it.qty}`).join(', ');
    const hora = new Date(o.created_at).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });
    return `<div class="notif-item ${i<2?'new':''}"><div class="ndot ${i<2?'':'read'}"></div><div><div class="ntitle">Pedido #${o.id} — Mesa ${o.mesa}</div><div class="nsub">${summary}</div></div><div class="ntime">${hora}</div></div>`;
  }).join('');
}

function renderInsights() {
  const stats = restaurantStats;
  const empty = '<p style="font-size:12px;color:var(--tx3);padding:8px 0">Sin datos aún — aparecerán con los primeros pedidos</p>';

  // Stat cards
  const grid = document.getElementById('insights-stat-grid');
  if (grid) {
    const orders = stats?.ordersCount || 0;
    const users = stats?.registeredUsers || 0;
    const byHour = stats?.byHour || Array(24).fill(0);
    const peakHour = byHour.indexOf(Math.max(...byHour));
    const topItem = stats?.topItems?.[0];
    const regPct = orders > 0 ? Math.round(users / orders * 100) : 0;
    grid.innerHTML = `
      <div class="insight-card"><div class="insight-icon">📦</div><div class="insight-val">${orders.toLocaleString('es-CL')}</div><div class="insight-label">Pedidos totales</div><div class="insight-sub">${orders>0?'Desde el inicio':'Sin pedidos aún'}</div></div>
      <div class="insight-card"><div class="insight-icon">⏰</div><div class="insight-val">${Math.max(...byHour)>0?peakHour+':00':'—'}</div><div class="insight-label">Hora peak</div><div class="insight-sub">${Math.max(...byHour)>0?'Hora con más pedidos':'Sin datos aún'}</div></div>
      <div class="insight-card"><div class="insight-icon">👥</div><div class="insight-val">${users.toLocaleString('es-CL')}</div><div class="insight-label">Usuarios registrados</div><div class="insight-sub">${users>0?'Cuentas creadas':'Sin usuarios aún'}</div></div>
      <div class="insight-card"><div class="insight-icon">⭐</div><div class="insight-val" style="font-size:13px">${topItem?`${topItem.emoji} ${topItem.name.split(' ').slice(0,2).join(' ')}`:'—'}</div><div class="insight-label">Plato más pedido</div><div class="insight-sub">${topItem?topItem.count+' veces pedido':'Sin pedidos aún'}</div></div>
      <div class="insight-card"><div class="insight-icon">📱</div><div class="insight-val">${orders>0?regPct+'%':'—'}</div><div class="insight-label">Tasa de registro</div><div class="insight-sub">${orders>0?'Clientes que crean cuenta':'Sin datos aún'}</div></div>
      <div class="insight-card"><div class="insight-icon">💰</div><div class="insight-val">${stats?.avgTicket>0?fmt(stats.avgTicket):'—'}</div><div class="insight-label">Ticket promedio</div><div class="insight-sub">${stats?.avgTicket>0?'Por pedido real':'Sin pedidos aún'}</div></div>`;
  }

  // Combos reales
  const comboEl = document.getElementById('combo-list');
  if (comboEl) {
    const combos = stats?.topCombos || [];
    if (!combos.length) { comboEl.innerHTML = empty; }
    else {
      comboEl.innerHTML = combos.map(c =>
        `<div class="combo-item"><div class="combo-emojis">${c.a.emoji||'🍽️'}${c.b.emoji||'🍽️'}</div><div class="combo-info"><div class="combo-name">${c.a.name} + ${c.b.name}</div><div class="combo-freq">${c.count} vez${c.count>1?'es':''}</div></div><div class="combo-upsell">x${c.count}</div></div>`
      ).join('');
    }
  }

  // Segmentación: restricciones dietéticas de usuarios reales (cargamos async)
  const segEl = document.getElementById('segment-grid');
  if (segEl) {
    segEl.innerHTML = '<p style="font-size:12px;color:var(--tx3)">Cargando...</p>';
    fetch(`/api/restaurants/${activeRestaurant?.id}/users`)
      .then(r => r.json())
      .then(d => {
        const users = d.users || [];
        if (!users.length) { segEl.innerHTML = empty; return; }
        const dietCount = {};
        users.forEach(u => u.restric.forEach(r => { dietCount[r] = (dietCount[r]||0)+1; }));
        const total = users.length;
        const dietEntries = Object.entries(dietCount).sort((a,b) => b[1]-a[1]).slice(0,5);
        const colors = ['#C9A24C','#D9B968','#8C7536','#6FC28C','#5F5645'];
        segEl.innerHTML = `<div class="segment-card" style="grid-column:1/-1">
          <div class="segment-label">Restricciones dietéticas declaradas</div>
          ${dietEntries.length ? dietEntries.map(([k,v],i) =>
            `<div class="segment-bar-row"><div class="segment-bar-label">${k}</div><div class="segment-bar-track"><div class="segment-bar-fill" style="width:${Math.round(v/total*100)}%;background:${colors[i]}"></div></div><div class="segment-bar-pct">${Math.round(v/total*100)}%</div></div>`
          ).join('') : '<p style="font-size:12px;color:var(--tx3)">Ningún usuario ha declarado restricciones aún</p>'}
        </div>`;
      }).catch(() => { if (segEl) segEl.innerHTML = empty; });
  }
}

async function renderClientes() {
  // KPI cards
  const kpisEl = document.getElementById('clientes-kpis');
  if (kpisEl) {
    const users = restaurantStats?.registeredUsers || 0;
    const avgTicket = restaurantStats?.avgTicket || 0;
    const noData = '<div class="mdelta neutral"><i class="ti ti-clock"></i> Sin datos aún</div>';
    kpisEl.innerHTML = `
      <div class="mcard"><div class="mlabel">Usuarios registrados</div><div class="mval">${users.toLocaleString('es-CL')}</div>${users>0?'<div class="mdelta up"><i class="ti ti-users"></i> Total real</div>':noData}</div>
      <div class="mcard"><div class="mlabel">Ticket promedio</div><div class="mval">${avgTicket>0?fmt(avgTicket):'—'}</div>${avgTicket>0?'<div class="mdelta neutral"><i class="ti ti-receipt"></i> Por pedido</div>':noData}</div>
      <div class="mcard"><div class="mlabel">Pedidos totales</div><div class="mval">${(restaurantStats?.ordersCount||0).toLocaleString('es-CL')}</div>${(restaurantStats?.ordersCount||0)>0?'<div class="mdelta up"><i class="ti ti-trending-up"></i> Acumulado</div>':noData}</div>
      <div class="mcard"><div class="mlabel">Plato top</div><div class="mval" style="font-size:14px">${restaurantStats?.topItems?.[0]?restaurantStats.topItems[0].emoji+' '+restaurantStats.topItems[0].name.split(' ').slice(0,2).join(' '):'—'}</div>${restaurantStats?.topItems?.[0]?`<div class="mdelta neutral">${restaurantStats.topItems[0].count} pedidos</div>`:noData}</div>`;
  }

  // User table from DB
  const tbody = document.getElementById('user-table-body');
  const dietEl = document.getElementById('diet-dist');
  const ageEl  = document.getElementById('age-dist');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--tx3);padding:16px">Cargando clientes...</td></tr>';
  try {
    const res = await fetch(`/api/restaurants/${activeRestaurant?.id}/users`);
    const data = await res.json();
    const users = data.users || [];
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--tx3);padding:16px">Sin usuarios registrados aún</td></tr>';
      if (dietEl) dietEl.innerHTML = '<p style="font-size:12px;color:var(--tx3)">Sin datos aún</p>';
      if (ageEl)  ageEl.innerHTML  = '<p style="font-size:12px;color:var(--tx3)">Sin datos aún</p>';
      return;
    }
    tbody.innerHTML = users.map((u,i) => {
      const dietas = [...u.restric, ...u.dieta].slice(0,2);
      return `<tr>
        <td style="color:var(--tx3);font-weight:600">U-${String(u.id).padStart(3,'0')}</td>
        <td><span class="user-badge">${u.name}</span></td>
        <td style="font-weight:600">${u.points}</td>
        <td style="color:var(--gold2);font-weight:600">${u.email||'—'}</td>
        <td>${u.gustos[0]||'—'}</td>
        <td>${dietas.length?dietas.map(x=>`<span class="diet-badge">${x}</span>`).join(''):'<span style="color:var(--tx3)">—</span>'}</td>
        <td style="font-weight:600;color:var(--plum)">${u.points} pts</td>
      </tr>`;
    }).join('');

    // Dietary distribution from real data
    const dietCount = {};
    users.forEach(u => u.restric.forEach(r => { dietCount[r] = (dietCount[r]||0)+1; }));
    const total = users.length;
    const dietEntries = Object.entries(dietCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const colors = ['#C9A24C','#D9B968','#8C7536','#6FC28C','#5F5645'];
    if (dietEl) {
      dietEl.innerHTML = dietEntries.length
        ? dietEntries.map(([k,v],i) =>
          `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="width:110px;font-size:11px;color:var(--tx2)">${k}</div><div style="flex:1;height:8px;background:var(--bgh);border-radius:4px;overflow:hidden"><div style="height:100%;width:${Math.round(v/total*100)}%;background:${colors[i]};border-radius:4px"></div></div><div style="font-size:12px;font-weight:600;color:var(--tx);width:28px">${Math.round(v/total*100)}%</div></div>`
        ).join('')
        : '<p style="font-size:12px;color:var(--tx3)">Ningún usuario ha declarado restricciones</p>';
    }
    if (ageEl) ageEl.innerHTML = '<p style="font-size:12px;color:var(--tx3)">Segmentación por edad disponible próximamente</p>';
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--tx3)">Error cargando clientes</td></tr>';
  }
}

// ── QR HELPERS ────────────────────────────────────────────────────────
function updateEntryQR() {
  const id = activeRestaurant?.id;
  const param = id ? `?restaurant=${encodeURIComponent(id)}` : '';
  const img = document.getElementById('entry-qr-img');
  if (img) img.src = `/api/qr${param}`;
  const adminImg = document.querySelector('.admin-qr-img');
  if (adminImg) adminImg.src = `/api/qr${param}`;
}
function copyQRUrl() {
  const id = activeRestaurant?.id;
  const url = window.location.origin + (id ? `/${id}` : '');
  navigator.clipboard.writeText(url).then(() => {
    const btn = event.currentTarget;
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="ti ti-check"></i> ¡Copiado!';
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
  });
}
function downloadQR() {
  const id = activeRestaurant?.id;
  const a = document.createElement('a');
  a.href = `/api/qr${id ? `?restaurant=${encodeURIComponent(id)}` : ''}`;
  a.download = `qr-${id || 'menu'}.svg`;
  a.click();
}

// ── MOBILE KEYBOARD HANDLING ──────────────────────────────────────────
(function () {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.addEventListener('focus', () => {
    if (!isMobileLayout()) return;
    setTimeout(() => {
      const msgs = document.getElementById('chat-messages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
  });
})();

// ── RED NETWORK VIEW ──────────────────────────────────────────────────

let redInitialized = false;
let selectedRestaurantEmoji = '🍽️';

let NETWORK_RESTAURANTS = [];


async function activateRestaurant(id) {
  const r = NETWORK_RESTAURANTS.find(x => x.id === id);
  if (!r) return;
  if (activeRestaurant?.id === id) return; // already active — no-op
  activeRestaurant = r;
  restaurantStats = null; // reset stats cache for new restaurant

  // Fetch menu from API
  try {
    const res = await fetch(`/api/restaurants/${id}/menu`);
    const data = await res.json();
    MENU.length = 0;
    (data.items || []).forEach(item => MENU.push(item));
  } catch {}
  MENU.forEach(m => { if (menuItemsActive[m.id] === undefined) menuItemsActive[m.id] = true; });

  cart = {};
  currentCat = 'todos';
  aiRecsCache = {};
  updateCartBar();

  // Update all views' text labels
  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val; };
  set('entry-rest-name', r.name);
  set('entry-rest-tagline', r.city + ', ' + r.region);
  set('entry-qr-label-text', `Código QR de acceso · ${r.name}`);
  set('client-rest-name', r.name);
  set('client-rest-sub', 'MENÚ DIGITAL · ' + r.city.toUpperCase());
  set('admin-rest-label', r.name + ' · ' + r.city);
  set('admin-dash-sub', new Date().toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' }) + ' · ' + r.name);
  set('active-rest-chip-name', r.name);
  const emojiEl = document.getElementById('active-rest-emoji');
  if (emojiEl) emojiEl.textContent = r.emoji;

  renderMenu();
  renderMenuAdmin();
  renderMesas();
  updateEntryQR();

  showToast(`${r.emoji} Cambiado a ${r.name} — todas las vistas actualizadas`);
}

function initRedView() {
  const sel = document.getElementById('net-filter-rest');
  NETWORK_RESTAURANTS.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id; opt.textContent = r.emoji + ' ' + r.name;
    sel.appendChild(opt);
  });
  renderNetworkInsights();
  renderRestaurantGrid();
}

function switchRedTab(tab, el) {
  document.querySelectorAll('.red-section').forEach(s => s.classList.remove('active'));
  document.getElementById('red-section-' + tab).classList.add('active');
  document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('red-actions').style.display = tab === 'insights' ? 'flex' : 'none';
}

async function renderNetworkInsights() {
  const filterRest = document.getElementById('net-filter-rest')?.value || 'all';
  const filterCat  = document.getElementById('net-filter-cat')?.value  || 'all';
  const rests = filterRest === 'all' ? NETWORK_RESTAURANTS : NETWORK_RESTAURANTS.filter(r => r.id === filterRest);

  // Reload fresh restaurant data from API to get real counts
  try {
    const r2 = await fetch('/api/restaurants');
    const d2 = await r2.json();
    NETWORK_RESTAURANTS.length = 0;
    (d2.restaurants || []).forEach(r => NETWORK_RESTAURANTS.push({ ...r, orders: r.orders_count, avgTicket: r.avg_ticket, upsellPct: r.upsell_pct, registeredUsers: r.registered_users }));
  } catch {}

  const filtered = filterRest === 'all' ? NETWORK_RESTAURANTS : NETWORK_RESTAURANTS.filter(r => r.id === filterRest);
  const totalOrders  = filtered.reduce((a, r) => a + r.orders, 0);
  const totalRevenue = filtered.reduce((a, r) => a + r.revenue, 0);
  const avgTicket    = filtered.length ? Math.round(filtered.reduce((a, r) => a + r.avgTicket, 0) / filtered.length) : 0;
  const noData = '<div class="mdelta neutral"><i class="ti ti-clock"></i> Sin datos aún</div>';

  document.getElementById('net-kpis').innerHTML = `
    <div class="mcard"><div class="mlabel">Pedidos totales red</div><div class="mval">${totalOrders.toLocaleString('es-CL')}</div>${totalOrders>0?'<div class="mdelta up"><i class="ti ti-trending-up"></i> Datos reales</div>':noData}</div>
    <div class="mcard"><div class="mlabel">Ventas totales</div><div class="mval">${totalRevenue>0?'$'+(totalRevenue/1000000).toFixed(2)+'M':'—'}</div>${totalRevenue>0?'<div class="mdelta up"><i class="ti ti-trending-up"></i> Acumulado</div>':noData}</div>
    <div class="mcard"><div class="mlabel">Ticket promedio red</div><div class="mval">${avgTicket>0?fmt(avgTicket):'—'}</div>${avgTicket>0?'<div class="mdelta neutral"><i class="ti ti-minus"></i> Promedio real</div>':noData}</div>
    <div class="mcard"><div class="mlabel">Restaurantes activos</div><div class="mval">${filtered.length}</div><div class="mdelta neutral"><i class="ti ti-building-store"></i> En la red</div></div>`;

  const maxOrders = Math.max(...filtered.map(r => r.orders), 1);
  document.getElementById('net-orders-chart').innerHTML = filtered.map(r =>
    `<div class="bar-col"><div class="bar-rect ${r.orders === maxOrders && r.orders > 0 ? 'peak' : ''}" style="height:${Math.round(r.orders/maxOrders*95)||4}px" title="${r.orders} pedidos"></div><div class="bar-label">${r.emoji}</div></div>`
  ).join('');

  // Top dishes from network stats (real data)
  const netTopEl = document.getElementById('net-top-dishes');
  if (!networkStats) {
    try {
      const ns = await fetch('/api/network/stats');
      networkStats = await ns.json();
    } catch {}
  }
  let dishes = networkStats?.topDishes || [];
  if (filterRest !== 'all') dishes = dishes.filter(d => d.restaurant_id === filterRest);
  if (filterCat  !== 'all') dishes = dishes.filter(d => d.cat === filterCat);
  netTopEl.innerHTML = dishes.length
    ? dishes.slice(0, 8).map((d, i) =>
        `<div class="top-item">
          <div class="top-rank">${i+1}</div>
          <div class="top-emoji">${d.emoji||'🍽️'}</div>
          <div class="top-info"><div class="top-name">${d.name}</div><div class="top-count">${d.restaurant||d.restaurant_id}</div></div>
          <span style="font-size:11px;font-weight:600;color:var(--gold2)">${d.count}</span>
        </div>`
      ).join('')
    : '<p style="font-size:12px;color:var(--tx3);padding:8px 0">Sin pedidos en la red aún — aparecerán aquí</p>';

  document.getElementById('net-comparison-table').innerHTML = filtered.map(r =>
    `<tr>
      <td><span style="font-size:18px;margin-right:8px">${r.emoji}</span><strong>${r.name}</strong></td>
      <td style="color:var(--tx3)">${r.city}, ${r.region}</td>
      <td style="font-weight:600">${r.orders.toLocaleString('es-CL')}</td>
      <td style="color:var(--gold2);font-weight:600">${r.avgTicket > 0 ? fmt(r.avgTicket) : '—'}</td>
      <td style="font-weight:600">${r.revenue > 0 ? '$' + (r.revenue/1000000).toFixed(2) + 'M' : '—'}</td>
      <td><span class="spill ${r.orders > 0 ? 'sr' : 'sc'}">${r.orders > 0 ? 'Activo' : 'Sin pedidos'}</span></td>
      <td style="color:var(--plum);font-weight:600">${r.registeredUsers.toLocaleString('es-CL')}</td>
    </tr>`
  ).join('');
}

function renderRestaurantGrid() {
  const count = NETWORK_RESTAURANTS.length;
  const subEl = document.getElementById('gestion-sub');
  if (subEl) subEl.textContent = `${count} activos · Gestiona menús, mesas y QR`;
  document.getElementById('restaurant-grid').innerHTML = NETWORK_RESTAURANTS.map(r =>
    `<div class="rest-card" onclick="showRestaurant('${r.id}')">
      <div class="rest-card-header">
        <div class="rest-card-emoji">${r.emoji}</div>
        <div class="rest-card-info">
          <div class="rest-card-name">${r.name}</div>
          <div class="rest-card-city"><i class="ti ti-map-pin" style="font-size:10px"></i> ${r.city}, ${r.region}</div>
        </div>
        <span class="rest-status-badge">Activo</span>
      </div>
      <div class="rest-card-stats">
        <div class="rest-stat"><div class="rest-stat-val">${r.tables}</div><div class="rest-stat-label">Mesas</div></div>
        <div class="rest-stat"><div class="rest-stat-val">${r.visits >= 1000 ? (r.visits/1000).toFixed(1) + 'k' : r.visits}</div><div class="rest-stat-label">Visitas/mes</div></div>
        <div class="rest-stat"><div class="rest-stat-val">${r.revenue > 0 ? '$' + (r.revenue/1000000).toFixed(1) + 'M' : '—'}</div><div class="rest-stat-label">Ventas/mes</div></div>
        <div class="rest-stat"><div class="rest-stat-val">${r.registeredUsers}</div><div class="rest-stat-label">Usuarios</div></div>
      </div>
      <div class="rest-card-footer">
        <span style="font-size:11px;color:var(--tx3)">Desde ${r.since}</span>
        <span class="rest-card-cta">Ver detalles <i class="ti ti-arrow-right"></i></span>
      </div>
    </div>`
  ).join('');
}

async function showRestaurant(id) {
  const r = NETWORK_RESTAURANTS.find(x => x.id === id);
  if (!r) return;
  document.getElementById('red-grid-view').style.display = 'none';
  const detail = document.getElementById('red-restaurant-detail');
  detail.style.display = 'block';
  detail.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--tx3)"><i class="ti ti-loader" style="font-size:24px;animation:spin 1s linear infinite"></i></div>`;

  await activateRestaurant(id);

  // Fetch latest menu from API for the detail view
  let menu = MENU;
  try {
    const res = await fetch(`/api/restaurants/${id}/menu`);
    const data = await res.json();
    menu = data.items || [];
  } catch {};

  // Load real stats for this restaurant
  let restStats = null;
  try {
    const sRes = await fetch(`/api/restaurants/${id}/stats`);
    restStats = await sRes.json();
  } catch {}
  const hourlyVals   = (restStats?.byHour || Array(24).fill(0)).slice(10, 22);
  const hourlyMax    = Math.max(...hourlyVals, 1);
  const hourlyLabels = ['10','11','12','13','14','15','16','17','18','19','20','21'];
  const peakHourIdx  = hourlyVals.indexOf(Math.max(...hourlyVals));
  const hourlyBars   = hourlyVals.map((v, i) =>
    `<div class="bar-col"><div class="bar-rect ${i === peakHourIdx && v > 0 ? 'peak' : ''}" style="height:${Math.round(v/hourlyMax*80)||2}px"></div><div class="bar-label">${hourlyLabels[i]}</div></div>`
  ).join('');

  const menuActionBtns = `
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="primary-btn" onclick="openAddDish('${r.id}')"><i class="ti ti-plus"></i> Agregar plato</button>
      <button class="primary-btn" style="background:var(--bgc);color:var(--tx2);border:1px solid var(--line2)" onclick="importMenuXLSX('${r.id}')"><i class="ti ti-file-spreadsheet"></i> Importar .xlsx</button>
      <button class="primary-btn" style="background:var(--bgc);color:var(--tx2);border:1px solid var(--line2)" onclick="downloadMenuTemplate()"><i class="ti ti-download"></i> Plantilla</button>
    </div>`;
  const menuHTML = menu.length
    ? `<div class="menu-admin-toolbar"><div class="page-hdr" style="margin-bottom:0"><div class="page-title" style="font-size:16px">Menú de ${r.name}</div><div class="page-sub">${menu.length} platos · <span style="color:var(--gold-dim)">Importar xlsx para reemplazar</span></div></div>${menuActionBtns}</div>` +
      menu.map((it, idx) =>
        `<div class="menu-admin-item">
          <div class="mai-emoji">${it.emoji}</div>
          <div class="mai-meta"><div class="mai-name">${it.name}</div><div class="mai-cat">${it.cat.charAt(0).toUpperCase()+it.cat.slice(1)}${it.price ? ' · ' + fmt(it.price) : ''}</div></div>
          <label class="toggle" style="margin-right:4px"><input type="checkbox" checked><span class="ttrack"></span></label>
          <button class="mai-edit-btn" onclick="openEditDish('${r.id}',${idx})" title="Editar"><i class="ti ti-pencil"></i></button>
          <button class="mai-del-btn" onclick="deleteDish('${r.id}',${idx})" title="Eliminar"><i class="ti ti-trash"></i></button>
        </div>`
      ).join('')
    : `<div class="empty-state-net">
        <i class="ti ti-file-spreadsheet"></i>
        <p>Menú no configurado aún</p>
        <p style="font-size:11px;color:var(--tx3);margin-top:-4px">Sube un archivo .xlsx con la plantilla o agrega platos manualmente</p>
        <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;justify-content:center">
          <button class="primary-btn" onclick="importMenuXLSX('${r.id}')"><i class="ti ti-file-spreadsheet"></i> Importar .xlsx</button>
          <button class="primary-btn" style="background:var(--bgc);color:var(--tx2);border:1px solid var(--line2)" onclick="downloadMenuTemplate()"><i class="ti ti-download"></i> Descargar plantilla</button>
        </div>
      </div>`;

  const baseUrl = window.location.origin + '/' + r.id;
  const mesasRows = Array.from({length: r.tables}, (_, i) => i+1).map(n =>
    `<tr><td style="font-weight:600;color:var(--gold2)">Mesa ${n}</td><td><span class="spill sr">Activa</span></td><td style="font-family:monospace;font-size:11px;color:var(--tx3)">${baseUrl}?mesa=${n}</td><td><button class="action-link" onclick="showTableQR('${r.id}','${r.name}',${n})"><i class="ti ti-qrcode"></i> Ver QR</button></td></tr>`
  ).join('');
  const mesasHTML = `<div class="page-hdr"><div class="page-title" style="font-size:16px">Mesas y QR · ${r.name}</div><div class="page-sub">${r.tables} mesas · QR individuales por mesa</div></div><div class="card"><table class="orders-table"><thead><tr><th>Mesa</th><th>Estado</th><th>URL de acceso</th><th>QR</th></tr></thead><tbody>${mesasRows}</tbody></table></div>`;

  const noData = '<div class="mdelta neutral"><i class="ti ti-clock"></i> Sin datos aún</div>';
  const insightsHTML = `
    <div class="mrow">
      <div class="mcard"><div class="mlabel">Pedidos totales</div><div class="mval">${r.orders.toLocaleString('es-CL')}</div>${r.orders>0?'<div class="mdelta up"><i class="ti ti-check"></i> Datos reales</div>':noData}</div>
      <div class="mcard"><div class="mlabel">Ticket promedio</div><div class="mval">${r.avgTicket > 0 ? fmt(r.avgTicket) : '—'}</div>${r.avgTicket>0?'<div class="mdelta neutral"><i class="ti ti-receipt"></i> Real</div>':noData}</div>
      <div class="mcard"><div class="mlabel">Ventas totales</div><div class="mval">${r.revenue > 0 ? '$' + (r.revenue/1000000).toFixed(2) + 'M' : '—'}</div>${r.revenue>0?'<div class="mdelta up"><i class="ti ti-trending-up"></i> Acumulado</div>':noData}</div>
      <div class="mcard"><div class="mlabel">Usuarios reg.</div><div class="mval">${r.registeredUsers.toLocaleString('es-CL')}</div>${r.registeredUsers>0?'<div class="mdelta up"><i class="ti ti-users"></i> Cuentas reales</div>':noData}</div>
    </div>
    <div class="two-col">
      <div class="card" style="margin-bottom:0"><div class="card-title">Pedidos por hora</div><div class="bar-chart">${hourlyBars}</div></div>
      <div class="card" style="margin-bottom:0"><div class="card-title">Datos de la operación</div>
        <div class="insight-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:0">
          <div class="insight-card"><div class="insight-icon">👥</div><div class="insight-val">${r.registeredUsers}</div><div class="insight-label">Usuarios reg.</div></div>
          <div class="insight-card"><div class="insight-icon">📦</div><div class="insight-val">${r.orders.toLocaleString('es-CL')}</div><div class="insight-label">Pedidos totales</div></div>
          <div class="insight-card"><div class="insight-icon">⭐</div><div class="insight-val" style="font-size:12px">${restStats?.topItems?.[0]?restStats.topItems[0].emoji+' '+restStats.topItems[0].name.split(' ').slice(0,2).join(' '):'—'}</div><div class="insight-label">Plato top</div></div>
          <div class="insight-card"><div class="insight-icon">🏪</div><div class="insight-val">${r.tables}</div><div class="insight-label">Mesas activas</div></div>
        </div>
      </div>
    </div>`;

  detail.innerHTML = `
    <div class="rest-detail-topbar">
      <button class="back-btn" onclick="closeRestaurantDetail()"><i class="ti ti-arrow-left"></i> Volver a la red</button>
      <div class="rest-detail-header-info">
        <div class="rest-detail-emoji">${r.emoji}</div>
        <div><div class="rest-detail-name">${r.name}</div><div class="rest-detail-city">${r.city}, ${r.region}</div></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-left:auto">
        <span class="rest-status-badge" style="font-size:11px;padding:4px 10px;background:rgba(111,194,140,0.18);color:#6fc28c;border-color:#6fc28c">✓ Activo</span>
        <button class="primary-btn" style="padding:6px 12px;font-size:12px" onclick="switchTab('entry')"><i class="ti ti-qrcode"></i> Entrada</button>
        <button class="primary-btn" style="padding:6px 12px;font-size:12px" onclick="switchTab('client')"><i class="ti ti-device-mobile"></i> Cliente</button>
        <button class="primary-btn" style="padding:6px 12px;font-size:12px" onclick="switchTab('admin')"><i class="ti ti-layout-dashboard"></i> Admin</button>
      </div>
    </div>
    <div class="rest-subtabs-bar">
      <button class="rsubtab active" onclick="switchRestSubtab('menu',this)"><i class="ti ti-menu-2"></i> Menú</button>
      <button class="rsubtab" onclick="switchRestSubtab('mesas',this)"><i class="ti ti-qrcode"></i> Mesas y QR</button>
      <button class="rsubtab" onclick="switchRestSubtab('insights',this)"><i class="ti ti-chart-bar"></i> Insights</button>
    </div>
    <div class="rest-subcontent">
      <div class="rest-sub active" id="rsub-menu">${menuHTML}</div>
      <div class="rest-sub" id="rsub-mesas">${mesasHTML}</div>
      <div class="rest-sub" id="rsub-insights">${insightsHTML}</div>
    </div>`;
}

function closeRestaurantDetail() {
  document.getElementById('red-restaurant-detail').style.display = 'none';
  document.getElementById('red-grid-view').style.display = 'block';
}

function switchRestSubtab(tab, el) {
  document.querySelectorAll('.rest-sub').forEach(s => s.classList.remove('active'));
  document.getElementById('rsub-' + tab).classList.add('active');
  document.querySelectorAll('.rsubtab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
}

function showTableQR(restId, restName, mesa) {
  const url = window.location.origin + '/' + restId + '?mesa=' + mesa;
  document.getElementById('qr-modal-title').textContent = restName + ' · Mesa ' + mesa;
  document.getElementById('qr-modal-sub').textContent = 'Escanea para abrir el menú digital';
  document.getElementById('qr-modal-img').src = '/api/qr?restaurant=' + encodeURIComponent(restId) + '&mesa=' + mesa;
  document.getElementById('qr-modal-url').textContent = url;
  document.getElementById('modal-table-qr').classList.add('show');
}

function showCreateRestaurantModal() {
  selectedRestaurantEmoji = '🍽️';
  document.getElementById('new-rest-name').value = '';
  document.getElementById('new-rest-city').value = '';
  document.getElementById('new-rest-tables').value = '';
  document.getElementById('slug-preview').style.display = 'none';
  renderEmojiPicker();
  document.getElementById('modal-create-restaurant').classList.add('show');
}

function renderEmojiPicker() {
  const emojis = ['🍖','🌿','🐟','☕','🍕','🍣','🥗','🍜','🥩','🍷','🍺','🌮','🫕','🥘','🍱','🍔','🌯','🧆','🥞','🍽️'];
  document.getElementById('emoji-picker').innerHTML = emojis.map(e =>
    `<button class="emoji-pick-btn ${e === selectedRestaurantEmoji ? 'selected' : ''}" onclick="selectEmoji('${e}')">${e}</button>`
  ).join('');
}

function selectEmoji(emoji) {
  selectedRestaurantEmoji = emoji;
  renderEmojiPicker();
}

function updateSlugPreview() {
  const name = document.getElementById('new-rest-name').value;
  const prev = document.getElementById('slug-preview');
  if (!name.trim()) { prev.style.display = 'none'; return; }
  prev.style.display = 'flex';
  document.getElementById('slug-code').textContent = 'menuai.cl/' + generateSlug(name);
}

function generateSlug(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
}

async function createRestaurant() {
  const name   = document.getElementById('new-rest-name').value.trim();
  const city   = document.getElementById('new-rest-city').value.trim();
  const tables = parseInt(document.getElementById('new-rest-tables').value) || 10;
  if (!name) { alert('Ingresa el nombre del restaurante'); return; }
  const parts  = city.split(',');
  const since  = new Date().toLocaleDateString('es-CL', { month:'short', year:'numeric' });
  const payload = {
    id:     generateSlug(name),
    name,   emoji: selectedRestaurantEmoji,
    city:   (parts[0] || city).trim() || 'Sin ciudad',
    region: (parts[1] || '').trim()   || 'Sin región',
    tables, since,
  };
  try {
    const res = await fetch('/api/restaurants', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Error al crear el restaurante'); return; }
    // Reload restaurants from API
    const r2 = await fetch('/api/restaurants');
    const d2 = await r2.json();
    NETWORK_RESTAURANTS.length = 0;
    (d2.restaurants || []).forEach(r => NETWORK_RESTAURANTS.push({ ...r, orders:r.orders_count, avgTicket:r.avg_ticket, upsellPct:r.upsell_pct, registeredUsers:r.registered_users }));
    // Add to filter dropdown
    const sel = document.getElementById('net-filter-rest');
    if (sel && !sel.querySelector(`option[value="${payload.id}"]`)) {
      const opt = document.createElement('option');
      opt.value = payload.id; opt.textContent = payload.emoji + ' ' + payload.name;
      sel.appendChild(opt);
    }
    closeModals();
    renderRestaurantGrid();
    showToast(`✓ ${payload.name} creado`);
  } catch { alert('Error de conexión'); }
}

function downloadNetworkCSV() {
  const filterRest = document.getElementById('net-filter-rest')?.value || 'all';
  const rests = filterRest === 'all' ? NETWORK_RESTAURANTS : NETWORK_RESTAURANTS.filter(r => r.id === filterRest);
  const rows = [
    ['Restaurante','Ciudad','Región','Pedidos','Ticket Promedio (CLP)','Ventas (CLP)','Upsell IA %','Usuarios Reg.','Mesas'],
    ...rests.map(r => [r.name, r.city, r.region, r.orders, r.avgTicket, r.revenue, r.upsellPct, r.registeredUsers, r.tables]),
  ];
  const csv  = rows.map(row => row.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'menuai-red-insights.csv'; a.click();
  URL.revokeObjectURL(url);
}

function downloadNetworkPDF() {
  const filterRest = document.getElementById('net-filter-rest')?.value || 'all';
  const rests = filterRest === 'all' ? NETWORK_RESTAURANTS : NETWORK_RESTAURANTS.filter(r => r.id === filterRest);
  const totalOrders  = rests.reduce((a, r) => a + r.orders, 0);
  const totalRevenue = rests.reduce((a, r) => a + r.revenue, 0);
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Insights Red MenuAI</title><meta charset="UTF-8">
    <style>body{font-family:sans-serif;max-width:820px;margin:0 auto;padding:32px;color:#1a1a1a}h1{font-size:24px;margin-bottom:4px}
    h2{font-size:13px;color:#666;font-weight:400;margin-bottom:28px}.kpis{display:flex;gap:14px;margin-bottom:28px}
    .kpi{flex:1;background:#f5f5f5;border-radius:8px;padding:14px}.kpi-v{font-size:24px;font-weight:700}.kpi-l{font-size:10px;color:#888;margin-top:3px;text-transform:uppercase}
    table{width:100%;border-collapse:collapse;margin-top:8px}th{font-size:10px;text-align:left;padding:8px 10px;background:#f9f9f9;border-bottom:2px solid #ddd;text-transform:uppercase;letter-spacing:.06em}
    td{font-size:13px;padding:10px;border-bottom:1px solid #eee}h3{font-size:14px;margin:26px 0 10px;font-weight:600}
    </style></head><body>
    <h1>Red MenuAI — Insights consolidados</h1>
    <h2>Informe mensual · ${rests.length} restaurante${rests.length !== 1 ? 's' : ''} · ${new Date().toLocaleDateString('es-CL')}</h2>
    <div class="kpis">
      <div class="kpi"><div class="kpi-v">${totalOrders.toLocaleString('es-CL')}</div><div class="kpi-l">Pedidos totales</div></div>
      <div class="kpi"><div class="kpi-v">$${(totalRevenue/1000000).toFixed(1)}M</div><div class="kpi-l">Ventas totales</div></div>
      <div class="kpi"><div class="kpi-v">${rests.length}</div><div class="kpi-l">Restaurantes activos</div></div>
    </div>
    <h3>Comparativa por restaurante</h3>
    <table><thead><tr><th>Restaurante</th><th>Ciudad</th><th>Pedidos</th><th>Ticket prom.</th><th>Ventas</th><th>Upsell IA</th><th>Usuarios</th></tr></thead>
    <tbody>${rests.map(r => `<tr><td>${r.emoji} ${r.name}</td><td>${r.city}, ${r.region}</td><td>${r.orders}</td><td>$${r.avgTicket.toLocaleString('es-CL')}</td><td>${r.revenue > 0 ? '$' + (r.revenue/1000000).toFixed(1) + 'M' : '—'}</td><td>${r.upsellPct}%</td><td>${r.registeredUsers}</td></tr>`).join('')}</tbody></table>
    <h3>Top 5 platos de la red</h3>
    <table><thead><tr><th>#</th><th>Plato</th><th>Restaurante</th><th>Pedidos</th></tr></thead>
    <tbody>${(networkStats?.topDishes||[]).slice(0,5).map((d,i) => `<tr><td>${i+1}</td><td>${d.emoji||''} ${d.name}</td><td>${d.restaurant||d.restaurant_id}</td><td>${d.count}</td></tr>`).join('') || '<tr><td colspan="4" style="color:#888">Sin datos aún</td></tr>'}</tbody></table>
    <script>setTimeout(()=>window.print(),400)<\/script>
    </body></html>`);
  win.document.close();
}

// ── DISH EDITOR ───────────────────────────────────────────────────────

let editingRestId  = null;
let editingDishIdx = -1;
let selectedDishEmoji = '🍽️';

const DISH_EMOJIS = ['🍖','🌿','🐟','☕','🍕','🍣','🥗','🍜','🥩','🍷','🍺','🌮','🫕','🥘','🍱','🍔','🌯','🧆','🥞','🍽️','🥐','🥣','🍳','🫐','🍰','🧀','🦑','🦞','🥟','🍝','🍮','🥂','🧃','🐟','🍋'];

function openAddDish(restId) {
  editingRestId  = restId;
  editingDishIdx = -1;
  selectedDishEmoji = '🍽️';
  document.getElementById('dish-modal-title').textContent = 'Nuevo plato';
  document.getElementById('dish-modal-sub').textContent   = 'Completa los datos del plato';
  document.getElementById('dish-name').value     = '';
  document.getElementById('dish-price').value    = '';
  document.getElementById('dish-cat').value      = 'principales';
  document.getElementById('dish-desc').value     = '';
  document.getElementById('dish-diet').value     = '';
  document.getElementById('dish-contains').value = '';
  renderDishEmojiPicker();
  document.getElementById('modal-edit-dish').classList.add('show');
}

function openEditDish(restId, dishIdx) {
  editingRestId  = restId;
  editingDishIdx = dishIdx;
  const dish = MENU[dishIdx]; // MENU is already loaded for the active restaurant
  if (!dish) return;
  selectedDishEmoji = dish.emoji || '🍽️';
  document.getElementById('dish-modal-title').textContent = 'Editar plato';
  document.getElementById('dish-modal-sub').textContent   = dish.name;
  document.getElementById('dish-name').value     = dish.name;
  document.getElementById('dish-price').value    = dish.price;
  document.getElementById('dish-cat').value      = dish.cat || 'principales';
  document.getElementById('dish-desc').value     = dish.desc || '';
  document.getElementById('dish-diet').value     = (dish.diet || []).join(', ');
  document.getElementById('dish-contains').value = (dish.contains || []).join(', ');
  renderDishEmojiPicker();
  document.getElementById('modal-edit-dish').classList.add('show');
}

function renderDishEmojiPicker() {
  document.getElementById('dish-emoji-picker').innerHTML = DISH_EMOJIS.map(e =>
    `<button class="emoji-pick-btn ${e === selectedDishEmoji ? 'selected' : ''}" onclick="selectDishEmoji('${e}')">${e}</button>`
  ).join('');
}

function selectDishEmoji(emoji) {
  selectedDishEmoji = emoji;
  renderDishEmojiPicker();
}

async function saveDish() {
  const name = document.getElementById('dish-name').value.trim();
  if (!name) { alert('El nombre del plato es obligatorio'); return; }
  const dish = {
    emoji:    selectedDishEmoji,
    name,
    price:    parseInt(document.getElementById('dish-price').value) || 0,
    cat:      document.getElementById('dish-cat').value,
    desc:     document.getElementById('dish-desc').value.trim(),
    diet:     document.getElementById('dish-diet').value.split(',').map(x => x.trim()).filter(Boolean),
    contains: document.getElementById('dish-contains').value.split(',').map(x => x.trim()).filter(Boolean),
  };
  try {
    let res;
    if (editingDishIdx === -1) {
      res = await fetch(`/api/restaurants/${editingRestId}/menu`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(dish) });
      showToast(`✓ "${name}" agregado al menú`);
    } else {
      const existingId = MENU[editingDishIdx]?.id;
      res = await fetch(`/api/restaurants/${editingRestId}/menu/${existingId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(dish) });
      showToast(`✓ "${name}" actualizado`);
    }
    if (!res.ok) { alert('Error al guardar el plato'); return; }
  } catch { alert('Error de conexión'); return; }
  closeModals();
  // Reload menu in active state
  const mRes = await fetch(`/api/restaurants/${editingRestId}/menu`);
  const mData = await mRes.json();
  if (editingRestId === activeRestaurant?.id) {
    MENU.length = 0;
    (mData.items || []).forEach(item => MENU.push(item));
    renderMenu();
    renderMenuAdmin();
  }
  // Re-render detail (without re-activating — restaurant is already active)
  const savedId = editingRestId;
  const r = NETWORK_RESTAURANTS.find(x => x.id === savedId);
  if (r) {
    const activeId = activeRestaurant?.id;
    activeRestaurant = null; // temporarily reset so showRestaurant doesn't skip
    if (activeId === savedId) activeRestaurant = null;
    await showRestaurant(savedId);
  }
}

async function deleteDish(restId, dishIdx) {
  // Find the item ID from the current MENU (already loaded for this restaurant)
  const item = MENU[dishIdx];
  if (!item) return;
  if (!confirm(`¿Eliminar "${item.name}" del menú?`)) return;
  try {
    const res = await fetch(`/api/restaurants/${restId}/menu/${item.id}`, { method:'DELETE' });
    if (!res.ok) { alert('Error al eliminar el plato'); return; }
    showToast(`"${item.name}" eliminado`);
  } catch { alert('Error de conexión'); return; }
  // Reload menu and re-render detail
  const mRes = await fetch(`/api/restaurants/${restId}/menu`);
  const mData = await mRes.json();
  if (restId === activeRestaurant?.id) {
    MENU.length = 0;
    (mData.items || []).forEach(i => MENU.push(i));
    renderMenu();
    renderMenuAdmin();
  }
  activeRestaurant = null;
  await showRestaurant(restId);
}

// ── MENU XLSX IMPORT / EXPORT ─────────────────────────────────────────

function importMenuXLSX(restId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      const VALID_CATS = new Set(['entradas','principales','pastas','postres','bebestibles']);
      const items = [];
      let baseId = Date.now();

      rows.slice(1).forEach((row, i) => {
        const name = String(row[1] || '').trim();
        if (!name) return;
        const cat = String(row[3] || '').toLowerCase().trim();
        items.push({
          id:       baseId + i,
          emoji:    String(row[0] || '🍽️').trim(),
          name,
          price:    parseInt(String(row[2]).replace(/\D/g,'')) || 0,
          cat:      VALID_CATS.has(cat) ? cat : 'principales',
          desc:     String(row[4] || '').trim(),
          diet:     String(row[5] || '').split(',').map(x => x.trim()).filter(Boolean),
          contains: String(row[6] || '').split(',').map(x => x.trim()).filter(Boolean),
          tags:     [],
        });
      });

      if (!items.length) { alert('No se encontraron platos. Verifica que el archivo use la plantilla correcta.'); return; }

      const res = await fetch(`/api/restaurants/${restId}/menu`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ items }) });
      if (!res.ok) { alert('Error al importar el menú'); return; }
      showToast(`✓ ${items.length} platos importados correctamente`);
      // Reload menu state
      const mRes = await fetch(`/api/restaurants/${restId}/menu`);
      const mData = await mRes.json();
      if (restId === activeRestaurant?.id) {
        MENU.length = 0;
        (mData.items || []).forEach(i => MENU.push(i));
        renderMenu(); renderMenuAdmin();
      }
      activeRestaurant = null;
      await showRestaurant(restId);
    } catch (err) {
      alert('Error al leer el archivo. Verifica que sea un .xlsx válido con la plantilla de MenuAI.');
    }
  };
  input.click();
}

function downloadMenuTemplate() {
  if (typeof XLSX === 'undefined') { alert('Cargando librería, intenta en un momento.'); return; }
  const rows = [
    ['emoji', 'nombre', 'precio', 'categoria', 'descripcion', 'dieta', 'contiene'],
    ['🥩', 'Lomo a lo pobre',       18900, 'principales', 'Filete de lomo a la plancha con papas fritas y huevo frito.',         'carne roja, chileno',            'huevo'],
    ['🥗', 'Ensalada de la casa',    8900,  'entradas',    'Hojas verdes, tomates cherry, pepino y aderezo de limón.',           'vegetariano, vegano, sin gluten', ''],
    ['🍝', 'Pasta al ajillo',        14900, 'pastas',      'Tallarines con gambas, ajo, perejil y guindilla.',                  'pescado, picante',               'gluten, mariscos'],
    ['🍷', 'Vino Malbec copa',       5900,  'bebestibles', 'Malbec argentino, frutos rojos y taninos suaves.',                  'vegano, sin gluten',             ''],
    ['🍰', 'Torta mil hojas',        6500,  'postres',     'Clásica torta chilena con manjar, crema y hojarasca crocante.',     'vegetariano, chileno',           'gluten, lactosa, huevo'],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:8},{wch:26},{wch:10},{wch:16},{wch:50},{wch:32},{wch:28}];
  XLSX.utils.book_append_sheet(wb, ws, 'Menu');
  XLSX.writeFile(wb, 'plantilla-menu-menuai.xlsx');
}

function showToast(msg) {
  let t = document.getElementById('menuai-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'menuai-toast';
    t.style.cssText = 'position:fixed;bottom:calc(24px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:var(--ok);color:#0f2a18;font-size:13px;font-weight:600;padding:11px 20px;border-radius:24px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4);transition:opacity .3s';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

// ── START ─────────────────────────────────────────────────────────────
init();
