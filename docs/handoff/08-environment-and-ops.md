# 08 — Environment & Ops

## Required environment variables

### On the **current** (Replit) stack

| Variable | Used by | What it is |
| -------- | ------- | ---------- |
| `DATABASE_URL` | `server/db.ts`, `drizzle.config.ts` | Postgres connection string |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | `server/openai.ts` | Bearer token for Replit's OpenAI-compatible gateway |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | `server/openai.ts` | Gateway base URL, e.g. `https://.../v1` |
| `SESSION_SECRET` | `server/replit_integrations/auth/replitAuth.ts` | Express-session secret |
| `REPLIT_DOMAINS` | Replit Auth wrapper | Comma-separated allowed callback hosts |
| `REPL_ID`, `ISSUER_URL`, etc. | Replit Auth wrapper | OIDC client config injected by Replit |
| `PUBLIC_OBJECT_SEARCH_PATHS` | `server/replit_integrations/object_storage/*` | Replit Object Storage public search paths |
| `PRIVATE_OBJECT_DIR` | `server/replit_integrations/object_storage/*` | Replit Object Storage private dir |
| `PORT` | `server/index.ts` | Port to listen on (default 5000) |
| `NODE_ENV` | `server/index.ts` | `development` switches to Vite middleware; `production` serves built static |

### On the **Antigravity** target

| Variable | Used by | What it is |
| -------- | ------- | ---------- |
| `DATABASE_URL` | Drizzle | Same as today |
| `OPENAI_API_KEY` | `lib/openai.ts` | OpenAI API key |
| `OPENAI_BASE_URL` *(optional)* | `lib/openai.ts` | Set only if you route through your own proxy |
| `NEXTAUTH_SECRET` | NextAuth | Signing secret for sessions / JWTs |
| `NEXTAUTH_URL` | NextAuth | Canonical public URL of the app |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | NextAuth Google provider | Your Google OAuth credentials |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | `lib/storage.ts` | If using S3/R2 |
| *(or)* `GCS_BUCKET` / `GOOGLE_APPLICATION_CREDENTIALS` | `lib/storage.ts` | If using GCS |
| `PORT` | Next.js | Default 3000 |

You can drop entirely:

- `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
- `REPL_ID`, `REPLIT_DOMAINS`, `ISSUER_URL`, anything else `REPLIT_*`
- `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` (replaced by your bucket config)

## Files / directories NOT to carry over

| Item | Why drop it |
| ---- | ----------- |
| `server/vite.ts` | Vite middleware for Express. Next.js handles dev/HMR. |
| `server/static.ts` | Static asset serving in prod. Next.js handles this. |
| `server/index.ts` | Express bootstrap. Replaced by Next's runtime. Port routes to `app/api/.../route.ts`. |
| `server/replit_integrations/` (entire tree) | Replit Auth + Replit Object Storage. Replace with NextAuth + your bucket SDK. Preserve the **logic** in `auth/storage.ts` (first-admin bootstrap, username sentinel, anonymise-on-delete) in your new `lib/auth-storage.ts`. |
| `script/build.ts` | esbuild bundling for the Express server. `next build` replaces it. |
| `vite.config.ts` | Replaced by `next.config.ts`. |
| `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, `@replit/vite-plugin-runtime-error-modal` (devDependencies in `package.json`) | Replit-workspace-only DX plugins. |
| `client/index.html` | Next provides its own document. Move meta tags to `app/layout.tsx`. |
| The `extractFramesFromVideo` function in `server/video.ts` and `server/video-analysis/frames.ts` | Legacy uniform-fps sampler. Not used by any route. The smart-frame path is the only production path. |
| `POST /api/ai/test-multi-image` route (`server/routes.ts:743`) | Internal scratch endpoint. |
| `.replit`, `replit.nix`, `.replit.local`, the `Start application` workflow definition | Replit-specific deployment metadata. |

## Native binaries required at runtime

The video pipeline shells out to:

- `ffmpeg`
- `ffprobe`

Both must be on `PATH` in **every environment** that handles video uploads: local dev, CI tests, and prod. Quick install matrix:

| Environment | How |
| ----------- | --- |
| Debian/Ubuntu container | `apt-get update && apt-get install -y ffmpeg` |
| Alpine container | `apk add --no-cache ffmpeg` |
| macOS dev | `brew install ffmpeg` |
| Vercel | Use the Node runtime, not Edge; bundle a static `ffmpeg` binary in `node_modules` via something like `@ffmpeg-installer/ffmpeg` **OR** push the video pipeline to a separate Fly/Render service. Vercel functions have a 50 MB function-size cap and a default 10–60 s execution limit; for long videos consider streaming uploads + offloading. |
| Fly/Render/Railway/own VM | Standard apt install; no special config. |

## Build & run

### Current

```bash
npm install
npm run dev              # tsx server/index.ts, with Vite middleware
npm run build            # script/build.ts → dist/index.cjs + dist/public/
npm run start            # node dist/index.cjs in production
npm run check            # tsc
npm run db:push          # drizzle-kit push (sync schema → DB)
```

### Antigravity target

```bash
npm install
npm run dev              # next dev
npm run build            # next build
npm run start            # next start
npm run typecheck        # tsc
npm run db:push          # drizzle-kit push (unchanged)
```

Drizzle Kit is unchanged. `drizzle.config.ts` already does the right thing for the new stack.

## Deployment topology

Minimum viable production:

1. **Postgres** — any managed Postgres (Neon, Supabase, RDS, Cloud SQL).
2. **App runtime** — Vercel (with the caveat above), Fly, Render, Railway, or a single VM running `next start` behind a reverse proxy. Sticky sessions are **not** required.
3. **Object storage bucket** — S3/R2/GCS. The app uploads compressed MP4s and reads them back via a proxy. Public-read on the bucket is fine; the app currently proxies through `/api/videos/:caseId/stream` to support range requests and to hide bucket URLs, but you can switch to signed URLs to save egress.
4. **OpenAI API key** — billed directly.

## Seeding

After first deploy: `curl -X POST https://your-app/api/seed`. The endpoint is idempotent — it no-ops if any cases already exist. Seed data lives at `server/seed-data.json` and should ship with the rebuild unchanged (or be replaced with a curated set for the new instance).

## Observability

The current app does plain `console.log` (formatted via the `log()` helper in `server/index.ts`). The Antigravity rebuild should keep equivalents but feel free to route through a real structured logger (pino, etc.). The `[STREAM]`, `[FRAME EXTRACTION]`, `[FRAME STREAM]`, `[VIDEO ANALYSIS]` prefixes in the video pipeline are deliberately greppable — preserve them.

## Backups

Postgres dumps cover all the persistent data. Object storage holds compressed teaching videos — also worth backing up; they were AI-tagged at upload time and re-running analysis costs money.
