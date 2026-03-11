// Pages Functions route: POST /api/sms/send
// Aliyun SMS (dysmsapi) signer (RPC style)
// Required env:
// - ALIYUN_ACCESS_KEY_ID
// - ALIYUN_ACCESS_KEY_SECRET
// - ALIYUN_SMS_SIGN_NAME
// - ALIYUN_SMS_TEMPLATE_CODE
// Optional:
// - SMS_CODE_SALT

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

function randomCode6() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function sha256Hex(s) {
  const enc = new TextEncoder().encode(s)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/\!/g, '%21')
    .replace(/\'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
}

function canonicalQuery(params) {
  const keys = Object.keys(params).sort()
  return keys.map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&')
}

async function hmacSha1Base64(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
  // btoa
  let bin = ''
  const bytes = new Uint8Array(sig)
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function iso8601() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function nonce() {
  return crypto.randomUUID()
}

async function sendAliyunSMS(env, phone, code) {
  const accessKeyId = env.ALIYUN_ACCESS_KEY_ID
  const accessKeySecret = env.ALIYUN_ACCESS_KEY_SECRET
  const signName = env.ALIYUN_SMS_SIGN_NAME
  const templateCode = env.ALIYUN_SMS_TEMPLATE_CODE

  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    throw new Error('Server not configured for Aliyun SMS')
  }

  const params = {
    AccessKeyId: accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: phone,
    SignName: signName,
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify({ code }),
    RegionId: 'cn-hangzhou',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: nonce(),
    SignatureVersion: '1.0',
    Timestamp: iso8601(),
    Version: '2017-05-25',
  }

  const qs = canonicalQuery(params)
  const stringToSign = `GET&%2F&${percentEncode(qs)}`
  const signature = await hmacSha1Base64(accessKeySecret + '&', stringToSign)

  const url = `https://dysmsapi.aliyuncs.com/?Signature=${percentEncode(signature)}&${qs}`
  const r = await fetch(url, { method: 'GET' })
  const data = await r.json().catch(() => null)
  if (!data) throw new Error('Aliyun SMS response invalid')
  if (data.Code !== 'OK') {
    throw new Error(`Aliyun SMS error: ${data.Code || 'Unknown'} ${data.Message || ''}`.trim())
  }
  return data
}

async function ensureSchema(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS sms_codes (phone TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_ms INTEGER NOT NULL, last_send_ms INTEGER NOT NULL);')
}

export async function onRequestPost(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const isTest = url.searchParams.get('test') === '1'

  if (!env.DB) return bad('Server not configured (DB binding missing)', 500)

  let body
  try { body = await request.json() } catch { return bad('Invalid JSON') }

  const phone = normalizePhone(body?.phone)
  if (!/^1\d{10}$/.test(phone)) return bad('Invalid phone')

  try {
    await ensureSchema(env.DB)

    const now = Date.now()
    const row = await env.DB.prepare('SELECT last_send_ms FROM sms_codes WHERE phone = ?;').bind(phone).first()
    const last = row?.last_send_ms ?? 0
    if (now - last < 60_000 && !isTest) {
      return bad('Too many requests', 429, { retryAfterMs: 60_000 - (now - last) })
    }

    const code = randomCode6()
    const salt = (env.SMS_CODE_SALT || 'salt').toString()
    const codeHash = await sha256Hex(`${phone}|${code}|${salt}`)
    const expires = now + 10 * 60_000

    await env.DB.prepare('INSERT INTO sms_codes (phone, code_hash, expires_ms, last_send_ms) VALUES (?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash, expires_ms=excluded.expires_ms, last_send_ms=excluded.last_send_ms;')
      .bind(phone, codeHash, expires, now)
      .run()

    if (!isTest) {
      await sendAliyunSMS(env, phone, code)
    }

    return json({ ok: true, test: isTest })
  } catch (e) {
    return bad('Server error', 500, { message: String(e?.message || e) })
  }
}

export async function onRequestGet() {
  return new Response('Method Not Allowed', { status: 405 })
}
