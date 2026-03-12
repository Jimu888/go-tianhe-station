// Pages Functions route: POST /api/claim
// Uses:
// - env.TURNSTILE_SECRET
// - env.DB (D1 binding)
// Phone binding (no SMS): phone_hash -> (card_no_int, card_type). Same phone returns same card/number.

// Card distribution (per latest file-name notes)
// No "-N张" suffix => unlimited
// With "-N张" suffix => limited with remaining=N
const UNLIMITED = [2, 3, 4, 5, 7, 8, 9, 10, 11]
const LIMITED_INIT = [
  [1, 1],
  [6, 3],
  [12, 2],
]

const HIDDEN_SET = new Set([1, 6, 12])

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

function normalizePhone(s) {
  return (s ?? '').toString().replace(/\s+/g, '').trim()
}

function normalizeCode(s) {
  return (s ?? '').toString().replace(/\s+/g, '').trim()
}

async function sha256Hex(s) {
  const enc = new TextEncoder().encode(s)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function phoneHash(env, phone) {
  const salt = (env.PHONE_HASH_SALT || 'salt').toString()
  return sha256Hex(`${phone}|${salt}`)
}

async function deviceHash(env, deviceId) {
  const salt = (env.DEVICE_HASH_SALT || 'salt').toString()
  return sha256Hex(`${deviceId}|${salt}`)
}

async function getExistingPhoneClaim(db, ph) {
  return db.prepare('SELECT card_no_int, card_type FROM phone_claims WHERE phone_hash = ?;')
    .bind(ph)
    .first()
}

async function getExistingDeviceClaim(db, dh) {
  return db.prepare('SELECT card_no_int, card_type FROM device_claims WHERE device_hash = ?;')
    .bind(dh)
    .first()
}


function padNo(n) {
  const s = String(n)
  return s.length >= 5 ? s : '0'.repeat(5 - s.length) + s
}

async function ensureSchema(db) {
  // D1 can be picky about multi-statement exec on some accounts; run one-by-one
  await db.exec('CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY, next_no INTEGER NOT NULL);')
  await db.exec('CREATE TABLE IF NOT EXISTS limited (card_type INTEGER PRIMARY KEY, remaining INTEGER NOT NULL);')
  await db.exec('CREATE TABLE IF NOT EXISTS ip_rate (ip TEXT PRIMARY KEY, last_ms INTEGER NOT NULL);')
  await db.exec('CREATE TABLE IF NOT EXISTS phone_claims (phone_hash TEXT PRIMARY KEY, claimed_ms INTEGER NOT NULL, card_no_int INTEGER NOT NULL, card_type INTEGER NOT NULL);')
  await db.exec('CREATE TABLE IF NOT EXISTS device_claims (device_hash TEXT PRIMARY KEY, claimed_ms INTEGER NOT NULL, card_no_int INTEGER NOT NULL, card_type INTEGER NOT NULL);')
  await db.exec('CREATE TABLE IF NOT EXISTS claim_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts_ms INTEGER NOT NULL, ip TEXT, reason TEXT, phone_hash_prefix TEXT, device_hash_prefix TEXT, card_no_int INTEGER, card_type INTEGER);')

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
  // Rate limit: 1 claim per 5 seconds (was 30s)
  if (now - last < 5_000) {
    return { ok: false, retryAfterMs: 5_000 - (now - last) }
  }
  await db.prepare('INSERT INTO ip_rate (ip, last_ms) VALUES (?, ?) ON CONFLICT(ip) DO UPDATE SET last_ms = excluded.last_ms;')
    .bind(ip, now)
    .run()
  return { ok: true }
}

const TOTAL_CAP = 500

async function nextCardNo(db) {
  // Atomic cap: only allocate numbers 1..TOTAL_CAP
  const r = await db.prepare('UPDATE meta SET next_no = next_no + 1 WHERE id = 1 AND next_no <= ? RETURNING next_no - 1 AS card_no;')
    .bind(TOTAL_CAP)
    .run()
  const cardNo = r?.results?.[0]?.card_no
  if (!cardNo) return null
  return cardNo
}

async function limitedRemainingTotal(db) {
  const limited = await db.prepare('SELECT remaining FROM limited WHERE remaining > 0;').all()
  const rows = limited?.results || []
  return rows.reduce((s, x) => s + (x.remaining || 0), 0)
}

async function pickLimitedCardType(db) {
  const limited = await db.prepare('SELECT card_type, remaining FROM limited WHERE remaining > 0;').all()
  const rows = limited?.results || []
  const total = rows.reduce((s, x) => s + (x.remaining || 0), 0)
  if (total <= 0) return null

  let r = Math.floor(Math.random() * total) + 1
  for (const row of rows) {
    r -= row.remaining
    if (r <= 0) {
      const dec = await db.prepare('UPDATE limited SET remaining = remaining - 1 WHERE card_type = ? AND remaining > 0;')
        .bind(row.card_type)
        .run()
      if ((dec.meta?.changes || 0) === 1) return row.card_type
      return pickLimitedCardType(db)
    }
  }
  return null
}

function pickUnlimitedCardType() {
  return UNLIMITED[Math.floor(Math.random() * UNLIMITED.length)]
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function() {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function seededWinningSet(env) {
  // Exactly 12 winners within 1..1500 (stable across deploys as long as seed stays same)
  const MAX = 1500
  const WIN = 12
  const seedStr = (env.LIMITED_DRAW_SEED || 'seed').toString()
  const hex = await sha256Hex(seedStr)
  const seed = parseInt(hex.slice(0, 8), 16) >>> 0
  const rnd = mulberry32(seed)

  const set = new Set()
  while (set.size < WIN) {
    const n = 1 + Math.floor(rnd() * MAX)
    set.add(n)
  }
  return set
}

export async function onRequestPost(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const isTest = url.searchParams.get('test') === '1'
  const forcedCard = url.searchParams.get('card') || url.searchParams.get('cardTypeId')

  let body
  try {
    body = await request.json()
  } catch {
    return bad('Invalid JSON')
  }

  const name = normalizeName(body?.name)
  if (!name) return bad('Name required')

  if (!env.DB) return bad('Server not configured (DB binding missing)', 500)

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'

  // In test mode: skip rate limit + phone binding + inventory + numbering
  // In normal mode: phone binding (idempotent) + device binding + IP rate limit

  try {
    await ensureSchema(env.DB)

    if (isTest) {
      let cardTypeId
      const n = parseInt(forcedCard || '', 10)
      if (n >= 1 && n <= 12) cardTypeId = n
      else cardTypeId = (Math.floor(Date.now() / 1000) % 12) + 1

      const cardNo = `#${padNo(cardTypeId)}`
      return json({
        ok: true,
        test: true,
        name,
        cardTypeId,
        cardNo,
        cardNoDisplay: `（编号${cardNo}）`,
        image: `/assets/cards/${cardTypeId}.jpg`,
      })
    }

    const phone = normalizePhone(body?.phone)
    const deviceId = (body?.deviceId ?? '').toString().trim()
    if (!/^1\d{10}$/.test(phone)) return bad('Invalid phone')
    if (!deviceId) return bad('Device id required')

    const ph = await phoneHash(env, phone)
    const dh = await deviceHash(env, deviceId)

    // Device first: one device -> one card
    const exDev = await getExistingDeviceClaim(env.DB, dh)
    if (exDev?.card_no_int && exDev?.card_type) {
      const cardNo = `#${padNo(exDev.card_no_int)}`
      await env.DB.prepare('INSERT INTO claim_log (ts_ms, ip, reason, phone_hash_prefix, device_hash_prefix, card_no_int, card_type) VALUES (?, ?, ?, ?, ?, ?, ?);')
        .bind(Date.now(), ip, 'device', ph.slice(0, 10), dh.slice(0, 10), exDev.card_no_int, exDev.card_type)
        .run()
      return json({
        ok: true,
        alreadyClaimed: true,
        reason: 'device',
        name,
        cardTypeId: exDev.card_type,
        rarity: HIDDEN_SET.has(exDev.card_type) ? 'hidden' : 'regular',
        cardNo,
        cardNoDisplay: `（编号${cardNo}）`,
        image: `/assets/cards/${exDev.card_type}.jpg`,
      })
    }

    // Phone: allow re-download on another device, but not multiple new claims
    const exPhone = await getExistingPhoneClaim(env.DB, ph)
    if (exPhone?.card_no_int && exPhone?.card_type) {
      const cardNo = `#${padNo(exPhone.card_no_int)}`
      // bind this device to the existing claim (must succeed for consistency)
      await env.DB.prepare('INSERT INTO device_claims (device_hash, claimed_ms, card_no_int, card_type) VALUES (?, ?, ?, ?) ON CONFLICT(device_hash) DO UPDATE SET claimed_ms=excluded.claimed_ms, card_no_int=excluded.card_no_int, card_type=excluded.card_type;')
        .bind(dh, Date.now(), exPhone.card_no_int, exPhone.card_type)
        .run()

      await env.DB.prepare('INSERT INTO claim_log (ts_ms, ip, reason, phone_hash_prefix, device_hash_prefix, card_no_int, card_type) VALUES (?, ?, ?, ?, ?, ?, ?);')
        .bind(Date.now(), ip, 'phone', ph.slice(0, 10), dh.slice(0, 10), exPhone.card_no_int, exPhone.card_type)
        .run()

      return json({
        ok: true,
        alreadyClaimed: true,
        reason: 'phone',
        name,
        cardTypeId: exPhone.card_type,
        rarity: HIDDEN_SET.has(exPhone.card_type) ? 'hidden' : 'regular',
        cardNo,
        cardNoDisplay: `（编号${cardNo}）`,
        image: `/assets/cards/${exPhone.card_type}.jpg`,
      })
    }

    const rl = await rateLimit(env.DB, ip)
    if (!rl.ok) return bad('Too many requests', 429, { retryAfterMs: rl.retryAfterMs })

    // Allocate global number first (with TOTAL_CAP)
    const cardNoInt = await nextCardNo(env.DB)
    if (!cardNoInt) {
      return bad('卡片已全被领取，请关注下一次活动', 410, { exhausted: true })
    }

    // LIMITED draw plan (方案B): fixed winning numbers within 1..1500
    // If >1500 => always unlimited.
    const totalLimited = await limitedRemainingTotal(env.DB)
    let cardTypeId = null

    if (cardNoInt <= 1500 && totalLimited > 0) {
      const winners = await seededWinningSet(env)
      if (winners.has(cardNoInt)) {
        cardTypeId = await pickLimitedCardType(env.DB)
      }
    }

    if (!cardTypeId) {
      cardTypeId = pickUnlimitedCardType()
    }

    // Insert both bindings (must succeed; otherwise fail the claim)
    await env.DB.prepare('INSERT INTO phone_claims (phone_hash, claimed_ms, card_no_int, card_type) VALUES (?, ?, ?, ?);')
      .bind(ph, Date.now(), cardNoInt, cardTypeId)
      .run()

    await env.DB.prepare('INSERT INTO device_claims (device_hash, claimed_ms, card_no_int, card_type) VALUES (?, ?, ?, ?) ON CONFLICT(device_hash) DO UPDATE SET claimed_ms=excluded.claimed_ms, card_no_int=excluded.card_no_int, card_type=excluded.card_type;')
      .bind(dh, Date.now(), cardNoInt, cardTypeId)
      .run()

    await env.DB.prepare('INSERT INTO claim_log (ts_ms, ip, reason, phone_hash_prefix, device_hash_prefix, card_no_int, card_type) VALUES (?, ?, ?, ?, ?, ?, ?);')
      .bind(Date.now(), ip, 'new', ph.slice(0, 10), dh.slice(0, 10), cardNoInt, cardTypeId)
      .run()

    const cardNo = `#${padNo(cardNoInt)}`
    return json({
      ok: true,
      alreadyClaimed: false,
      reason: 'new',
      name,
      cardTypeId,
      rarity: HIDDEN_SET.has(cardTypeId) ? 'hidden' : 'regular',
      cardNo,
      cardNoDisplay: `（编号${cardNo}）`,
      image: `/assets/cards/${cardTypeId}.jpg`,
    })
  } catch (e) {
    return bad('Server error', 500, { message: String(e?.message || e) })
  }
}

export async function onRequestGet() {
  return new Response('Method Not Allowed', { status: 405 })
}
