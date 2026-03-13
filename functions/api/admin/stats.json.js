// GET /api/admin/stats.json?key=...
// Basic anti-abuse stats.

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
  if (!env.DB) return bad('DB missing', 500)

  const meta = await env.DB.prepare('SELECT next_no FROM meta WHERE id = 1;').first()
  const nextNo = Number(meta?.next_no ?? 0)

  const totals = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM phone_claims) AS phone_claims,
      (SELECT COUNT(*) FROM device_claims) AS device_claims,
      (SELECT COUNT(*) FROM claim_log) AS claim_log
  `).first()

  const speed = await env.DB.prepare(`
    SELECT
      strftime('%Y-%m-%d %H:%M', claimed_ms/1000, 'unixepoch', 'localtime') AS minute,
      COUNT(*) AS n
    FROM phone_claims
    GROUP BY minute
    ORDER BY minute DESC
    LIMIT 60;
  `).all()

  const topIps = await env.DB.prepare(`
    SELECT ip, COUNT(*) AS n
    FROM claim_log
    WHERE reason='new'
    GROUP BY ip
    ORDER BY n DESC
    LIMIT 20;
  `).all()

  return json({
    ok: true,
    nextNo,
    issued: Math.max(0, nextNo - 1),
    totals,
    perMinute: speed.results || [],
    topIps: topIps.results || [],
    ts: Date.now(),
  })
}
