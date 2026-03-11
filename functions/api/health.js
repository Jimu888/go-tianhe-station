// GET /api/health
// Lightweight diagnostics: checks env bindings and D1 schema.

const LIMITED_INIT = [
  [3, 1],
  [9, 5],
  [10, 3],
  [11, 1],
  [12, 2],
]

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    ...init,
  })
}

async function ensureSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_no INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS limited (
      card_type INTEGER PRIMARY KEY,
      remaining INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ip_rate (
      ip TEXT PRIMARY KEY,
      last_ms INTEGER NOT NULL
    );
  `)

  await db.prepare('INSERT INTO meta (id, next_no) VALUES (1, 1) ON CONFLICT(id) DO NOTHING;').run()

  for (const [cardType, qty] of LIMITED_INIT) {
    await db.prepare('INSERT INTO limited (card_type, remaining) VALUES (?, ?) ON CONFLICT(card_type) DO NOTHING;')
      .bind(cardType, qty)
      .run()
  }
}

export async function onRequestGet({ env }) {
  const hasSecret = !!env.TURNSTILE_SECRET
  const hasDb = !!env.DB

  const out = {
    ok: true,
    hasTurnstileSecret: hasSecret,
    hasDB: hasDb,
  }

  if (!hasDb) {
    return json({ ok: false, error: 'DB binding missing', ...out }, { status: 500 })
  }

  try {
    await ensureSchema(env.DB)
    const meta = await env.DB.prepare('SELECT next_no FROM meta WHERE id = 1;').first()
    const limited = await env.DB.prepare('SELECT card_type, remaining FROM limited ORDER BY card_type;').all()
    out.meta = meta
    out.limited = limited.results
    return json(out)
  } catch (e) {
    return json({ ok: false, error: 'DB error', message: String(e?.message || e), ...out }, { status: 500 })
  }
}
