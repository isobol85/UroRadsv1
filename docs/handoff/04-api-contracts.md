# 04 — API Contracts

All endpoints are prefixed with `/api`. Today they live in `server/routes.ts`; on Antigravity each becomes an `app/api/.../route.ts` Route Handler (Node runtime, not Edge — the video endpoints need ffmpeg).

Auth model in this table:

- **Public** — no session required.
- **Auth** — any logged-in user (SSO or username-only).
- **Admin** — `users.is_admin = true` (SSO only by definition).
- **Owner-or-Admin** — `case.created_by === user.id` OR user is admin.

## Auth

| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| `GET`  | `/api/auth/user` | Public (returns 401 if no session) | Current user, used by `useAuth()` |
| `GET`  | `/api/login` | Public | Start Replit OIDC flow (redirect) |
| `GET`  | `/api/callback` | Public | OIDC callback (redirect) |
| `GET`  | `/api/logout` | Public | Destroy session + redirect to `/` |
| `POST` | `/api/auth/username-login` | Public | Username-only login. Body: `{ username: string }` |

```bash
# Username login
curl -X POST https://app/api/auth/username-login \
  -H 'content-type: application/json' \
  -c cookies.txt \
  -d '{"username":"aisha"}'
```

The response sets the session cookie and returns the `User` JSON. On the Antigravity side: replace the OIDC routes with NextAuth's `[...nextauth]` handler, and implement the username flow as a NextAuth **Credentials** provider.

## Admin: users

| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| `GET`    | `/api/admin/users` | Admin | List all users (sorted by `created_at`) |
| `PATCH`  | `/api/admin/users/:id` | Admin | Body: `{ isAdmin: boolean }`. Throws if target is a username-only user and `isAdmin=true`. |
| `DELETE` | `/api/admin/users/:id` | Admin | Deletes user; anonymises their cases (sets `created_by = NULL`); cascades their chat. |

## Cases

| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| `GET`    | `/api/cases` | Public | List all cases, newest first (`order by case_number desc`) |
| `GET`    | `/api/cases/:id` | Public | One case |
| `POST`   | `/api/cases` | Auth | Create case. Body: `insertCaseSchema`. Server fills `caseNumber` and `createdBy`. |
| `PATCH`  | `/api/cases/:id` | Owner-or-Admin | Body: `{ title?, explanation?, category? }`. No image/video re-write here. |
| `DELETE` | `/api/cases/:id` | Owner-or-Admin | Cascade-deletes chat messages first, then the case row. |

```bash
# List cases
curl https://app/api/cases

# Create a case (auth cookie required)
curl -X POST https://app/api/cases \
  -H 'content-type: application/json' \
  -b cookies.txt \
  -d '{
    "title":"Right hydronephrosis",
    "imageUrl":"data:image/jpeg;base64,...",
    "explanation":"...",
    "category":"Hydronephrosis",
    "attendingPrompt":null,
    "videoUrl":null,
    "mediaType":"image"
  }'
```

## Chat (case-scoped messages — legacy, used by guests' server-side write of their guest chat for cross-device parity is **not** implemented; guests are pure localStorage)

| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| `GET`  | `/api/cases/:caseId/messages` | Public | All chat messages for a case (rarely used directly — UI prefers session-scoped) |
| `POST` | `/api/cases/:caseId/messages` | Public (writes only allowed if a `sessionId` belonging to current user is provided) | Body: `{ sessionId, role, content }` |

## Chat sessions (authenticated)

| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| `GET`    | `/api/chat-sessions` | Auth | All sessions for current user, with joined `caseName`. Sorted by `updatedAt desc`. |
| `GET`    | `/api/chat-sessions/search?q=...` | Auth | Same shape, filtered by `ilike` on session title OR case title. |
| `GET`    | `/api/chat-sessions/:id` | Auth (must own session) | One session |
| `GET`    | `/api/chat-sessions/:id/messages` | Auth (must own session) | All messages in a session |
| `POST`   | `/api/cases/:caseId/chat-session` | Auth | Get-or-create. Returns `{ id, caseId, userId, title, createdAt, updatedAt }`. |
| `PATCH`  | `/api/chat-sessions/:id/title` | Auth (must own session) | Body: `{ title: string }`. Used internally after first AI reply. |

```bash
curl -X POST https://app/api/cases/abc-123/chat-session -b cookies.txt
```

## AI

All AI endpoints accept JSON unless noted. All return `application/json` unless the path ends in `-stream` (then SSE).

| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| `POST` | `/api/ai/analyze` | Public | Body: `{ imageBase64, attendingPrompt? }`. Returns `{ explanation, title, category }`. Uses `gpt-5` for explanation, `gpt-5-nano` for title/category in parallel. |
| `POST` | `/api/ai/refine` | Public | Body: `{ imageBase64, currentExplanation, feedback }`. Returns new `{ explanation, title, category }`. |
| `POST` | `/api/ai/chat` | Public | Body: `{ explanation, chatHistory: [{role,content}], userMessage }`. Returns `{ response }`. Uses `gpt-5`. |
| `POST` | `/api/ai/analyze-video` | Public | `multipart/form-data` with `video` file + optional `attendingPrompt`. Synchronous; returns full result including final `videoUrl`. |
| `POST` | `/api/ai/analyze-video-stream` | Public | Same multipart input, **SSE response** (see SSE event types below). This is the production path used by the UI. |
| `POST` | `/api/video/info` | Public | multipart `video`. Returns `{ duration, width, height, fps }` from ffprobe. Used by the UI for preview before full analysis. |
| `POST` | `/api/ai/test-multi-image` | Public | Internal scratch endpoint; drop on the Antigravity rebuild. |

### SSE event stream for `/api/ai/analyze-video-stream`

The server sends named events. Clients must use `EventSource`-style parsing.

| Event | `data` JSON | Meaning |
| ----- | ----------- | ------- |
| `status` | `{ status: "processing"\|"extracting"\|"analyzing"\|"finalizing"\|"uploading", message: string }` | Progress update for the UI's loading state |
| `chunk`  | `{ text: string }` | A token-level slice of the explanation as it streams from OpenAI |
| `complete` | `{ explanation, title, category, videoInfo, analysisStrategy: "frames", thumbnail, videoUrl, mediaType: "video" }` | Final payload; the client should now commit the case via `POST /api/cases` |
| `error` | `{ error: string, details?: string }` | Sent if anything fails after the SSE headers have already been written |

### Video streaming proxy

| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| `GET`  | `/api/videos/:caseId/stream` | Public | Range-aware proxy that streams the video out of object storage. Supports `Range: bytes=...` for scrubbing. |

The server resolves `case.video_url`, parses out `<bucket>/<object>`, and streams via the object storage SDK's read stream. On Antigravity:

- For S3/R2: use `GetObjectCommand` with `Range`, return a `ReadableStream` in the `Response`.
- For GCS: same idea with `bucket.file(name).createReadStream({ start, end })`.

## Seed

| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| `POST` | `/api/seed` | Public (no-op if any cases exist) | Bulk-inserts initial cases from `server/seed-data.json`. Run once after a fresh deploy. |

## Common error shape

```json
{ "error": "Human-sentence error", "details": "optional extra context" }
```

Zod validation failures additionally include `details: ZodError.errors`.

## Notes for the rebuild

- All routes that consume images take **raw base64** in JSON (no data URL prefix is required; `normalizeImageInput()` strips it if present and re-encodes to JPEG).
- Body size: the Express server allows up to `20mb` JSON (`server/index.ts`). Mirror this with Next's route config (`export const maxDuration` and route segment config, plus a body parser that accepts large multipart for video).
- Video routes use **`multer` memoryStorage**. The Next equivalent is `await request.formData()` followed by `await file.arrayBuffer()`. The buffer is then passed straight to ffmpeg in a temp dir — see doc 6.
- The chat endpoint takes the **entire chat history every request** — there is no server-side conversation memory. The server only persists messages for the sidebar; the LLM call is stateless. Keep it that way for the rebuild — it simplifies token-budget management.
