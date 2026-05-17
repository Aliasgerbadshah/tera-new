/**
 * TeraLink — Vercel serverless function
 * ────────────────────────────────────────────────────────────────
 * Lives at /api/process when deployed to Vercel.
 * Holds the xapiverse API key (stored in Vercel's environment variables)
 * and forwards the request, normalizing the response for the frontend.
 *
 * The key NEVER reaches the browser.
 */

const API_URL = 'https://xapiverse.com/api/terabox';

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

export default async function handler(req, res) {
  // CORS — allow the same-origin frontend (Vercel handles this by default,
  // but we set headers just in case you host the frontend elsewhere later).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A "url" field is required.' });
  }

  const apiKey = process.env.TERABOX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server is missing TERABOX_API_KEY. Add it in Vercel dashboard → Settings → Environment Variables.'
    });
  }

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
      return res.status(upstream.status).json({
        error: `Upstream API returned ${upstream.status}`,
        details: text.slice(0, 500)
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
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
