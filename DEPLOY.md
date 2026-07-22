# Deploying Dempo — free demo (Render)

This is the **Option A** free demo deploy: one Render web service serves both the
API and the web app on a single origin, using the existing Neon database. Free
tier, so the service sleeps after ~15 min idle (first request wakes it, ~50s).
File uploads are off until object storage is configured.

> For always-on India-resident production, see Option B in ARCHITECTURE.md
> (DigitalOcean Bangalore + Mumbai database).

## Architecture

```
Browser ── https://<your-app>.onrender.com ──►  Render web service (Node)
                                                   ├─ serves the built React SPA
                                                   └─ /api/* -> Express API ─► Neon (Postgres)
                                                                          └─► Clerk (auth)
```
Single origin = relative `/api` calls and Clerk session cookies just work.

## One-time setup (you do these — I can't create accounts)

1. **Push is already done** — the repo is on GitHub with `render.yaml`.
2. Create a free account at **[render.com](https://render.com)** and connect your
   **GitHub** (authorize the `Dempo-Learn` repo).
3. In Render: **New → Blueprint**, pick the `Dempo-Learn` repo. Render reads
   `render.yaml` and proposes the `dempo` web service. Click **Apply**.
4. When prompted for the **secret env vars**, paste the values from your local
   `.env`:
   - `DATABASE_URL` — your Neon connection string
   - `CLERK_PUBLISHABLE_KEY` — `pk_test_...`
   - `CLERK_SECRET_KEY` — `sk_test_...`
   - `VITE_CLERK_PUBLISHABLE_KEY` — same as the publishable key
   (`NODE_ENV`, `NODE_VERSION`, `WEB_DIST_DIR` are already set by the blueprint.)
5. Click **Create / Deploy**. First build takes ~5–10 min.
6. Open the service URL (`https://dempo-XXXX.onrender.com`). Test sign-up.

## Notes / gotchas

- **Cold starts:** free tier sleeps when idle; the first hit after a nap takes
  ~50s. Normal for a demo. (Upgrade to a paid instance to keep it always-on.)
- **Clerk domain:** the demo uses your Clerk **development** instance. If Clerk
  blocks the Render domain, add `https://<your-app>.onrender.com` to the allowed
  origins in the Clerk dashboard. For a real custom domain you'd create a Clerk
  **production** instance (Option B).
- **Database region:** the demo reuses the US Neon DB, so there's cross-region
  latency. Fine for a demo; production uses a Mumbai database.
- **File uploads:** disabled until `STORAGE_*` env vars point at a real bucket.
- **Redeploys:** `autoDeploy` is on — pushing to `main` redeploys automatically.
- **Health check:** Render pings `/api/healthz`.

## Verifying a deploy

- `https://<your-app>.onrender.com/api/healthz` should return `{"status":"ok"}`.
- The root URL should load the Dempo landing page.
- Sign up as the first user to exercise auth → API → database end-to-end.
