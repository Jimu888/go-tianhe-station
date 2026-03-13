// GET /api/admin/export_hashes.csv?key=...
// Export phone_hash + claimed_at + card_type + internal_no + public_no
// Requires env.ADMIN_KEY

function bad(message, status = 400) {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

function csvEscape(v) {
  const s = (v ?? '').toString()
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)

  const key = url.searchParams.get('key') || request.headers.get('x-admin-key') || ''
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return bad('Unauthorized', 401)
  if (!env.DB) return bad('DB missing', 500)

  const rows = await env.DB.prepare(`
    SELECT
      datetime(pc.claimed_ms/1000, 'unixepoch', 'localtime') AS claimed_at,
      pc.phone_hash,
      pc.card_type AS card_type,
      pc.card_no_int AS internal_no,
      pm.public_no AS public_no
    FROM phone_claims pc
    LEFT JOIN public_map pm ON pm.card_no_int = pc.card_no_int
    ORDER BY pc.card_no_int ASC;
  `).all()

  const out = []
  out.push(['claimed_at','phone_hash','card_type','internal_no','public_no'].join(','))
  for (const r of (rows.results || [])) {
    out.push([
      csvEscape(r.claimed_at),
      csvEscape(r.phone_hash),
      csvEscape(r.card_type),
      csvEscape(r.internal_no),
      csvEscape(r.public_no),
    ].join(','))
  }

  return new Response(out.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tianhe_phone_hashes.csv"',
    },
  })
}
