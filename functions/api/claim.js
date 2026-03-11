export async function onRequestPost(context) {
  const { request, env } = context

  const json = (data, init = {}) =>
    new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
      ...init,
    })

  const bad = (message, status = 400, extra = {}) => json({ ok: false, error: message, ...extra }, { status })

  let body
  try {
    body = await request.json()
  } catch {
    return bad('Invalid JSON')
  }

  const name = (body?.name ?? '').toString().trim().slice(0, 16)
  if (!name) return bad('Name required')

  const token = (body?.cfTurnstileToken ?? '').toString()
  if (!token) return bad('Turnstile token required')
  if (!env.TURNSTILE_SECRET) return bad('Server not configured (TURNSTILE_SECRET missing)', 500)

  // Turnstile verify
  const ip = request.headers.get('CF-Connecting-IP') || ''
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

  // Durable Object claim
  if (!env.CLAIM_DO) {
    return bad('Server not configured (CLAIM_DO binding missing)', 500)
  }

  const id = env.CLAIM_DO.idFromName('global')
  const stub = env.CLAIM_DO.get(id)

  const r = await stub.fetch('https://do/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-ip': ip },
    body: JSON.stringify({ name }),
  })

  const text = await r.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return bad('Bad backend response', 500, { raw: text.slice(0, 200) })
  }

  return json(data, { status: r.status })
}

export async function onRequestGet() {
  return new Response('Method Not Allowed', { status: 405 })
}
