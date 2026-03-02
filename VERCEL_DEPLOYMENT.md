# Deploy to Vercel (stacktapp.com)

This guide deploys the **inventory app** (Slabs + Raw Cards tables) — the **Vite + React frontend** in `frontend/`. It connects to Supabase from the browser. Follow these steps to deploy it on Vercel and connect your Cloudflare domain **stacktapp.com**.

---

## 1. Push your code to Git

Vercel deploys from a Git repository (GitHub, GitLab, or Bitbucket).

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

If the repo is already on GitHub/GitLab/Bitbucket, skip this step.

---

## 2. Import the project on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (or create an account).
2. Click **Add New…** → **Project**.
3. **Import** your Git repository (`inventory-logger`).
4. **Important:** Set the **Root Directory**:
   - Click **Edit** next to “Root Directory”.
   - Enter: `frontend`
   - Confirm so Vercel builds the Vite app from that folder.
5. **Framework Preset:** Vercel should auto-detect **Vite**. If not, set it to Vite (Build: `npm run build`, Output: `dist`).
6. Add **Environment Variables** (required for Supabase):
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon/public key  
   Optional (only if you use Slab Intake and run the backend elsewhere):
   - `VITE_API_URL` — e.g. `https://your-backend.example.com`
   Add them in the import wizard or under **Settings → Environment Variables**.
7. Click **Deploy**.

After the first deploy, you’ll get a URL like `your-project.vercel.app`.

---

## 3. Add your domain (stacktapp.com) in Vercel

1. In the Vercel dashboard, open your project.
2. Go to **Settings** → **Domains**.
3. Click **Add** and enter:
   - `stacktapp.com` (apex)
   - `www.stacktapp.com` (optional; Vercel often suggests it).
4. Vercel will show the DNS records you need. Keep this tab open for the next step.

---

## 4. Configure DNS in Cloudflare

In [Cloudflare Dashboard](https://dash.cloudflare.com) → **stacktapp.com** → **DNS** → **Records**:

### Option A – Use subdomain (e.g. `app.stacktapp.com`) – simplest

| Type  | Name | Content / Target              | Proxy status   |
|-------|------|-------------------------------|----------------|
| CNAME | app  | `cname.vercel-dns.com`        | DNS only (grey cloud) |

In Vercel **Domains**, add `app.stacktapp.com` instead of (or in addition to) `stacktapp.com`. Use the exact CNAME target Vercel shows if it’s different.

### Option B – Apex domain (stacktapp.com)

1. In Vercel **Domains**, add `stacktapp.com` (and optionally `www.stacktapp.com`).
2. In Cloudflare, add the records Vercel shows, for example:

**For apex `stacktapp.com`:**

| Type | Name | Content / Target     | Proxy status   |
|------|------|----------------------|----------------|
| A    | @    | `76.76.21.21`        | DNS only       |

**For `www.stacktapp.com`:**

| Type  | Name | Content / Target       | Proxy status   |
|-------|------|------------------------|----------------|
| CNAME | www  | `cname.vercel-dns.com`| DNS only       |

Use the **exact** A and CNAME values from your project’s **Vercel → Settings → Domains** page; they can be project-specific.

Important: set the proxy to **DNS only** (grey cloud) for the record that points to Vercel. If the cloud is orange, Cloudflare proxies traffic and that can conflict with Vercel’s SSL and behavior.

---

## 5. SSL and verification

- **Vercel** will issue and manage SSL for your domain once DNS is correct.
- After you save the DNS records in Cloudflare, it can take from a few minutes up to 48 hours for DNS to propagate. Vercel will show the domain as **Valid** when it’s ready.

---

## 6. Optional: env vars and redeploys

- **Environment variables:** **Settings** → **Environment Variables**. Add production (and preview) values as needed.
- Every push to your default branch will trigger a new deployment. You can also trigger deploys from the **Deployments** tab.

---

## Summary

| Step | Where        | Action |
|------|--------------|--------|
| 1    | Git          | Push repo to GitHub/GitLab/Bitbucket |
| 2    | Vercel       | Import project, set **Root Directory** to `frontend`, add VITE_SUPABASE_* env vars, deploy |
| 3    | Vercel       | **Settings → Domains** → add `stacktapp.com` (and/or `www` or `app`) |
| 4    | Cloudflare   | Add A record for apex and/or CNAME for www/app, **DNS only** |
| 5    | Wait         | Let DNS propagate; Vercel will show domain as Valid when ready |

If you want to use **stacktapp.com** as the main URL, use Option B and add both the apex and `www` in Vercel, then set the A and CNAME records in Cloudflare as shown.
