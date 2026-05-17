# TeraLink — TeraBox Player & Downloader

A premium dark-glassmorphism website. Paste a TeraBox link, stream or download instantly.

**Stack:** Static HTML/CSS/JS frontend + one serverless function. Built to deploy on **Vercel** in under 5 minutes, free, with a custom domain.

---

## 🚨 Before anything else

**Rotate your xapiverse API key.** It was posted in chat and is compromised. Log into xapiverse.com, regenerate it, and use the new one when setting the env var below.

---

## File structure

```
teralink/
├── index.html          # The whole frontend (single file)
├── api/
│   └── process.js      # Serverless function — proxies xapiverse
├── package.json
├── vercel.json         # Vercel config
├── .env.example        # Template for local dev only
└── .gitignore
```

---

## 🚀 Deploy to Vercel (the easy way — 5 minutes)

You have two options. Pick whichever is more comfortable.

### Option A — Web dashboard (no terminal needed)

1. **Sign up** at [vercel.com](https://vercel.com) (free, sign in with GitHub/Google/email).
2. **Make a GitHub repo** with this code:
   - Go to [github.com/new](https://github.com/new), name it `teralink` (or whatever)
   - Click "uploading an existing file" and drag in everything except `node_modules` and `.env`
   - Commit
3. **Import to Vercel:**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Pick your `teralink` repo, click Import
   - **Before clicking Deploy**, expand "Environment Variables" and add:
     - Name: `TERABOX_API_KEY`
     - Value: your fresh xapiverse key
   - Click **Deploy**
4. ~30 seconds later you'll get a live URL like `teralink-xyz.vercel.app`. Done.

### Option B — Vercel CLI (faster if you have a terminal)

```bash
# 1. Install the CLI (one time)
npm install -g vercel

# 2. From inside this folder, just run:
vercel

# (Follow prompts — log in, link to a new project, accept defaults)

# 3. Add your API key as a production environment variable:
vercel env add TERABOX_API_KEY production
# (paste your fresh key when prompted)

# 4. Deploy to production:
vercel --prod
```

You'll get a live URL. That's it.

---

## 🌐 Add your own domain

Once deployed:

1. In the Vercel dashboard → your project → **Settings** → **Domains**
2. Add your domain (e.g. `teralink.com` or `terastream.in`)
3. Vercel shows you what DNS records to add at your registrar (GoDaddy, Namecheap, Hostinger, etc.)
4. Add them → wait 5–30 minutes → HTTPS auto-configured. Live.

---

## 🧪 Test locally first (optional)

If you want to try it on your own computer before deploying:

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Copy the env template and add your key
cp .env.example .env

# 3. Edit .env and paste your fresh key:
#    TERABOX_API_KEY=sk_your_key_here

# 4. Run the dev server
vercel dev
```

Open `http://localhost:3000` to test.

---

## How it works under the hood

1. User opens your site → `index.html` loads (static, fast).
2. They paste a TeraBox link and click Go.
3. Frontend POSTs to `/api/process` (your serverless function).
4. Function adds the `xAPIverse-Key` header (from Vercel env var) and calls xapiverse.
5. Function normalizes the response and sends it back to the frontend.
6. Frontend renders the video, quality chips, play/download buttons.
7. Play → loads the HLS stream via hls.js, autoplays.
8. Download → downloads `normal_dlink` directly.

**The API key never reaches the browser.** Only your Vercel function sees it.

---

## Customizing

- **Change the site name** (`TeraLink` → your name): in `index.html`, find/replace `TeraLink` (4 places).
- **Change colors**: at the top of the `<style>` block in `index.html`, edit the `:root[data-theme="dark"]` and `:root[data-theme="light"]` CSS variables.
- **Change fonts**: the `<head>` loads `Instrument Serif` + `Sora` from Google Fonts. Swap the URL and update the `font-family` declarations.
- **Add a logo**: replace the inline SVG inside `.logo-mark` in the nav and footer.
- **Footer disclaimer & legal links**: edit at the bottom of `index.html` — set real DMCA/contact/privacy URLs before going live.

---

## Things to add later

- Subtitle toggle in the player (the API returns `subtitleUrl` — wire to `<track>` element)
- Multi-file picker UI when a link has > 1 file (data is already in `allFiles[]`)
- Rate limiting on `/api/process` so randoms can't burn your API quota — Vercel has an `@upstash/ratelimit` integration that takes 5 minutes
- Analytics — try Plausible or Vercel Analytics (privacy-friendly, both free tier)
- Sitemap.xml + per-section meta tags for SEO

---

## Legal

TeraLink is a thin client over xapiverse's API. You're responsible for:
- Complying with TeraBox's Terms of Service in your jurisdiction
- Honoring DMCA / copyright takedown requests promptly
- Posting a real Privacy Policy and Terms of Use (footer has placeholder links)
- Your country's regulations for online services

---

## Troubleshooting

**"Failed to fetch" when you click Go**
→ The serverless function isn't responding. Two common causes:
  - You're testing locally without running `vercel dev` — open the deployed URL instead.
  - On Vercel: env var `TERABOX_API_KEY` isn't set. Project → Settings → Environment Variables.

**"Server is missing TERABOX_API_KEY"**
→ Add the env var in Vercel dashboard, then **redeploy** (Deployments → ⋯ → Redeploy). New env vars don't apply to existing deployments.

**"Upstream API returned 401"**
→ Key is invalid or revoked. Regenerate on xapiverse.com, update the Vercel env var, redeploy.

**"No playable files found for this link"**
→ Link is dead, private, or not a TeraBox URL.

**Video plays but no audio** — source file has no audio track. Not a bug.

**Autoplay blocked** — browser policy. User just clicks the in-player play button. Not a bug.
