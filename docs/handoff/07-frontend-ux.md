# 07 — Frontend UX

## Stack

- React 18, TypeScript, **wouter** for routing (swap to Next.js App Router on Antigravity), **TanStack Query v5** for data, **shadcn/ui** + Radix + Tailwind for visuals, **lucide-react** for icons, `react-markdown` for rendering explanations.
- Mobile-first. The app is a `100dvh` flex column with `env(safe-area-inset-top)` padding, a fixed top header, scrollable middle, and a fixed bottom nav.

## Routes

| Route | Component | Notes |
| ----- | --------- | ----- |
| `/` | `CasePage` | Shows the newest case (case #N). |
| `/case/:id` | `CasePage` | One case. Accepts `?view=read` to open in explanation mode. |
| `/archive` | `ArchivePage` | Grid/list of all cases with search. |
| `/add` | `AddCasePage` | Auth-gated UI; the create flow with streaming AI analysis. |
| `/edit/:id` | `EditCasePage` | Owner-or-admin gated UI; edits title/explanation/category only. |
| `/login` | `LoginPage` | Choose SSO button or type a username. |
| `/users` | `UsersPage` | Admin-only. |
| `*` | `not-found` | 404. |

## Top-level layout

`App.tsx` mounts a single `TopHeader`, a `Router`, a `BottomNav`, and a slide-in `ChatSidebar`. The sidebar is **app-level state** (`sidebarOpen`) so it can be opened from anywhere via the hamburger in the header.

## Components

| File | Role |
| ---- | ---- |
| `TopHeader.tsx` | Hamburger (opens chat sidebar) + page title + user menu trigger. |
| `BottomNav.tsx` | 3 tabs: Cases (`/`), Archive (`/archive`), Add (`/add`). Auth-gates the Add tab. |
| `UserMenu.tsx` | Avatar dropdown — login / logout / users (admins). |
| `ChatSidebar.tsx` | List of the logged-in user's chat sessions (joined with case title). Search box hits `/api/chat-sessions/search`. Click → navigates to `/case/:id?view=read`. |
| `CaseImage.tsx` | Renders the case media. For images: `<img>` with the inline data URL or remote URL. For videos: `<video controls preload="metadata">` pointed at `/api/videos/:caseId/stream`. |
| `ExplanationCard.tsx` | The explanation pane: markdown rendering, owner/admin edit/delete buttons, AI chat input at the bottom. |
| `ChatBubble.tsx` | One chat message; supports both `LocalChatMessage` (guest) and DB `ChatMessage` shapes. |
| `EmptyState.tsx` | Reusable empty/loading copy. |
| `LoadingPearls.tsx` | The pulsing dots animation used during AI analysis. |
| `ObjectUploader.tsx` | Uppy-based uploader. Today used for images and videos on `/add`. |

## URL-driven view mode (`useUrlMode`)

The split between "image view" and "explanation/read view" on the case page is **URL-driven**. `?view=read` triggers read mode; anything else is image mode. Implemented by `client/src/hooks/use-url-mode.ts`. Behaviours:

- On mount, read the URL.
- `setMode` updates state **and** rewrites the URL with `history.replaceState` (no page reload).
- A `popstate` listener keeps state in sync with browser back/forward.
- Cross-page navigations (wouter `location` change) re-read the URL.
- A custom `urorads-open-chat` window event flips to read mode — `ChatSidebar` dispatches this when the user clicks a session for the **currently visible** case.
- `sessionStorage.urorads_open_in_read_mode` is a one-shot fallback used when the destination page must initialise in read mode before the URL has been read (legacy carry-over; keep it).

On Antigravity, the cleanest port is to use the Next App Router's `useSearchParams` + `router.replace(..., { scroll: false })`. The fundamental rule — **the URL is the source of truth for view mode** — stays.

## Chat: guest vs. authenticated

Two completely separate storage layers, gated by `useAuth().isAuthenticated`.

| Aspect | Guest | Authenticated |
| ------ | ----- | ------------- |
| Storage | `localStorage` key `urorads_chat_{caseId}` (`client/src/lib/chatStorage.ts`) | Postgres (`chat_sessions` + `chat_messages`) |
| Expiry | Auto-purged after 48 h on next read | None (cascades only on case/user deletion) |
| Cross-device | No | Yes |
| Sidebar listing | Not shown | Listed and searchable |
| Title generation | None | After first AI reply, `generateChatTitle()` writes a 3-word title via `PATCH /api/chat-sessions/:id/title` |

The chat **send** logic is the same in both branches — POST to `/api/ai/chat` with `{ explanation, chatHistory, userMessage }` and append the response. Persistence is the only difference.

## Add Case flow (`AddCasePage`)

The richest screen in the app. Order of operations:

1. User picks a file (image or video) and optionally types an `attendingPrompt`.
2. **If image:** read as base64, `POST /api/ai/analyze`. Show `LoadingPearls` while waiting. On response, render the explanation editor.
3. **If video:**
   1. `POST /api/video/info` for duration/resolution preview.
   2. Open an SSE connection to `POST /api/ai/analyze-video-stream` (use `fetch` + `ReadableStream` reader — `EventSource` doesn't do `POST` with body).
   3. Drive the UI from `status` events ("Extracting frames…", "Analyzing…", "Uploading…").
   4. Append `chunk` event text into the live explanation pane as it streams.
   5. On `complete`, store the returned `videoUrl`, `thumbnail`, `videoInfo`, `title`, `category`, `explanation`.
4. The user can:
   - Accept → `POST /api/cases` with the final fields, redirect to the new case.
   - Refine → `POST /api/ai/refine` with their feedback, loop.
   - Cancel → discard (video file is **already uploaded** to object storage at this point if the stream completed; that's accepted tech debt — an orphan-cleanup job is a reasonable follow-up).

## Edit Case flow (`EditCasePage`)

Far simpler: load case via `/api/cases/:id`, render an editable form (title, explanation as markdown, category as text input), `PATCH /api/cases/:id` on save. No re-analysis from this page.

## Visual / interaction details to preserve

- Bottom-nav tap targets ≥ 44 px tall.
- `100dvh` rather than `100vh` to handle iOS Safari URL bar.
- Image area is full-bleed; tapping the image once flips to read mode and vice versa.
- Read mode keeps the image visible as a small header thumbnail so context isn't lost.
- Dark mode via `next-themes` (already installed). Tailwind config sets `darkMode: ["class"]`.
- All interactive elements have `data-testid` attributes following the `{action}-{target}` and `{type}-{id}` convention in `.local/skills/fullstack-js/SKILL.md`. Carry these over — the testing skill relies on them.

## SEO

Currently a SPA, so there are no per-page meta tags beyond what's in `client/index.html`. On the Next.js rebuild, set per-route metadata via the App Router's `generateMetadata` for `/case/[id]`:

- Title: `${case.title} — UroRads`
- Description: first ~160 chars of `case.explanation`, plain-text stripped of markdown
- OG image: the case image (data URLs won't work for crawlers — only use this when the image is an `https://` URL).
