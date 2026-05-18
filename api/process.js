/**
 * TeraLink — Vercel serverless function (HARDENED)
 * ────────────────────────────────────────────────────────────────
 * Lives at /api/process. Holds the xapiverse API key and forwards
 * the request, normalizing the response for the frontend.
 *
 * The key NEVER reaches the browser.
 *
 * Security layers (in order, top-to-bottom):
 *   1. Method allowlist          — only POST + preflight OPTIONS
 *   2. Origin / Referer check    — block requests from other domains
 *   3. Rate limiting             — ~15 req/min per IP
 *   4. URL validation            — only real TeraBox-family URLs accepted
 *
 * To add a new allowed domain, edit ALLOWED_ORIGINS below.
 */

const API_URL = 'https://xapiverse.com/api/terabox';

/* ============================================================
   ⚙ CONFIGURATION — change these for your setup
============================================================ */

// Only requests coming from these origins can use the API.
// Add more if you embed the tool on multiple sites.
const ALLOWED_ORIGINS = [
  'https://terabox.rankadz.com',
  'https://rankadz.com',
  'https://www.rankadz.com',
  // Keep the default Vercel preview URL for debugging:
  'https://tera-new.vercel.app'
];

// Rate limit: how many requests one IP can make per window.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;   // 1 minute
const RATE_LIMIT_MAX = 15;                // 15 requests / minute / IP

// Valid TeraBox-family domains. xapiverse will reject others anyway,
// but we filter upstream to avoid wasting our API quota.
const TERABOX_DOMAINS = [
  'terabox.com', '1024terabox.com', 'teraboxapp.com', 'terabox.app',
  'nephobox.com', 'momerybox.com', 'tibibox.com', 'mirrobox.com',
  '4funbox.com', 'teraboxlink.com', 'freeterabox.com', 'teraboxshare.com'
];

/* ============================================================
   📊 RATE LIMIT STATE (in-memory; resets on cold start)
============================================================ */
const rateLimitStore = new Map();

function rateLimitCheck(ip) {
  const now = Date.now();
  let record = rateLimitStore.get(ip);

  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  record.count++;
  rateLimitStore.set(ip, record);

  // Periodic cleanup so the Map doesn't grow forever
  if (rateLimitStore.size > 5000) {
    for (const [k, v] of rateLimitStore) {
      if (now > v.resetAt) rateLimitStore.delete(k);
    }
  }
  return record.count <= RATE_LIMIT_MAX;
}

/* ============================================================
   🔒 ORIGIN CHECK
============================================================ */
function isOriginAllowed(origin) {
  if (!origin) return false;
  try {
    const o = new URL(origin).origin;
    return ALLOWED_ORIGINS.includes(o);
  } catch {
    return false;
  }
}

/* ============================================================
   ✅ URL VALIDATION
============================================================ */
function isValidTeraBoxUrl(s) {
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return TERABOX_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/* ============================================================
   🧱 NORMALIZE xapiverse RESPONSE → frontend shape
============================================================ */
const QUALITY_RANK = { '1080p': 4, '720p': 3, '480p': 2, '360p': 1 };

function normalizeFile(file) {
  const sizeBytes = Number(file.size) || 0;
  const sizeMB = Math.round((sizeBytes / (1024 * 1024)) * 100) / 100;

  const qualities = Object.entries(file.fast_stream_url || {})
    .map(([label, streamUrl]) => ({ label, streamUrl }))
    .sort((a, b) => (QUALITY_RANK[b.label] || 0) - (QUALITY_RANK[a.label] || 0));

  return {
    title: file.name || 'Untitled',
    duration: file.duration || '',
    sizeMB,
    sizeFormatted: file.size_formatted || `${sizeMB} MB`,
    thumbnail: file.thumbnail || null,
    type: file.type || 'video',
    originalQuality: file.quality || null,
    qualities,
    defaultStreamUrl: qualities[0]?.streamUrl || null,
    downloadUrl: file.normal_dlink || null,
    subtitleUrl: file.subtitle_url || null
  };
}

/* ============================================================
   🚪 MAIN HANDLER
============================================================ */
export default async function handler(req, res) {
  // ── Layer 1: method allowlist + CORS preflight ───────────
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  // ── Layer 2: origin / referer check ──────────────────────
  // Some requests have Origin (CORS), some only Referer (same-origin POSTs).
  // We accept either, as long as one matches our allowlist.
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';

  let originToCheck = '';
  if (origin && isOriginAllowed(origin)) originToCheck = origin;
  else if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (isOriginAllowed(refOrigin)) originToCheck = refOrigin;
    } catch {/* ignore */}
  }

  if (originToCheck) {
    res.setHeader('Access-Control-Allow-Origin', originToCheck);
  }

  // Preflight requests pass through without further checks
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Block requests not from an allowed origin
  if (!originToCheck) {
    return res.status(403).json({
      error: 'Forbidden. Requests must come from an authorized domain.'
    });
  }

  // ── Layer 3: rate limiting ───────────────────────────────
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!rateLimitCheck(ip)) {
    res.setHeader('Retry-After', Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
    return res.status(429).json({
      error: 'Too many requests. Please wait a minute and try again.'
    });
  }

  // ── Layer 4: input validation ────────────────────────────
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A "url" field is required.' });
  }
  if (url.length > 500) {
    return res.status(400).json({ error: 'URL is too long.' });
  }
  if (!isValidTeraBoxUrl(url)) {
    return res.status(400).json({
      error: 'Invalid link. Please paste a real TeraBox URL.'
    });
  }

  // ── Server config check ──────────────────────────────────
  const apiKey = process.env.TERABOX_API_KEY;
  if (!apiKey) {
    console.error('Missing TERABOX_API_KEY env var');
    return res.status(500).json({
      error: 'Server misconfiguration. Please contact the site owner.'
    });
  }

  // ── Forward to xapiverse ─────────────────────────────────
  try {
    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xAPIverse-Key': apiKey
      },
      body: JSON.stringify({ url })
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      console.error(`Upstream ${upstream.status}:`, text.slice(0, 200));
      // Don't leak upstream error details to the client
      return res.status(502).json({
        error: 'The video service is temporarily unavailable. Please try again shortly.'
      });
    }

    const data = await upstream.json();

    if (data.status !== 'success' || !Array.isArray(data.list) || data.list.length === 0) {
      return res.status(404).json({ error: 'No playable files found for this link.' });
    }

    const primary = normalizeFile(data.list[0]);
    const allFiles = data.list.map(normalizeFile);

    return res.status(200).json({
      ...primary,
      totalFiles: data.total_files || data.list.length,
      allFiles,
      folderZipUrl: data.folder_zip_dlink || null
    });
  } catch (err) {
    console.error('process error:', err);
    return res.status(500).json({
      error: 'Something went wrong. Please try again.'
    });
  }
}
