// GET /api/admin/lookup?phone=...
// Requires env.ADMIN_KEY

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    ...init,
  })
}

function bad(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, { status })
}

function normalizePhone(s) {
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

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)

  const key = request.headers.get('x-admin-key') || url.searchParams.get('key') || ''
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return bad('Unauthorized', 401)

  if (!env.DB) return bad('Server not configured (DB binding missing)', 500)

  const phone = normalizePhone(url.searchParams.get('phone'))
  if (!/^1\d{10}$/.test(phone)) return bad('Invalid phone')

  try {
    const ph = await phoneHash(env, phone)
    const phoneClaim = await env.DB.prepare('SELECT phone_hash, claimed_ms, card_no_int, card_type FROM phone_claims WHERE phone_hash = ?;').bind(ph).first()

    return json({
      ok: true,
      phone,
      phone_hash_prefix: ph.slice(0, 10),
      phoneClaim: phoneClaim || null,
    })
  } catch (e) {
    return bad('Server error', 500, { message: String(e?.message || e) })
  }
}
