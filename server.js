try { require('dotenv').config(); } catch {}
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── MENÚ (fuente de verdad del servidor) ─────────────────────────────
const MENU = [
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

function menuStr() {
  return MENU.map(m =>
    `${m.id}|${m.emoji}|${m.name}|${m.cat}|$${m.price}|dieta:${m.diet.join(',')}|contiene:${m.contains.join(',') || 'nada'}`
  ).join('\n');
}

// ── POST /api/recs — recomendaciones por pedido en curso ─────────────
app.post('/api/recs', async (req, res) => {
  const { cart, profile, hour } = req.body;

  const cartLines = Object.entries(cart)
    .map(([id, qty]) => {
      const it = MENU.find(m => m.id === +id);
      return it ? `- ${it.name} (${it.cat}) x${qty}` : null;
    })
    .filter(Boolean)
    .join('\n');

  const profileText = buildProfileText(profile);
  const h = hour ?? new Date().getHours();

  const prompt = `Eres el motor de recomendaciones de MenuAI, restaurante chileno de segmento medio-alto en Providencia, Santiago. Son las ${h}:00h.

MENÚ (id|emoji|nombre|categoría|precio|dieta|contiene):
${menuStr()}

PEDIDO ACTUAL DEL CLIENTE:
${cartLines || '(vacío)'}

PERFIL DEL CLIENTE: ${profileText}

Tu misión: aumentar el ticket con upsell contextual inteligente, RESPETANDO ESTRICTAMENTE las restricciones del cliente (nunca recomiendes algo que contenga un alérgeno que el cliente debe evitar). Recomienda exactamente 3 platos que complementen el pedido (maridajes, combos chilenos típicos, balance). NO recomiendes platos ya en el pedido. Cuando una sugerencia conecte con el perfil del cliente, menciónalo en el "why".

Responde SOLO JSON válido, sin texto extra ni backticks:
[{"id":16,"why":"razón concisa de 1 línea en chileno informal"},{"id":13,"why":"..."},{"id":4,"why":"..."}]`;

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.find(b => b.type === 'text')?.text || '[]';
    const recs = JSON.parse(text.replace(/```json|```/g, '').trim());
    const enriched = recs
      .map(r => { const it = MENU.find(m => m.id === r.id); return it ? { ...it, why: r.why } : null; })
      .filter(Boolean)
      .slice(0, 3);
    res.json({ recs: enriched });
  } catch (e) {
    console.error('recs error:', e.message);
    res.status(500).json({ recs: [] });
  }
});

// ── POST /api/detail-recs — maridaje para un plato ───────────────────
app.post('/api/detail-recs', async (req, res) => {
  const { itemId, profile } = req.body;
  const item = MENU.find(m => m.id === itemId);
  if (!item) return res.status(400).json({ recs: [] });

  const otherMenu = MENU.filter(m => m.id !== itemId)
    .map(m => `${m.id}|${m.emoji}|${m.name}|${m.cat}|$${m.price}|contiene:${m.contains.join(',') || 'nada'}`)
    .join('\n');
  const h = new Date().getHours();

  const prompt = `Eres el motor de recomendaciones de MenuAI, restaurante chileno en Providencia. Son las ${h}:00h.

El cliente mira: ${item.name} (${item.cat}, $${item.price}). ${item.desc}

MENÚ (id|emoji|nombre|categoría|precio|contiene):
${otherMenu}

PERFIL DEL CLIENTE: ${buildProfileText(profile)}

Recomienda exactamente 2 platos que complementen "${item.name}" (maridajes vino+carne, postre+café, entradas que combinen). RESPETA las restricciones del cliente: jamás sugieras algo con un alérgeno que debe evitar. Lenguaje chileno informal.

Responde SOLO JSON válido sin texto extra ni backticks:
[{"id":16,"why":"razón 1 línea"},{"id":4,"why":"razón"}]`;

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.find(b => b.type === 'text')?.text || '[]';
    const recs = JSON.parse(text.replace(/```json|```/g, '').trim());
    const enriched = recs
      .map(r => { const it = MENU.find(m => m.id === r.id); return it ? { ...it, why: r.why } : null; })
      .filter(Boolean)
      .slice(0, 2);
    res.json({ recs: enriched });
  } catch (e) {
    console.error('detail-recs error:', e.message);
    res.status(500).json({ recs: [] });
  }
});

// ── POST /api/chat — chat con el asistente del restaurante ───────────
app.post('/api/chat', async (req, res) => {
  const { messages, profile, cart } = req.body;

  const cartSummary = Object.keys(cart).length
    ? Object.entries(cart).map(([id, qty]) => {
        const it = MENU.find(m => m.id === +id);
        return it ? `${it.emoji} ${it.name} x${qty}` : null;
      }).filter(Boolean).join(', ')
    : 'ninguno todavía';

  const system = `Eres Rincón AI, el asistente virtual de El Rincón, un restaurante chileno de segmento medio-alto en Providencia, Santiago. Eres amable, conocedor y hablas en español chileno informal pero sofisticado — como un garzón experto.

MENÚ COMPLETO:
${menuStr()}

PERFIL DEL CLIENTE: ${buildProfileText(profile)}
PEDIDO ACTUAL: ${cartSummary}
HORA ACTUAL: ${new Date().getHours()}:00h

Puedes ayudar con: recomendaciones, información de platos, maridajes, restricciones dietéticas, tiempos, porciones, ingredientes. Sé conciso (máximo 3 oraciones). No inventes platos que no estén en el menú. Si recomiendas algo, menciona el precio.`;

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });
    const reply = msg.content.find(b => b.type === 'text')?.text || '';
    res.json({ reply });
  } catch (e) {
    console.error('chat error:', e.message);
    res.status(500).json({ reply: 'Lo siento, no pude procesar tu consulta. Intenta de nuevo.' });
  }
});

// ── GET /api/menu ─────────────────────────────────────────────────────
app.get('/api/menu', (_req, res) => res.json({ menu: MENU }));

// ── Catch-all → index.html ────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

function buildProfileText(profile = {}) {
  const p = [];
  if (profile.restric?.length) p.push('RESTRICCIONES (evitar estrictamente): ' + profile.restric.join(', '));
  if (profile.dieta?.length)   p.push('DIETA: ' + profile.dieta.join(', '));
  if (profile.gustos?.length)  p.push('GUSTOS: ' + profile.gustos.join(', '));
  return p.length ? p.join('. ') : 'Sin preferencias declaradas.';
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MenuAI server corriendo en http://localhost:${PORT}`));
