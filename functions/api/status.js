// GET /api/status?key=...
// Uses env.ADMIN_KEY as shared read-only key.

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    ...init,
  })
}

function bad(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, { status })
}

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)

  const key = url.searchParams.get('key') || request.headers.get('x-admin-key') || ''
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return bad('Unauthorized', 401)
  if (!env.DB) return bad('Server not configured (DB binding missing)', 500)

  try {
    const meta = await env.DB.prepare('SELECT next_no FROM meta WHERE id = 1;').first()
    const nextNo = meta?.next_no ?? null
    const claimed = (nextNo != null) ? Math.max(0, Number(nextNo) - 1) : null
    const cap = 500

    const limited = await env.DB.prepare('SELECT card_type, remaining FROM limited ORDER BY card_type;').all()
    const limitedRows = limited?.results || []
    const limitedRemaining = limitedRows.reduce((s, r) => s + (r.remaining || 0), 0)

    const nPhone = await env.DB.prepare('SELECT COUNT(*) AS n FROM phone_claims;').first()
    const nDevice = await env.DB.prepare('SELECT COUNT(*) AS n FROM device_claims;').first()

    return json({
      ok: true,
      cap,
      nextNo,
      claimed,
      remaining: (claimed == null) ? null : Math.max(0, cap - claimed),
      limited: limitedRows,
      limitedRemaining,
      phoneClaims: Number(nPhone?.n ?? 0),
      deviceClaims: Number(nDevice?.n ?? 0),
      ts: Date.now(),
    })
  } catch (e) {
    return bad('Server error', 500, { message: String(e?.message || e) })
  }
}

export async function onRequestPost() {
  return new Response('Method Not Allowed', { status: 405 })
}
