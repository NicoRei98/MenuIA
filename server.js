try { require('dotenv').config(); } catch {}
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// ── DATABASE ──────────────────────────────────────────────────────────
// DB_PATH env var allows mounting a persistent volume in Railway/cloud.
// On first run with a new volume, seeds the DB from the repo copy.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'menuai.db');
if (process.env.DB_PATH) {
  const fs = require('fs');
  if (!fs.existsSync(DB_PATH)) {
    fs.copyFileSync(path.join(__dirname, 'menuai.db'), DB_PATH);
    console.log('DB seeded to', DB_PATH);
  }
}
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🍽️',
    city TEXT DEFAULT '',
    region TEXT DEFAULT '',
    tables INTEGER DEFAULT 10,
    since TEXT DEFAULT '',
    visits INTEGER DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    revenue INTEGER DEFAULT 0,
    avg_ticket INTEGER DEFAULT 0,
    upsell_pct INTEGER DEFAULT 0,
    registered_users INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    emoji TEXT DEFAULT '🍽️',
    name TEXT NOT NULL,
    price INTEGER DEFAULT 0,
    cat TEXT DEFAULT 'principales',
    desc TEXT DEFAULT '',
    diet TEXT DEFAULT '[]',
    contains TEXT DEFAULT '[]',
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
    mesa INTEGER NOT NULL,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'cooking',
    user_name TEXT,
    user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id TEXT REFERENCES restaurants(id),
    name TEXT NOT NULL,
    email TEXT,
    password TEXT,
    restric TEXT DEFAULT '[]',
    dieta TEXT DEFAULT '[]',
    gustos TEXT DEFAULT '[]',
    points INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);
try { db.exec('ALTER TABLE users ADD COLUMN password TEXT DEFAULT NULL'); } catch {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL"); } catch {}

// ── MENÚ DE EL RINCÓN (fuente para AI + seed) ─────────────────────────
const RINCON_MENU = [
  { id: 1,  emoji: '🥗', name: 'Ensalada de la casa',    price: 8900,  cat: 'entradas',    desc: 'Hojas verdes, tomates cherry, pepino, aderezo de limón y hierbas.',               diet: ['vegetariano', 'vegano', 'sin gluten', 'fit'],                    contains: [] },
  { id: 2,  emoji: '🥟', name: 'Empanadas de pino',      price: 7500,  cat: 'entradas',    desc: 'Al horno, rellenas de pino chileno, pasas y aceitunas. Dos unidades.',             diet: ['chileno'],                                                       contains: ['gluten', 'huevo'] },
  { id: 3,  emoji: '🧀', name: 'Tabla de quesos',        price: 12900, cat: 'entradas',    desc: 'Selección de quesos nacionales, nueces, miel y tostadas artesanales.',             diet: ['vegetariano'],                                                   contains: ['lactosa', 'frutos secos', 'gluten'] },
  { id: 4,  emoji: '🦐', name: 'Ceviche de reineta',     price: 11500, cat: 'entradas',    desc: 'Reineta fresca en leche de tigre, cebolla morada, cilantro y camote.',             diet: ['sin gluten', 'sin lactosa', 'fit'],                              contains: ['mariscos'] },
  { id: 5,  emoji: '🥩', name: 'Lomo a lo pobre',        price: 18900, cat: 'principales', desc: 'Filete de lomo a la plancha, papas fritas, huevo frito y cebolla caramelizada.',   diet: ['carne roja', 'alto en proteína', 'chileno'],                     contains: ['huevo'] },
  { id: 6,  emoji: '🍖', name: 'Costillar de cerdo BBQ', price: 17500, cat: 'principales', desc: 'Costillar braseado 6 horas, salsa BBQ de la casa y puré rústico.',                 diet: ['carne roja', 'alto en proteína'],                                 contains: ['gluten'] },
  { id: 7,  emoji: '🐟', name: 'Congrio al vapor',       price: 21500, cat: 'principales', desc: 'Congrio fresco al vapor, mantequilla de alcaparras y papas mediterráneas.',        diet: ['pescado', 'sin gluten', 'fit', 'alto en proteína'],              contains: ['mariscos', 'lactosa'] },
  { id: 8,  emoji: '🍗', name: 'Pollo al limón',         price: 13900, cat: 'principales', desc: 'Suprema de pollo, reducción de limón, quinoa y verduras salteadas.',               diet: ['sin gluten', 'fit', 'alto en proteína'],                         contains: [] },
  { id: 9,  emoji: '🥘', name: 'Risotto de hongos',      price: 14500, cat: 'principales', desc: 'Arroz arborio, mix de hongos, parmesano y aceite de trufa. Vegetariano.',          diet: ['vegetariano', 'sin gluten'],                                     contains: ['lactosa'] },
  { id: 10, emoji: '🍝', name: 'Pasta al ajillo',        price: 14900, cat: 'pastas',      desc: 'Tallarines con gambas salteadas, ajo, perejil y un toque de guindilla.',           diet: ['pescado', 'picante'],                                            contains: ['gluten', 'mariscos'] },
  { id: 11, emoji: '🍜', name: 'Fettuccine Alfredo',     price: 13500, cat: 'pastas',      desc: 'Pasta fresca en salsa cremosa de parmesano y mantequilla. Clásico.',               diet: ['vegetariano'],                                                   contains: ['gluten', 'lactosa', 'huevo'] },
  { id: 12, emoji: '🌱', name: 'Pasta primavera vegana', price: 12900, cat: 'pastas',      desc: 'Pasta de trigo integral, verduras de estación salteadas y pesto sin lácteos.',     diet: ['vegano', 'vegetariano', 'fit'],                                  contains: ['gluten', 'frutos secos'] },
  { id: 13, emoji: '🍰', name: 'Torta de mil hojas',     price: 6500,  cat: 'postres',     desc: 'Clásica torta chilena con manjar, crema y hojarasca crocante.',                    diet: ['vegetariano', 'chileno'],                                        contains: ['gluten', 'lactosa', 'huevo'] },
  { id: 14, emoji: '🍮', name: 'Crème brûlée',           price: 7200,  cat: 'postres',     desc: 'Crema de vainilla con costra de azúcar caramelizada. Postre del chef.',            diet: ['vegetariano', 'sin gluten'],                                     contains: ['lactosa', 'huevo'] },
  { id: 15, emoji: '🍓', name: 'Sorbete de frutos rojos',price: 5500,  cat: 'postres',     desc: 'Sorbete artesanal sin lácteos ni azúcar añadida. Refrescante.',                    diet: ['vegano', 'sin lactosa', 'sin gluten', 'bajo en azúcar', 'fit'], contains: [] },
  { id: 16, emoji: '🍷', name: 'Vino Malbec copa',       price: 5900,  cat: 'bebestibles', desc: 'Malbec argentino. Frutos rojos, taninos suaves, ideal para carnes.',               diet: ['vegano', 'sin gluten'],                                          contains: [] },
  { id: 17, emoji: '🥂', name: 'Espumante brut copa',    price: 6500,  cat: 'bebestibles', desc: 'Espumante method traditionnel, burbuja fina. Ideal para mariscos.',                diet: ['vegano', 'sin gluten'],                                          contains: [] },
  { id: 18, emoji: '🍺', name: 'Cerveza artesanal IPA',  price: 4800,  cat: 'bebestibles', desc: 'IPA nacional con notas cítricas y amargor equilibrado. Bien fría.',                diet: ['vegano'],                                                        contains: ['gluten'] },
  { id: 19, emoji: '🧃', name: 'Limonada de jengibre',   price: 3500,  cat: 'bebestibles', desc: 'Limonada natural con jengibre y menta. Sin azúcar añadida.',                       diet: ['vegano', 'sin gluten', 'sin lactosa', 'bajo en azúcar', 'fit'], contains: [] },
  { id: 20, emoji: '☕', name: 'Café de especialidad',   price: 3900,  cat: 'bebestibles', desc: 'V60 de origen etíope. Notas florales y cítricas. Tostado medio.',                  diet: ['vegano', 'sin gluten', 'sin lactosa'],                           contains: [] },
];

// ── SEED DATA ─────────────────────────────────────────────────────────
function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) as n FROM restaurants').get();
  if (n > 0) return;

  const seedRestaurants = [
    { id:'el-rincon',    name:'El Rincón',    emoji:'🍖', city:'Providencia', region:'Santiago',   tables:20, visits:0, orders_count:0, revenue:0, avg_ticket:0, upsell_pct:0, registered_users:0, since:'Mar 2025' },
    { id:'la-pergola',   name:'La Pérgola',   emoji:'🌿', city:'Las Condes',  region:'Santiago',   tables:15, visits:0, orders_count:0, revenue:0, avg_ticket:0, upsell_pct:0, registered_users:0, since:'Abr 2025' },
    { id:'mar-tierra',   name:'Mar & Tierra', emoji:'🐟', city:'Reñaca',      region:'Valparaíso', tables:12, visits:0, orders_count:0, revenue:0, avg_ticket:0, upsell_pct:0, registered_users:0, since:'May 2025' },
    { id:'cafe-matinal', name:'Café Matinal', emoji:'☕', city:'Ñuñoa',       region:'Santiago',   tables:8,  visits:0, orders_count:0, revenue:0, avg_ticket:0, upsell_pct:0, registered_users:0, since:'Feb 2025' },
  ];
  const insR = db.prepare('INSERT INTO restaurants (id,name,emoji,city,region,tables,visits,orders_count,revenue,avg_ticket,upsell_pct,registered_users,since) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  seedRestaurants.forEach(r => insR.run(r.id,r.name,r.emoji,r.city,r.region,r.tables,r.visits,r.orders_count,r.revenue,r.avg_ticket,r.upsell_pct,r.registered_users,r.since));

  const insM = db.prepare('INSERT INTO menu_items (id,restaurant_id,emoji,name,price,cat,desc,diet,contains,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)');
  RINCON_MENU.forEach((m,i) => insM.run(m.id,'el-rincon',m.emoji,m.name,m.price,m.cat,m.desc,JSON.stringify(m.diet),JSON.stringify(m.contains),i));

  const otherMenus = {
    'la-pergola': [
      { id:101, emoji:'🥗', name:'Ensalada griega',    price:9800,  cat:'entradas',    desc:'Tomates cherry, pepino, aceitunas, queso feta y orégano.',            diet:['vegetariano'], contains:['lactosa'] },
      { id:102, emoji:'🧀', name:'Burrata de campo',   price:13500, cat:'entradas',    desc:'Burrata fresca con tomates asados, albahaca y aceite de oliva.',       diet:['vegetariano'], contains:['lactosa'] },
      { id:103, emoji:'🍝', name:'Pasta al pesto',     price:14900, cat:'pastas',      desc:'Espaguetis con pesto genovés, parmesano y piñones tostados.',          diet:['vegetariano'], contains:['gluten','lactosa','frutos secos'] },
      { id:104, emoji:'🐟', name:'Salmón grillado',    price:22500, cat:'principales', desc:'Filete de salmón con puré de coliflor y verduras de estación.',        diet:['sin gluten'],  contains:['mariscos'] },
      { id:105, emoji:'🍷', name:'Vino Chardonnay',    price:6800,  cat:'bebestibles', desc:'Chardonnay reserva, notas cítricas y madera sutil.',                   diet:['vegano'],      contains:[] },
      { id:106, emoji:'🍋', name:'Tarta de limón',     price:7200,  cat:'postres',     desc:'Tarta casera de limón con merengue tostado al soplete.',               diet:['vegetariano'], contains:['gluten','lactosa','huevo'] },
    ],
    'mar-tierra': [
      { id:201, emoji:'🐟', name:'Ceviche de corvina',  price:13800, cat:'entradas',    desc:'Corvina fresca en leche de tigre, cebolla morada y cilantro.',    diet:['sin gluten'],  contains:['mariscos'] },
      { id:202, emoji:'🦑', name:'Pulpo a la gallega',  price:15500, cat:'entradas',    desc:'Pulpo cocido, papas, pimentón ahumado y aceite de oliva.',          diet:['sin gluten'],  contains:['mariscos'] },
      { id:203, emoji:'🦞', name:'Chupe de locos',      price:17900, cat:'principales', desc:'Tradicional chupe de mariscos con queso gratinado al horno.',       diet:[],              contains:['mariscos','lactosa'] },
      { id:204, emoji:'🥩', name:'Lomo liso parrilla',  price:19500, cat:'principales', desc:'Parrillero con chimichurri de la casa y papas rústicas.',           diet:['sin gluten'],  contains:[] },
      { id:205, emoji:'🍺', name:'Cerveza artesanal',   price:4500,  cat:'bebestibles', desc:'Cerveza rubia de producción local, bien fría.',                      diet:['vegano'],      contains:['gluten'] },
      { id:206, emoji:'🍮', name:'Leche asada',         price:5500,  cat:'postres',     desc:'Clásico postre chileno con caramelo artesanal.',                     diet:['vegetariano'], contains:['lactosa','huevo'] },
    ],
    'cafe-matinal': [
      { id:301, emoji:'☕', name:'Café pour-over',        price:4200, cat:'bebestibles', desc:'Café de especialidad colombiano, tueste medio, notas florales.',   diet:['vegano'],      contains:[] },
      { id:302, emoji:'🥐', name:'Croissant mantequilla', price:3800, cat:'entradas',   desc:'Recién horneado con mantequilla bretona y mermelada.',              diet:['vegetariano'], contains:['gluten','lactosa','huevo'] },
      { id:303, emoji:'🥣', name:'Granola artesanal',    price:6500, cat:'principales', desc:'Granola de la casa con yogur griego, miel y frutas frescas.',       diet:['vegetariano'], contains:['frutos secos','lactosa'] },
      { id:304, emoji:'🍳', name:'Huevos benedictinos',  price:8900, cat:'principales', desc:'Pochados sobre brioche con jamón serrano y salsa holandesa.',       diet:[],              contains:['gluten','lactosa','huevo'] },
      { id:305, emoji:'🫐', name:'Bowl açaí',            price:9500, cat:'principales', desc:'Açaí puro con granola, banana, miel y coco rallado.',              diet:['vegano'],      contains:['frutos secos'] },
      { id:306, emoji:'🍰', name:'Torta de zanahoria',   price:5500, cat:'postres',     desc:'Húmeda con frosting de queso crema, nueces y canela.',             diet:['vegetariano'], contains:['gluten','lactosa','huevo','frutos secos'] },
    ],
  };
  Object.entries(otherMenus).forEach(([restId, items]) => {
    items.forEach((m,i) => insM.run(m.id,restId,m.emoji,m.name,m.price,m.cat,m.desc,JSON.stringify(m.diet),JSON.stringify(m.contains),i));
  });

  console.log('✓ Base de datos inicializada con datos de muestra');
}
seedIfEmpty();

// ── HELPERS ───────────────────────────────────────────────────────────
function parseRow(row) {
  if (!row) return null;
  return {
    ...row,
    diet:     JSON.parse(row.diet     || '[]'),
    contains: JSON.parse(row.contains || '[]'),
    active:   Boolean(row.active),
  };
}
function parseOrderRow(row) {
  if (!row) return null;
  return { ...row, items: JSON.parse(row.items || '[]') };
}
function parseUserRow(row) {
  if (!row) return null;
  return {
    ...row,
    restric: JSON.parse(row.restric || '[]'),
    dieta:   JSON.parse(row.dieta   || '[]'),
    gustos:  JSON.parse(row.gustos  || '[]'),
  };
}
function nextMenuId() {
  const { maxId } = db.prepare('SELECT COALESCE(MAX(id),0) as maxId FROM menu_items').get();
  return Math.max(maxId + 1, 10000);
}

// ── EXPRESS ───────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── HEALTH / DIAGNOSTICS ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const hasKey = !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-'));
  res.json({ ok: true, ai: hasKey, env: process.env.NODE_ENV || 'development' });
});

// ── REST: RESTAURANTS ─────────────────────────────────────────────────
app.get('/api/restaurants', (_req, res) => {
  const rows = db.prepare('SELECT * FROM restaurants WHERE active=1 ORDER BY rowid').all();
  res.json({ restaurants: rows });
});

app.post('/api/restaurants', (req, res) => {
  const { id, name, emoji, city, region, tables, since } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id y name son requeridos' });
  try {
    db.prepare('INSERT INTO restaurants (id,name,emoji,city,region,tables,since) VALUES (?,?,?,?,?,?,?)').run(id,name,emoji||'🍽️',city||'',region||'',tables||10,since||'');
    res.json({ ok: true, restaurant: db.prepare('SELECT * FROM restaurants WHERE id=?').get(id) });
  } catch (e) {
    res.status(409).json({ error: 'Ya existe un restaurante con ese ID' });
  }
});

app.patch('/api/restaurants/:id', (req, res) => {
  const { name, emoji, city, region, tables } = req.body;
  const fields = [];
  const vals = [];
  if (name   !== undefined) { fields.push('name=?');   vals.push(name); }
  if (emoji  !== undefined) { fields.push('emoji=?');  vals.push(emoji); }
  if (city   !== undefined) { fields.push('city=?');   vals.push(city); }
  if (region !== undefined) { fields.push('region=?'); vals.push(region); }
  if (tables !== undefined) { fields.push('tables=?'); vals.push(tables); }
  if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.id);
  db.prepare(`UPDATE restaurants SET ${fields.join(',')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

app.delete('/api/restaurants/:id', (req, res) => {
  db.prepare('UPDATE restaurants SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── REST: MENU ITEMS ──────────────────────────────────────────────────
app.get('/api/restaurants/:id/menu', (req, res) => {
  const rows = db.prepare('SELECT * FROM menu_items WHERE restaurant_id=? ORDER BY sort_order,id').all(req.params.id);
  res.json({ items: rows.map(parseRow) });
});

app.post('/api/restaurants/:id/menu', (req, res) => {
  const { emoji, name, price, cat, desc, diet, contains } = req.body;
  if (!name) return res.status(400).json({ error: 'name requerido' });
  const id = nextMenuId();
  const sortOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 as next FROM menu_items WHERE restaurant_id=?').get(req.params.id).next;
  db.prepare('INSERT INTO menu_items (id,restaurant_id,emoji,name,price,cat,desc,diet,contains,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    id, req.params.id, emoji||'🍽️', name, price||0, cat||'principales', desc||'',
    JSON.stringify(diet||[]), JSON.stringify(contains||[]), sortOrder
  );
  res.json({ ok: true, item: parseRow(db.prepare('SELECT * FROM menu_items WHERE id=?').get(id)) });
});

app.put('/api/restaurants/:id/menu/:itemId', (req, res) => {
  const { emoji, name, price, cat, desc, diet, contains, active } = req.body;
  const fields = [], vals = [];
  if (emoji    !== undefined) { fields.push('emoji=?');    vals.push(emoji); }
  if (name     !== undefined) { fields.push('name=?');     vals.push(name); }
  if (price    !== undefined) { fields.push('price=?');    vals.push(price); }
  if (cat      !== undefined) { fields.push('cat=?');      vals.push(cat); }
  if (desc     !== undefined) { fields.push('desc=?');     vals.push(desc); }
  if (diet     !== undefined) { fields.push('diet=?');     vals.push(JSON.stringify(diet)); }
  if (contains !== undefined) { fields.push('contains=?'); vals.push(JSON.stringify(contains)); }
  if (active   !== undefined) { fields.push('active=?');   vals.push(active ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.itemId, req.params.id);
  db.prepare(`UPDATE menu_items SET ${fields.join(',')} WHERE id=? AND restaurant_id=?`).run(...vals);
  res.json({ ok: true });
});

app.delete('/api/restaurants/:id/menu/:itemId', (req, res) => {
  db.prepare('DELETE FROM menu_items WHERE id=? AND restaurant_id=?').run(req.params.itemId, req.params.id);
  res.json({ ok: true });
});

app.put('/api/restaurants/:id/menu', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items debe ser array' });
  db.prepare('DELETE FROM menu_items WHERE restaurant_id=?').run(req.params.id);
  const ins = db.prepare('INSERT INTO menu_items (id,restaurant_id,emoji,name,price,cat,desc,diet,contains,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)');
  let baseId = nextMenuId();
  items.forEach((m,i) => ins.run(baseId+i, req.params.id, m.emoji||'🍽️', m.name||'', m.price||0, m.cat||'principales', m.desc||'', JSON.stringify(m.diet||[]), JSON.stringify(m.contains||[]), i));
  res.json({ ok: true, count: items.length });
});

// ── REST: ORDERS ──────────────────────────────────────────────────────
app.get('/api/restaurants/:id/orders', (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE restaurant_id=? ORDER BY created_at DESC LIMIT 100').all(req.params.id);
  res.json({ orders: rows.map(parseOrderRow) });
});

app.post('/api/restaurants/:id/orders', (req, res) => {
  const { mesa, items, total, user_name, user_id } = req.body;
  if (!items || !total) return res.status(400).json({ error: 'items y total requeridos' });
  const { lastInsertRowid } = db.prepare('INSERT INTO orders (restaurant_id,mesa,items,total,user_name,user_id) VALUES (?,?,?,?,?,?)').run(
    req.params.id, mesa||0, JSON.stringify(items), total, user_name||null, user_id||null
  );
  db.prepare('UPDATE restaurants SET orders_count=orders_count+1, revenue=revenue+? WHERE id=?').run(total, req.params.id);
  db.prepare('UPDATE restaurants SET avg_ticket=CASE WHEN orders_count>0 THEN revenue/orders_count ELSE 0 END WHERE id=?').run(req.params.id);
  res.json({ ok: true, orderId: lastInsertRowid });
});

app.patch('/api/orders/:id', (req, res) => {
  const { status } = req.body;
  if (!['cooking','ready','delivered','cancelled'].includes(status)) return res.status(400).json({ error: 'status inválido' });
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true });
});

// ── REST: USERS ───────────────────────────────────────────────────────
app.get('/api/users/:id', (req, res) => {
  const row = db.prepare('SELECT id,name,email,restaurant_id,restric,dieta,gustos,points,created_at FROM users WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user: parseUserRow(row) });
});

app.post('/api/users', (req, res) => {
  const { name, email, password, restaurant_id, restric, dieta, gustos } = req.body;
  if (!name) return res.status(400).json({ error: 'name requerido' });
  try {
    const { lastInsertRowid } = db.prepare('INSERT INTO users (name,email,password,restaurant_id,restric,dieta,gustos) VALUES (?,?,?,?,?,?,?)').run(
      name, email?.toLowerCase().trim()||null, password||null, restaurant_id||null,
      JSON.stringify(restric||[]), JSON.stringify(dieta||[]), JSON.stringify(gustos||[])
    );
    if (restaurant_id) db.prepare('UPDATE restaurants SET registered_users=registered_users+1 WHERE id=?').run(restaurant_id);
    res.json({ ok: true, userId: lastInsertRowid });
  } catch(e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
    throw e;
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const row = db.prepare('SELECT * FROM users WHERE email=? AND password=?').get(email.toLowerCase().trim(), password);
  if (!row) return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  const user = parseUserRow(row);
  delete user.password;
  res.json({ ok: true, user });
});

app.patch('/api/users/:id', (req, res) => {
  const { points, restric, dieta, gustos } = req.body;
  const fields = [], vals = [];
  if (points  !== undefined) { fields.push('points=?');  vals.push(points); }
  if (restric !== undefined) { fields.push('restric=?'); vals.push(JSON.stringify(restric)); }
  if (dieta   !== undefined) { fields.push('dieta=?');   vals.push(JSON.stringify(dieta)); }
  if (gustos  !== undefined) { fields.push('gustos=?');  vals.push(JSON.stringify(gustos)); }
  if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.id);
  db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

// ── REST: STATS ───────────────────────────────────────────────────────
app.get('/api/restaurants/:id/stats', (req, res) => {
  const id = req.params.id;
  const rest = db.prepare('SELECT * FROM restaurants WHERE id=?').get(id);
  if (!rest) return res.status(404).json({ error: 'No encontrado' });

  // Orders by hour of day
  const byHour = Array(24).fill(0);
  db.prepare("SELECT CAST(strftime('%H',created_at) AS INTEGER) as h, COUNT(*) as n FROM orders WHERE restaurant_id=? GROUP BY h").all(id)
    .forEach(r => { byHour[r.h] = r.n; });

  // Top items from all orders
  const itemCounts = {};
  db.prepare('SELECT items FROM orders WHERE restaurant_id=?').all(id).forEach(o => {
    try { JSON.parse(o.items).forEach(it => {
      if (!itemCounts[it.id]) itemCounts[it.id] = { id: it.id, name: it.name, emoji: it.emoji || '🍽️', count: 0 };
      itemCounts[it.id].count += (it.qty || 1);
    }); } catch {}
  });
  const topItems = Object.values(itemCounts).sort((a,b) => b.count - a.count).slice(0, 10);
  const maxCount = topItems[0]?.count || 1;
  topItems.forEach(it => { it.pct = Math.round(it.count / maxCount * 100); });

  // Top combos (pairs ordered together)
  const combos = {};
  db.prepare('SELECT items FROM orders WHERE restaurant_id=?').all(id).forEach(o => {
    try {
      const its = JSON.parse(o.items);
      for (let i = 0; i < its.length; i++) for (let j = i+1; j < its.length; j++) {
        const key = [its[i].id, its[j].id].sort().join('-');
        if (!combos[key]) combos[key] = { a: its[i], b: its[j], count: 0 };
        combos[key].count++;
      }
    } catch {}
  });
  const topCombos = Object.values(combos).sort((a,b) => b.count - a.count).slice(0, 5);

  // Recent orders for notifications
  const recentOrders = db.prepare('SELECT * FROM orders WHERE restaurant_id=? ORDER BY created_at DESC LIMIT 8').all(id).map(parseOrderRow);

  // Active mesas (cooking status)
  const activeMesas = db.prepare("SELECT DISTINCT mesa FROM orders WHERE restaurant_id=? AND status='cooking'").all(id).map(r => r.mesa);

  res.json({ ordersCount: rest.orders_count, revenue: rest.revenue, avgTicket: rest.avg_ticket, registeredUsers: rest.registered_users, byHour, topItems, topCombos, recentOrders, activeMesas });
});

app.get('/api/restaurants/:id/users', (req, res) => {
  const rows = db.prepare('SELECT id,name,email,restric,dieta,gustos,points,created_at FROM users WHERE restaurant_id=? ORDER BY points DESC LIMIT 50').all(req.params.id);
  res.json({ users: rows.map(parseUserRow) });
});

app.get('/api/network/stats', (_req, res) => {
  const itemCounts = {};
  const restNames = {};
  db.prepare('SELECT id,name FROM restaurants').all().forEach(r => { restNames[r.id] = r.name; });
  db.prepare('SELECT items, restaurant_id FROM orders').all().forEach(o => {
    try { JSON.parse(o.items).forEach(it => {
      const key = `${o.restaurant_id}|${it.id}`;
      if (!itemCounts[key]) itemCounts[key] = { ...it, count: 0, restaurant_id: o.restaurant_id, restaurant: restNames[o.restaurant_id] || o.restaurant_id };
      itemCounts[key].count += (it.qty || 1);
    }); } catch {}
  });
  const topDishes = Object.values(itemCounts).sort((a,b) => b.count - a.count).slice(0, 15);
  res.json({ topDishes });
});

// ── AI: MENU CONTEXT (El Rincón) ──────────────────────────────────────
function getMenuForAI(restaurantId) {
  const rows = db.prepare('SELECT * FROM menu_items WHERE restaurant_id=? AND active=1 ORDER BY sort_order').all(restaurantId);
  return rows.length ? rows.map(parseRow) : RINCON_MENU;
}

function menuStr(menu) {
  return menu.map(m =>
    `${m.id}|${m.emoji}|${m.name}|${m.cat}|$${m.price}|dieta:${m.diet.join(',')}|contiene:${m.contains.join(',') || 'nada'}`
  ).join('\n');
}

// ── POST /api/recs ────────────────────────────────────────────────────
app.post('/api/recs', async (req, res) => {
  const { cart, profile, hour, restaurantId } = req.body;
  const MENU = getMenuForAI(restaurantId || 'el-rincon');
  const cartLines = Object.entries(cart)
    .map(([id, qty]) => { const it = MENU.find(m => m.id === +id); return it ? `- ${it.name} (${it.cat}) x${qty}` : null; })
    .filter(Boolean).join('\n');
  const h = hour ?? new Date().getHours();
  const prompt = `Eres el motor de recomendaciones de MenuAI. Son las ${h}:00h.\n\nMENÚ:\n${menuStr(MENU)}\n\nPEDIDO:\n${cartLines || '(vacío)'}\n\nPERFIL: ${buildProfileText(profile)}\n\nRecomienda exactamente 3 platos que complementen el pedido. NO recomiendes platos ya en el pedido. Responde SOLO JSON:\n[{"id":16,"why":"razón 1 línea en chileno informal"},{"id":13,"why":"..."},{"id":4,"why":"..."}]`;
  try {
    const msg = await client.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens:400, messages:[{role:'user',content:prompt}] });
    const recs = extractJSON(msg.content.find(b=>b.type==='text')?.text||'[]');
    const enriched = recs.map(r=>{const it=MENU.find(m=>m.id===r.id);return it?{...it,why:r.why}:null;}).filter(Boolean).slice(0,3);
    res.json({ recs: enriched });
  } catch(e) { console.error('recs error:',e.message); res.status(500).json({ recs:[] }); }
});

// ── POST /api/detail-recs ─────────────────────────────────────────────
app.post('/api/detail-recs', async (req, res) => {
  const { itemId, profile, restaurantId } = req.body;
  const MENU = getMenuForAI(restaurantId || 'el-rincon');
  const item = MENU.find(m => m.id === itemId);
  if (!item) return res.status(400).json({ recs:[] });
  const otherMenu = MENU.filter(m=>m.id!==itemId).map(m=>`${m.id}|${m.emoji}|${m.name}|${m.cat}|$${m.price}|contiene:${m.contains.join(',')||'nada'}`).join('\n');
  const prompt = `Eres el motor de recomendaciones de MenuAI.\n\nEl cliente mira: ${item.name} (${item.cat}, $${item.price}). ${item.desc}\n\nMENÚ:\n${otherMenu}\n\nPERFIL: ${buildProfileText(profile)}\n\nRecomienda 2 platos que complementen "${item.name}". Responde SOLO JSON:\n[{"id":16,"why":"razón"},{"id":4,"why":"razón"}]`;
  try {
    const msg = await client.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens:300, messages:[{role:'user',content:prompt}] });
    const recs = extractJSON(msg.content.find(b=>b.type==='text')?.text||'[]');
    const enriched = recs.map(r=>{const it=MENU.find(m=>m.id===r.id);return it?{...it,why:r.why}:null;}).filter(Boolean).slice(0,2);
    res.json({ recs: enriched });
  } catch(e) { console.error('detail-recs error:',e.message); res.status(500).json({ recs:[] }); }
});

// ── POST /api/chat ────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, profile, cart, restaurantId } = req.body;
  const MENU = getMenuForAI(restaurantId || 'el-rincon');
  const rest = db.prepare('SELECT * FROM restaurants WHERE id=?').get(restaurantId||'el-rincon');
  const restName = rest?.name || 'el restaurante';
  const cartSummary = Object.keys(cart||{}).length
    ? Object.entries(cart).map(([id,qty])=>{const it=MENU.find(m=>m.id===+id);return it?`${it.emoji} ${it.name} x${qty}`:null;}).filter(Boolean).join(', ')
    : 'ninguno todavía';
  const system = `Eres el asistente virtual de ${restName}. Eres un garzón profesional, amable y cercano. Atiendes con rapidez, cordialidad y eficiencia. Habla de forma natural, breve y amigable — evita respuestas largas o técnicas. Si el cliente tiene dudas sobre un plato, respóndelas con honestidad. Sugiere opciones complementarias solo cuando sea relevante. Mantén siempre un tono positivo y servicial, como el de un excelente garzón en un restaurante de calidad. Habla en español neutro y profesional.

MENÚ COMPLETO:
${menuStr(MENU)}

PERFIL DEL CLIENTE: ${buildProfileText(profile)}
PEDIDO ACTUAL: ${cartSummary}

Responde en máximo 2-3 oraciones. No inventes platos fuera del menú. Si no tienes información, indícalo con honestidad y ofrece una alternativa.`;
  try {
    const msg = await client.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens:300, system, messages:messages.map(m=>({role:m.role,content:m.content})) });
    res.json({ reply: msg.content.find(b=>b.type==='text')?.text||'' });
  } catch(e) {
    console.error('chat error:', e.message);
    const msg = e.status === 401 ? 'API key inválida — revisa la configuración.' : 'Lo siento, intenta de nuevo.';
    res.status(500).json({ reply: msg });
  }
});

// ── GET /api/menu (legacy compat, El Rincón) ──────────────────────────
app.get('/api/menu', (_req, res) => {
  const rows = db.prepare('SELECT * FROM menu_items WHERE restaurant_id=? ORDER BY sort_order,id').all('el-rincon');
  res.json({ menu: rows.map(parseRow) });
});

// ── GET /api/qr ───────────────────────────────────────────────────────
function getLocalIP() {
  const os = require('os');
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return 'localhost';
}

app.get('/api/qr', async (req, res) => {
  const QRCode = require('qrcode');
  const { restaurant, mesa } = req.query;
  let baseUrl;
  if (process.env.PUBLIC_URL) {
    baseUrl = process.env.PUBLIC_URL.replace(/\/$/, '');
  } else {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const rawHost = req.headers['x-forwarded-host'] || req.get('host') || '';
    const isLocalhost = rawHost.startsWith('localhost') || rawHost.startsWith('127.');
    const host = isLocalhost ? `${getLocalIP()}:${PORT}` : rawHost;
    baseUrl = `${proto}://${host}`;
  }
  let url = baseUrl;
  if (restaurant) url += `/${restaurant}`;
  if (mesa) url += `?mesa=${mesa}`;
  try {
    const svg = await QRCode.toString(url, { type:'svg', width:220, margin:1, color:{ dark:'#C9A24C', light:'#1B1713' } });
    res.type('svg').set('Cache-Control', 'no-store').send(svg);
  } catch(e) { res.status(500).send('Error generando QR'); }
});

// ── Catch-all ─────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

function extractJSON(text) {
  const cleaned = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try { return JSON.parse(match[0]); } catch { return []; }
}
function buildProfileText(profile = {}) {
  const p = [];
  if (profile.restric?.length) p.push('RESTRICCIONES: ' + profile.restric.join(', '));
  if (profile.dieta?.length)   p.push('DIETA: ' + profile.dieta.join(', '));
  if (profile.gustos?.length)  p.push('GUSTOS: ' + profile.gustos.join(', '));
  return p.length ? p.join('. ') : 'Sin preferencias declaradas.';
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MenuAI server corriendo en http://localhost:${PORT}`));
