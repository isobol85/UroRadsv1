# 09 — Open Questions & Known Gaps

These are things the rebuild team should know about: deferred work, sharp edges, and decisions worth making consciously.

## Known deferred product work

| # | Item | Why it matters | Notes |
| - | ---- | -------------- | ----- |
| 1 | **Real preview frame for video cases in the archive list** | Today the archive thumbnail for a video case is the middle extracted frame (a `data:` URL persisted in `cases.image_url`). It works but bloats the row by ~50–200 KB. A dedicated thumbnail field served from object storage would be cleaner. | Tracked separately as a follow-up task; do not roll into the rebuild scope. |
| 2 | **"Re-read uncertain CT slices in higher detail" loop** | The current smart-frame pipeline samples once and sends. A second pass that re-extracts higher-resolution frames around timestamps the model flagged as uncertain would improve diagnostic quality on subtle findings. | Also tracked separately as a follow-up. |
| 3 | **Mobile uploads dying when the screen sleeps** | The video upload + SSE stream is a long-lived request. iOS Safari kills the fetch when the tab/screen backgrounds. | Tracked as a follow-up. The rebuild may want to handle this from day one — Service Worker + resumable upload (e.g. `tus`) is the standard fix. |
| 4 | **Orphan video blobs in object storage** | The `/api/ai/analyze-video-stream` endpoint uploads the compressed video **before** the user has confirmed the case. If they cancel on the review screen, the blob is orphaned. | A periodic cleanup job (delete blobs >24 h old not referenced by any `cases.video_url`) is the easy fix. |
| 5 | **No rate limit on `/api/auth/username-login`** | Anyone can spam-create username-only users. | Low risk today (no admin path for them) but worth adding `express-rate-limit` / Next middleware on the rebuild. |
| 6 | **Chat history grows unbounded** | Every chat request sends the full history to the LLM. Long sessions become expensive and eventually exceed the context window. | Add a rolling-window or summariser on the rebuild. |
| 7 | **Public POST to `/api/cases/:caseId/messages`** | This endpoint accepts writes when given a `sessionId`; today it doesn't strictly verify the session belongs to the caller. | Tighten on the rebuild: require `session.user.id === chat_session.user_id`. |
| 8 | **No schema enum for `chat_messages.role` or `cases.media_type`** | Both are `text` columns relying on convention (`'user'|'ai'`, `'image'|'video'`). | Convert to Postgres enums or Zod-validated text on the rebuild. |
| 9 | **No image moderation** | Cases are uploaded by trusted users (auth-gated), but there's no guard against unintended PHI in metadata or bystander information in screenshots. | Out of scope, but worth flagging if the product opens to a wider author base. |

## Stack decisions the rebuild team must make

| Decision | Options | Notes |
| -------- | ------- | ----- |
| Auth provider | NextAuth (Auth.js) with Google + Credentials **vs** Clerk | NextAuth is closer to the current model (DIY storage). Clerk is faster to ship but you'll embed the first-admin bootstrap in a webhook. See doc 5. |
| Session strategy | NextAuth JWT (drop `sessions` table) vs DB sessions (mirror current behaviour) | JWT is simpler and stateless. DB sessions let you invalidate server-side and pair naturally with the existing 10-year TTL. |
| Object storage | S3/R2 (cheap egress on R2) vs GCS | Identical from the code's perspective. Pick by your wider cloud footprint. |
| Video runtime | Run inside Next.js Node runtime vs sidecar service | If you deploy on Vercel, the video path will need a sidecar (Fly/Render) due to function size & execution limits. On any single-VM/container host, in-process is fine. |
| OpenAI access | Direct vs through your own gateway (e.g. Cloudflare AI Gateway) | Direct is simplest. A gateway lets you swap providers later without code changes. |

## Things to verify against current source before locking the spec

A faithful rebuild should diff these once at the start:

- **Exact text of every system prompt** in `server/ai.ts`, including `SYSTEM_PROMPT_VIDEO_ANALYSIS`. The docs in this handoff describe their intent, not their wording.
- **Exact behaviour of `getNextCaseNumber()`** in `server/storage.ts`. The `GREATEST/COALESCE/UPSERT` query is intentional; don't simplify.
- **The set of files in `client/src/components/ui/`** — these are shadcn-generated. Copy the directory wholesale rather than re-generating, to preserve any local tweaks.
- **`server/seed-data.json`** — keep it as-is for the new deployment's `POST /api/seed`.

## Out-of-scope reminders (do not let scope creep in)

- No DICOM, no PACS, no quizzes, no payments, no multi-tenant, no native mobile app, no on-device PHI scrubbing. See `01-product-overview.md`.
- No "rich" markdown editor in `EditCasePage` — a `<textarea>` is the deliberate UX. Cases are short.
- No real-time collaboration; one user, one chat session per case.
