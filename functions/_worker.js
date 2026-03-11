// Cloudflare Pages Functions (Workers runtime) entry.
// Provides a tiny backend to enforce:
// 1) global sequential cardNo
// 2) limited card deck distribution (no oversell)
//
// Routes:
// POST /api/claim  { name, cfTurnstileToken }
//
// Anti-abuse (方案1):
// - Cloudflare Turnstile verification (requires env.TURNSTILE_SECRET)
// - Rate limit per IP (handled inside Durable Object)

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
    ...init,
  })
}

function bad(message, code = 400) {
  return json({ ok: false, error: message }, { status: code })
}

function normalizeName(s) {
  return (s ?? '').toString().trim().slice(0, 16)
}

function padNo(n) {
  const s = String(n)
  return s.length >= 4 ? s : '0'.repeat(4 - s.length) + s
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname === '/api/claim') {
      if (request.method !== 'POST') return bad('Method not allowed', 405)

      let body
      try {
        body = await request.json()
      } catch {
        return bad('Invalid JSON')
      }

      const name = normalizeName(body?.name)
      if (!name) return bad('Name required')

      // Turnstile verify
      const token = (body?.cfTurnstileToken ?? '').toString()
      if (!token) return bad('Turnstile token required')
      if (!env.TURNSTILE_SECRET) return bad('Server not configured (TURNSTILE_SECRET missing)', 500)

      const ip = request.headers.get('CF-Connecting-IP') || ''
      const form = new FormData()
      form.set('secret', env.TURNSTILE_SECRET)
      form.set('response', token)
      if (ip) form.set('remoteip', ip)

      const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
      })
      const vr = await v.json()
      if (!vr?.success) return bad('Human verification failed', 403)

      const id = env.CLAIM_DO.idFromName('global')
      const stub = env.CLAIM_DO.get(id)
      const r = await stub.fetch('https://do/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-ip': ip },
        body: JSON.stringify({ name }),
      })
      const data = await r.json()
      return json(data, { status: r.status })
    }

    // fallthrough to static assets
    return env.ASSETS.fetch(request)
  },
}

export class ClaimDO {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname !== '/claim' || request.method !== 'POST') {
      return json({ ok: false, error: 'Not found' }, { status: 404 })
    }

    const { name } = await request.json()

    // Rate limit per IP: 1 claim / 30 seconds
    const ip = request.headers.get('x-client-ip') || 'unknown'
    const ipKey = `ip:${ip}`
    const now = Date.now()

    // Config (from PDF): limited totals = 12 cards
    const unlimited = [1, 2, 4, 5, 6, 7, 8]
    const limitedDeckRaw = [
      3, // 重启卡 x1
      9, 9, 9, 9, 9, // 见己卡 x5
      10, 10, 10, // 出发卡 x3
      11, // 特签 x1
      12, 12, // 25号底片俱乐部 x2
    ]

    const result = await this.state.storage.transaction(async (tx) => {
      const last = (await tx.get(ipKey)) ?? 0
      if (now - last < 30_000) {
        return { rateLimited: true, retryAfterMs: 30_000 - (now - last) }
      }
      await tx.put(ipKey, now)

      let nextNo = (await tx.get('nextNo')) ?? 1
      let deck = (await tx.get('limitedDeck'))
      let idx = (await tx.get('limitedIdx')) ?? 0

      if (!deck) {
        deck = shuffle(limitedDeckRaw)
        idx = 0
      }

      const cardNo = nextNo
      nextNo = nextNo + 1

      let cardTypeId
      if (idx < deck.length) {
        cardTypeId = deck[idx]
        idx += 1
      } else {
        cardTypeId = unlimited[Math.floor(Math.random() * unlimited.length)]
      }

      await tx.put('nextNo', nextNo)
      await tx.put('limitedDeck', deck)
      await tx.put('limitedIdx', idx)

      return { cardTypeId, cardNo }
    })

    if (result.rateLimited) {
      return json({ ok: false, error: 'Too many requests', retryAfterMs: result.retryAfterMs }, { status: 429 })
    }

    const image = `/assets/cards/${result.cardTypeId}.jpg`

    return json({
      ok: true,
      name,
      cardTypeId: result.cardTypeId,
      cardNo: `#${padNo(result.cardNo)}`,
      image,
    })
  }
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
