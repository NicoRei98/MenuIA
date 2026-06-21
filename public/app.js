// ── DATA ──────────────────────────────────────────────────────────────
let MENU = [];

const STATIC_GENERAL = [
  { id: 5,  why: 'El más pedido esta noche — 8 veces' },
  { id: 16, why: 'Maridaje frecuente con carnes, 6 mesas lo pidieron' },
  { id: 13, why: 'Postre top del día' },
];

const TOP_ITEMS = [
  { emoji: '🥩', name: 'Lomo a lo pobre',   count: 34, pct: 100 },
  { emoji: '🍷', name: 'Vino Malbec',        count: 28, pct: 82  },
  { emoji: '🍰', name: 'Torta mil hojas',    count: 22, pct: 65  },
  { emoji: '🐟', name: 'Congrio al vapor',   count: 18, pct: 53  },
  { emoji: '🍺', name: 'Cerveza IPA',        count: 14, pct: 41  },
];

const ORDERS = [
  { id: '#047', mesa: 4,  items: 'Lomo x2, Malbec x1',              total: '$43.700', hora: '20:28', status: 'cooking', editable: true  },
  { id: '#046', mesa: 9,  items: 'Ceviche, Congrio, Mil hojas',      total: '$39.900', hora: '20:21', status: 'ready',   editable: false },
  { id: '#045', mesa: 2,  items: 'Empanadas x2, Cerveza x2',         total: '$24.600', hora: '20:14', status: 'ready',   editable: false },
  { id: '#044', mesa: 11, items: 'Pasta ajillo, Malbec',             total: '$20.800', hora: '20:05', status: 'ready',   editable: false },
  { id: '#043', mesa: 7,  items: 'Risotto, Crème brûlée',            total: '$21.700', hora: '19:58', status: 'ready',   editable: false },
];

// ── STATE ─────────────────────────────────────────────────────────────
let cart = {}, currentCat = 'todos', isLoggedIn = false;
let editTimer = null, editSecs = 120;
let aiRecsCache = {};
let userProfile = { restric: [], dieta: [], gustos: [] };
let chatHistory = [];
let chatVisible = false;
const menuItemsActive = {};

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
  const res = await fetch('/api/menu');
  const data = await res.json();
  MENU = data.menu;
  MENU.forEach((m, i) => { menuItemsActive[m.id] = i !== 8; });
  renderMenu();
  renderBarChart('chart-hourly', [2,1,3,2,4,6,8,12,15,18,14,10], ['12','13','14','15','16','17','18','19','20','21','22','23'], 9);
  renderBarChart('chart-weekly', [45,52,38,61,55,72,48], ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'], 5);
  renderTopList('top-list-dash');
  renderTopList('top-list-analytics');
  renderOrders();
  renderMenuAdmin();
  renderMesas();
  renderNotifs();
  renderInsights();
  renderClientes();
}

// ── TABS ──────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + tab).classList.add('active');
  ['entry', 'client', 'admin'].forEach(t =>
    document.getElementById('tab-' + t).classList.toggle('active', t === tab)
  );
}

// ── MODALS ────────────────────────────────────────────────────────────
function showLoginModal()    { document.getElementById('modal-login').classList.add('show'); }
function showRegisterModal() { resetOnboarding(); document.getElementById('modal-register').classList.add('show'); }
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
function finishOnboarding() {
  userProfile.restric = collectChips('chips-restric');
  userProfile.dieta   = collectChips('chips-dieta');
  userProfile.gustos  = collectChips('chips-gustos');
  enterAsUser(false);
}

// ── ENTRY ─────────────────────────────────────────────────────────────
function enterAsGuest() {
  isLoggedIn = false;
  userProfile = { restric: [], dieta: [], gustos: [] };
  document.getElementById('user-chip').style.display       = 'none';
  document.getElementById('points-banner').style.display   = 'none';
  document.getElementById('diet-banner').style.display     = 'none';
  document.getElementById('guest-banner').style.display    = 'flex';
  document.getElementById('ai-banner-title').textContent   = 'Recomendaciones IA';
  document.getElementById('ai-banner-sub').textContent     = 'Basado en popularidad y hora';
  document.getElementById('ai-personal-section').style.display = 'none';
  document.getElementById('ai-msg-text').textContent       = 'Son las 20:30 — hora peak de cenas. Los platos más pedidos esta noche:';
  chatHistory = [];
  renderMenu();
  switchTab('client');
}

function enterAsUser(demoProfile) {
  closeModals();
  isLoggedIn = true;
  if (demoProfile) {
    userProfile = { restric: ['Sin gluten / celíaco'], dieta: ['Alto en proteína'], gustos: ['Carnes rojas', 'Vinos y maridajes'] };
    document.getElementById('reg-name').value = 'Sebastián';
  }
  const name = document.getElementById('reg-name').value || 'Sebastián';
  document.getElementById('user-chip').style.display     = 'flex';
  document.getElementById('user-chip-name').textContent  = name;
  document.getElementById('points-banner').style.display = 'flex';
  document.getElementById('guest-banner').style.display  = 'none';
  document.getElementById('ai-banner-title').textContent = 'Recomendaciones personalizadas';
  document.getElementById('ai-banner-sub').textContent   = 'Según tu perfil y lo que pidas hoy';
  document.getElementById('ai-personal-section').style.display = 'block';

  const allPrefs = [...userProfile.restric, ...userProfile.dieta];
  const dietBanner = document.getElementById('diet-banner');
  if (allPrefs.length) {
    dietBanner.style.display = 'flex';
    document.getElementById('diet-banner-text').textContent =
      'Perfil: ' + allPrefs.slice(0, 2).join(' · ') + (allPrefs.length > 2 ? ` +${allPrefs.length - 2}` : '');
  } else { dietBanner.style.display = 'none'; }

  document.getElementById('ai-msg-text').textContent = allPrefs.length
    ? `Hola ${name} 👋 Tengo tu perfil: ${allPrefs.join(', ')}. Voy a filtrar y priorizar según eso.`
    : `Hola ${name} 👋 Estás en El Rincón. Basado en tus visitas anteriores:`;

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
function renderMenu() {
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
  if (isMobileLayout()) document.getElementById('side-panel').classList.add('mobile-open');
}
function closeMobilePanel() { document.getElementById('side-panel').classList.remove('mobile-open'); }

(function () {
  const sheet  = document.getElementById('side-panel');
  const handle = document.querySelector('.sheet-handle');
  const header = document.getElementById('sp-header');
  let startY = 0, currentY = 0, dragging = false;
  function onStart(e) { if (!isMobileLayout()) return; dragging = true; startY = (e.touches ? e.touches[0].clientY : e.clientY); sheet.style.transition = 'none'; }
  function onMove(e)  { if (!dragging) return; currentY = (e.touches ? e.touches[0].clientY : e.clientY); const dy = Math.max(0, currentY - startY); sheet.style.transform = `translateY(${dy}px)`; }
  function onEnd()    { if (!dragging) return; dragging = false; sheet.style.transition = ''; const dy = currentY - startY; sheet.style.transform = ''; if (dy > 90) closeMobilePanel(); currentY = 0; }
  [handle, header].forEach(el => {
    if (!el) return;
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: true });
    el.addEventListener('touchend',   onEnd);
  });
})();

const ALL_PANELS = ['panel-empty', 'panel-ai', 'panel-detail', 'panel-order', 'panel-chat'];
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
    const data = await api('/api/chat', { messages: chatHistory, profile: userProfile, cart });
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
    <div class="chat-bubble">Hola 👋 Soy Rincón AI, tu garzón virtual. Pregúntame sobre los platos, maridajes, ingredientes o cualquier cosa del menú.</div>
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
  setSpHeader('Recomendaciones IA', 'Para esta hora · Mesa 7');
  document.getElementById('ai-recs-general').innerHTML =
    STATIC_GENERAL.map(r => { const it = MENU.find(m => m.id === r.id); return it ? recCard(it, r.why, '') : ''; }).join('');
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
    const data = await api('/api/recs', { cart, profile: userProfile, hour: new Date().getHours() });
    recs = data.recs || [];
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

async function renderDetailAIRecs(itemId) {
  const box = document.getElementById('det-ai-recs');
  box.innerHTML = `<div class="ai-thinking"><div class="ai-thinking-dots"><span></span><span></span><span></span></div> Buscando el mejor maridaje...</div><div class="ai-loading"><div class="ai-skel" style="height:50px"></div><div class="ai-skel" style="height:50px"></div></div>`;
  const data = await api('/api/detail-recs', { itemId, profile: userProfile });
  const recs = data.recs || [];
  if (!recs.length) { box.innerHTML = '<p style="font-size:12px;color:var(--tx3)">Sin sugerencias</p>'; return; }
  box.innerHTML = recs.map(r =>
    `<div class="det-ai-rec" onclick="showDetail(${r.id})">
      <div class="det-ai-rec-emoji">${r.emoji}</div>
      <div class="det-ai-rec-info"><div class="det-ai-rec-name">${r.name}</div><div class="det-ai-rec-why">${r.why}</div></div>
      <div class="det-ai-rec-price">${fmt(r.price)}</div>
      <button class="det-ai-add" onclick="event.stopPropagation();addToCart(${r.id})" aria-label="Agregar">+</button>
    </div>`
  ).join('');
}

async function renderOrderAIStrip() {
  const strip = document.getElementById('order-ai-strip');
  if (!Object.keys(cart).length) { strip.innerHTML = ''; return; }
  strip.innerHTML = `<div class="order-ai-strip"><div class="oas-title"><i class="ti ti-sparkles"></i> La IA sugiere agregar</div><div id="oas-inner"><div class="ai-loading"><div class="ai-skel" style="height:50px"></div></div></div></div>`;
  const key = Object.keys(cart).sort().join(',') + '|' + JSON.stringify(userProfile);
  let recs = aiRecsCache[key];
  if (!recs) {
    const data = await api('/api/recs', { cart, profile: userProfile, hour: new Date().getHours() });
    recs = data.recs || [];
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
  const total = Object.entries(cart).reduce((a, [id, q]) => a + MENU.find(m => m.id === +id).price * q, 0);
  document.getElementById('cart-count').textContent     = count;
  document.getElementById('cart-total-bar').textContent = fmt(total);
  document.getElementById('cart-bar').style.display     = count > 0 ? 'flex' : 'none';
}
function showOrderPanel() {
  if (!Object.keys(cart).length) return;
  chatVisible = false;
  document.getElementById('chat-toggle-btn').classList.remove('active');
  setSpHeader('Tu pedido', 'Revisa antes de enviar a cocina');
  let sub = 0;
  document.getElementById('order-items').innerHTML = Object.entries(cart).map(([id, q]) => {
    const it = MENU.find(m => m.id === +id);
    const line = it.price * q;
    sub += line;
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
  const iva = Math.round(sub * .19);
  document.getElementById('ot-sub').textContent   = fmt(sub);
  document.getElementById('ot-iva').textContent   = fmt(iva);
  document.getElementById('ot-total').textContent = fmt(sub + iva);
  showPanel('panel-order');
  renderOrderAIStrip();
}

// ── SEND ORDER ────────────────────────────────────────────────────────
function sendOrder() {
  const pts = Math.floor(Object.entries(cart).reduce((a, [id, q]) => a + MENU.find(m => m.id === +id).price * q, 0) / 100);
  cart = {};
  updateCartBar();
  renderMenu();
  aiRecsCache = {};
  document.getElementById('ai-nudge').style.display = 'none';
  editSecs = 120;
  setSpHeader('Pedido enviado', 'Mesa 7 · El Rincón');
  document.getElementById('panel-order').innerHTML = `
    <div class="sent-box"><div class="big-emo">✅</div><h3>¡Pedido enviado a cocina!</h3><p>Tiempo estimado: 15–20 minutos</p></div>
    <div class="ewb" id="ewb">
      <div class="ewb-title"><i class="ti ti-pencil"></i> Puedes modificar tu pedido</div>
      <div class="ewb-desc">La cocina aún no comienza. Tienes 2 minutos para cambios.</div>
      <div class="ewb-timer" id="ewb-timer">2:00</div>
    </div>
    <button class="edit-btn" id="edit-btn" onclick="startEditing()"><i class="ti ti-pencil"></i> Modificar pedido</button>
    ${isLoggedIn
      ? `<div class="pts-earned"><div class="pts-big">+${pts}</div><div><p>Puntos ganados</p><span>Total: ${(parseInt(document.getElementById('points-count').textContent) || 240) + pts} pts</span></div></div>`
      : `<div style="background:var(--amber-bg);border:1px solid rgba(224,168,82,0.3);border-radius:var(--rmd);padding:13px;margin-top:10px;text-align:center"><p style="font-size:12px;color:var(--amber);font-weight:600">Habrías ganado <strong>+${pts} puntos</strong> con cuenta</p><button class="mbtn" style="margin-top:8px;padding:9px" onclick="showRegisterModal()">Crear cuenta ahora</button></div>`
    }`;
  if (isLoggedIn) {
    const cur = parseInt(document.getElementById('points-count').textContent) || 240;
    document.getElementById('points-count').textContent = cur + pts;
  }
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
  document.getElementById('panel-order').innerHTML = `
    <div class="edit-notice"><i class="ti ti-pencil"></i><div><p>Ventana de modificación abierta</p><span>Tiempo: <span id="edit-countdown">${Math.floor(editSecs/60)}:${(editSecs%60).toString().padStart(2,'0')}</span></span></div></div>
    <div id="order-items"></div>
    <div class="total-box">
      <div class="total-row"><span>Subtotal</span><span id="ot-sub">$0</span></div>
      <div class="total-row"><span>IVA (19%)</span><span id="ot-iva">$0</span></div>
      <div class="total-row main"><span>Total</span><span id="ot-total">$0</span></div>
    </div>
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

// ── ADMIN ─────────────────────────────────────────────────────────────
function showAdmin(name, el) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.getElementById('admin-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
}
function renderBarChart(id, values, labels, peakIdx) {
  const max = Math.max(...values);
  document.getElementById(id).innerHTML = values.map((v, i) =>
    `<div class="bar-col"><div class="bar-rect ${i === peakIdx ? 'peak' : ''}" style="height:${Math.round(v / max * 80)}px" title="${v}"></div><div class="bar-label">${labels[i]}</div></div>`
  ).join('');
}
function renderTopList(id) {
  document.getElementById(id).innerHTML = TOP_ITEMS.map((it, i) =>
    `<div class="top-item"><div class="top-rank">${i + 1}</div><div class="top-emoji">${it.emoji}</div><div class="top-info"><div class="top-name">${it.name}</div><div class="top-count">${it.count} pedidos</div></div><div class="top-bar-track"><div class="top-bar-fill" style="width:${it.pct}%"></div></div></div>`
  ).join('');
}
function renderOrders() {
  const L = { cooking: 'En cocina', ready: 'Listo' };
  const C = { cooking: 'sc', ready: 'sr' };
  document.getElementById('orders-tbody').innerHTML = ORDERS.map(o =>
    `<tr><td style="color:var(--tx3);font-weight:600">${o.id}</td><td>Mesa ${o.mesa}</td><td style="color:var(--tx2)">${o.items}</td><td style="font-weight:600">${o.total}</td><td style="color:var(--tx3)">${o.hora}</td><td><span class="spill ${C[o.status]}">${L[o.status]}</span></td><td>${o.editable ? '<span class="action-link">Modificar</span>' : '—'}</td></tr>`
  ).join('');
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
  const occ = [2, 4, 5, 7, 9, 10, 11, 14, 16, 18], act = [4, 7, 11];
  document.getElementById('mesas-grid').innerHTML = Array.from({ length: 20 }, (_, i) => i + 1).map(n => {
    const a = act.includes(n), o = occ.includes(n);
    const c = a ? 'active-order' : o ? 'occupied' : '';
    const s = a ? 'Pedido activo' : o ? 'Ocupada' : 'Libre';
    return `<div class="mesa-tile ${c}"><div class="mesa-num">${n}</div><div class="mesa-st">${s}</div></div>`;
  }).join('');
}
function renderNotifs() {
  const N = [
    { t: 'Pedido #047 enviado',        s: 'Mesa 4 · Lomo x2, Malbec',        ti: 'hace 2 min',  n: true  },
    { t: 'Ventana modif. expiró',      s: 'Mesa 4 · #047 en cocina',          ti: 'hace 1 min',  n: true  },
    { t: 'Pollo al limón activado',    s: 'Vuelve a estar disponible',         ti: 'hace 8 min',  n: false },
    { t: 'Mesa 9 sin atención',        s: '12 min esperando',                  ti: 'hace 12 min', n: false },
  ];
  document.getElementById('notif-list-dash').innerHTML = N.map(x =>
    `<div class="notif-item ${x.n ? 'new' : ''}"><div class="ndot ${x.n ? '' : 'read'}"></div><div><div class="ntitle">${x.t}</div><div class="nsub">${x.s}</div></div><div class="ntime">${x.ti}</div></div>`
  ).join('');
}
function renderInsights() {
  const combos = [
    { e: '🥩🍷', n: 'Lomo a lo pobre + Malbec',     f: '67 veces', u: '+$5.900' },
    { e: '🐟🥂', n: 'Congrio + Espumante',            f: '34 veces', u: '+$6.500' },
    { e: '🍰☕', n: 'Torta mil hojas + Café',          f: '29 veces', u: '+$3.900' },
    { e: '🥟🍺', n: 'Empanadas + Cerveza IPA',         f: '24 veces', u: '+$4.800' },
  ];
  document.getElementById('combo-list').innerHTML = combos.map(c =>
    `<div class="combo-item"><div class="combo-emojis">${c.e}</div><div class="combo-info"><div class="combo-name">${c.n}</div><div class="combo-freq">${c.f} este mes</div></div><div class="combo-upsell">${c.u} ticket</div></div>`
  ).join('');
  const seg = [
    { label: 'Rango etario',      bars: [{ l: '18–27', v: 18, c: '#D9B968' }, { l: '28–42', v: 52, c: '#C9A24C' }, { l: '43–60', v: 24, c: '#8C7536' }, { l: '60+', v: 6, c: '#5F5645' }] },
    { label: 'Días preferidos',   bars: [{ l: 'Lun–Mié', v: 28, c: '#8C7536' }, { l: 'Jue', v: 45, c: '#C9A24C' }, { l: 'Vie', v: 72, c: '#D9B968' }, { l: 'Sáb', v: 85, c: '#D9B968' }, { l: 'Dom', v: 40, c: '#8C7536' }] },
    { label: 'Hora de llegada',   bars: [{ l: '12–15', v: 30, c: '#8C7536' }, { l: '15–18', v: 15, c: '#5F5645' }, { l: '18–21', v: 85, c: '#C9A24C' }, { l: '21+', v: 40, c: '#D9B968' }] },
    { label: 'Permanencia',       bars: [{ l: '< 45 min', v: 22, c: '#8C7536' }, { l: '45–75', v: 55, c: '#C9A24C' }, { l: '75–120', v: 18, c: '#D9B968' }, { l: '120+', v: 5, c: '#5F5645' }] },
  ];
  document.getElementById('segment-grid').innerHTML = seg.map(s =>
    `<div class="segment-card"><div class="segment-label">${s.label}</div>${s.bars.map(b => `<div class="segment-bar-row"><div class="segment-bar-label">${b.l}</div><div class="segment-bar-track"><div class="segment-bar-fill" style="width:${b.v}%;background:${b.c}"></div></div><div class="segment-bar-pct">${b.v}%</div></div>`).join('')}</div>`
  ).join('');
}
function renderClientes() {
  const U = [
    { id: 'U-001', seg: '28–42', v: 6, t: '$34.500', f: 'Lomo a lo pobre',      d: ['Sin gluten'],    p: 480 },
    { id: 'U-002', seg: '18–27', v: 4, t: '$22.100', f: 'Pasta al ajillo',       d: [],                p: 310 },
    { id: 'U-003', seg: '43–60', v: 8, t: '$41.200', f: 'Congrio al vapor',      d: ['Bajo en sodio'], p: 720 },
    { id: 'U-004', seg: '28–42', v: 3, t: '$26.800', f: 'Risotto de hongos',     d: ['Vegetariano'],   p: 195 },
    { id: 'U-005', seg: '60+',   v: 5, t: '$38.700', f: 'Torta mil hojas',       d: [],                p: 560 },
    { id: 'U-006', seg: '18–27', v: 7, t: '$19.900', f: 'Pasta primavera',       d: ['Vegano'],        p: 420 },
  ];
  document.getElementById('user-table-body').innerHTML = U.map(u =>
    `<tr><td style="color:var(--tx3);font-weight:600">${u.id}</td><td><span class="user-badge">${u.seg}</span></td><td style="font-weight:600">${u.v}</td><td style="color:var(--gold2);font-weight:600">${u.t}</td><td>${u.f}</td><td>${u.d.length ? u.d.map(x => `<span class="diet-badge">${x}</span>`).join('') : '<span style="color:var(--tx3)">—</span>'}</td><td style="font-weight:600;color:var(--plum)">${u.p}</td></tr>`
  ).join('');
  const diet = [
    { label: 'Sin gluten',   pct: 38, c: '#C9A24C' },
    { label: 'Vegetariano',  pct: 24, c: '#D9B968' },
    { label: 'Bajo en sodio',pct: 16, c: '#8C7536' },
    { label: 'Vegano',       pct: 12, c: '#6FC28C' },
    { label: 'Sin lactosa',  pct: 10, c: '#5F5645' },
  ];
  document.getElementById('diet-dist').innerHTML = diet.map(a =>
    `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="width:100px;font-size:11px;color:var(--tx2)">${a.label}</div><div style="flex:1;height:8px;background:var(--bgh);border-radius:4px;overflow:hidden"><div style="height:100%;width:${a.pct}%;background:${a.c};border-radius:4px"></div></div><div style="font-size:12px;font-weight:600;color:var(--tx);width:28px">${a.pct}%</div></div>`
  ).join('');
  const ages = [
    { label: '18–27 años', pct: 23, c: '#D9B968' },
    { label: '28–42 años', pct: 48, c: '#C9A24C' },
    { label: '43–60 años', pct: 22, c: '#8C7536' },
    { label: '60+ años',   pct:  7, c: '#5F5645' },
  ];
  document.getElementById('age-dist').innerHTML = ages.map(a =>
    `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="width:100px;font-size:11px;color:var(--tx2)">${a.label}</div><div style="flex:1;height:8px;background:var(--bgh);border-radius:4px;overflow:hidden"><div style="height:100%;width:${a.pct}%;background:${a.c};border-radius:4px"></div></div><div style="font-size:12px;font-weight:600;color:var(--tx);width:28px">${a.pct}%</div></div>`
  ).join('');
}

// ── START ─────────────────────────────────────────────────────────────
init();
