// Pages Functions route: POST /api/claim
// Uses:
// - env.TURNSTILE_SECRET
// - env.DB (D1 binding)

const UNLIMITED = [1, 2, 4, 5, 6, 7, 8]
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

function bad(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, { status })
}

function normalizeName(s) {
  return (s ?? '').toString().trim().slice(0, 16)
}

function padNo(n) {
  const s = String(n)
  return s.length >= 4 ? s : '0'.repeat(4 - s.length) + s
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

async function rateLimit(db, ip) {
  const now = Date.now()
  const row = await db.prepare('SELECT last_ms FROM ip_rate WHERE ip = ?;').bind(ip).first()
  const last = row?.last_ms ?? 0
  if (now - last < 30_000) {
    return { ok: false, retryAfterMs: 30_000 - (now - last) }
  }
  await db.prepare('INSERT INTO ip_rate (ip, last_ms) VALUES (?, ?) ON CONFLICT(ip) DO UPDATE SET last_ms = excluded.last_ms;')
    .bind(ip, now)
    .run()
  return { ok: true }
}

async function nextCardNo(db) {
  const r = await db.prepare('UPDATE meta SET next_no = next_no + 1 WHERE id = 1 RETURNING next_no - 1 AS card_no;').run()
  const cardNo = r?.results?.[0]?.card_no
  if (!cardNo) throw new Error('Failed to allocate card number')
  return cardNo
}

async function pickCardType(db) {
  const limited = await db.prepare('SELECT card_type, remaining FROM limited WHERE remaining > 0;').all()
  const rows = limited?.results || []
  const total = rows.reduce((s, x) => s + (x.remaining || 0), 0)

  if (total > 0) {
    let r = Math.floor(Math.random() * total) + 1
    for (const row of rows) {
      r -= row.remaining
      if (r <= 0) {
        const dec = await db.prepare('UPDATE limited SET remaining = remaining - 1 WHERE card_type = ? AND remaining > 0;')
          .bind(row.card_type)
          .run()
        if ((dec.meta?.changes || 0) === 1) return row.card_type
        return pickCardType(db)
      }
    }
  }

  return UNLIMITED[Math.floor(Math.random() * UNLIMITED.length)]
}

export async function onRequestPost(context) {
  const { request, env } = context

  let body
  try {
    body = await request.json()
  } catch {
    return bad('Invalid JSON')
  }

  const name = normalizeName(body?.name)
  if (!name) return bad('Name required')

  const token = (body?.cfTurnstileToken ?? '').toString()
  if (!token) return bad('Turnstile token required')
  if (!env.TURNSTILE_SECRET) return bad('Server not configured (TURNSTILE_SECRET missing)', 500)
  if (!env.DB) return bad('Server not configured (DB binding missing)', 500)

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'

  // Turnstile verify
  const form = new FormData()
  form.set('secret', env.TURNSTILE_SECRET)
  form.set('response', token)
  if (ip) form.set('remoteip', ip)

  const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })
  const vr = await v.json().catch(() => null)
  if (!vr?.success) return bad('Human verification failed', 403)

  try {
    await ensureSchema(env.DB)
    const rl = await rateLimit(env.DB, ip)
    if (!rl.ok) return bad('Too many requests', 429, { retryAfterMs: rl.retryAfterMs })

    const cardTypeId = await pickCardType(env.DB)
    const cardNoInt = await nextCardNo(env.DB)

    return json({
      ok: true,
      name,
      cardTypeId,
      cardNo: `#${padNo(cardNoInt)}`,
      image: `/assets/cards/${cardTypeId}.jpg`,
    })
  } catch {
    return bad('Server error', 500)
  }
}

export async function onRequestGet() {
  return new Response('Method Not Allowed', { status: 405 })
}
