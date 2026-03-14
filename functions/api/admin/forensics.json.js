// GET /api/admin/forensics.json?key=...
// Forensics for early-batch (1..500): timing span + per-second peaks + IP aggregates.

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

  const windowStart = Number(url.searchParams.get('start') || 1)
  const windowEnd = Number(url.searchParams.get('end') || 500)

  const span = await env.DB.prepare(`
    SELECT
      MIN(claimed_ms) AS min_ms,
      MAX(claimed_ms) AS max_ms,
      (MAX(claimed_ms)-MIN(claimed_ms))/1000.0 AS span_seconds,
      COUNT(*) AS n
    FROM phone_claims
    WHERE card_no_int BETWEEN ? AND ?;
  `).bind(windowStart, windowEnd).first()

  const topSeconds = await env.DB.prepare(`
    SELECT
      strftime('%Y-%m-%d %H:%M:%S', claimed_ms/1000,'unixepoch','localtime') AS sec,
      COUNT(*) AS n
    FROM phone_claims
    WHERE card_no_int BETWEEN ? AND ?
    GROUP BY sec
    ORDER BY n DESC
    LIMIT 50;
  `).bind(windowStart, windowEnd).all()

  const perMinute = await env.DB.prepare(`
    SELECT
      strftime('%Y-%m-%d %H:%M', claimed_ms/1000,'unixepoch','localtime') AS minute,
      COUNT(*) AS n
    FROM phone_claims
    WHERE card_no_int BETWEEN ? AND ?
    GROUP BY minute
    ORDER BY minute ASC;
  `).bind(windowStart, windowEnd).all()

  // IPv4 /16 aggregation (safe in D1)
  const topIp16 = await env.DB.prepare(`
    SELECT
      (substr(ip, 1, instr(ip, '.')-1) || '.' ||
       substr(ip, instr(ip, '.')+1, instr(substr(ip, instr(ip, '.')+1), '.')-1)
      ) AS ip_16,
      COUNT(*) AS n
    FROM claim_log
    WHERE reason='new' AND ip LIKE '%.%.%.%'
      AND card_no_int BETWEEN ? AND ?
    GROUP BY ip_16
    ORDER BY n DESC
    LIMIT 50;
  `).bind(windowStart, windowEnd).all()

  // device hash prefix concentration
  const topDevPrefix = await env.DB.prepare(`
    SELECT device_hash_prefix, COUNT(*) AS n
    FROM claim_log
    WHERE reason='new'
      AND card_no_int BETWEEN ? AND ?
    GROUP BY device_hash_prefix
    ORDER BY n DESC
    LIMIT 50;
  `).bind(windowStart, windowEnd).all()

  return json({
    ok: true,
    window: { start: windowStart, end: windowEnd },
    span: {
      n: Number(span?.n ?? 0),
      first_time: span?.min_ms ? new Date(Number(span.min_ms)).toISOString() : null,
      last_time: span?.max_ms ? new Date(Number(span.max_ms)).toISOString() : null,
      span_seconds: Number(span?.span_seconds ?? 0),
    },
    topSeconds: topSeconds.results || [],
    perMinute: perMinute.results || [],
    topIp16: topIp16.results || [],
    topDevPrefix: topDevPrefix.results || [],
    ts: Date.now(),
  })
}
