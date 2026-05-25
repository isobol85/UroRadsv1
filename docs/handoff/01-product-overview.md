# 01 — Product Overview

## What it is

UroRads is a **mobile-first teaching app for uro-radiology**. Medical students, residents, and trainees open one case at a time, study the imaging, read a structured explanation, and ask follow-up questions to an AI tutor that has read the same case. The "feel" is closer to a flashcard / case-of-the-day app than a PACS viewer.

## Users

| Role | How they get it | Can do |
| ---- | --------------- | ------ |
| **Guest** (not logged in) | Just open the URL | Browse all cases, read explanations, chat with the AI (chat stored in their browser only). |
| **Authenticated user** | Replit SSO (Google) **or** username-only login | Everything a guest can do, plus: upload new cases, edit/delete their own cases, persistent chat history in the sidebar, searchable. |
| **Admin** | First SSO user is auto-promoted; admins can promote/demote other SSO users on `/users`. | Everything an authenticated user can do, plus: edit/delete **any** case, manage users on `/users`. Username-only accounts can never become admin. |

## Core flows

### A. Read a case (the 80% flow)

1. User lands on `/` or `/case/:id`.
2. Sees the image (or scrubbable CT-scroll video) full-bleed; bottom nav has Cases / Archive / Add.
3. Taps "Read" (or the URL has `?view=read`) — page slides into explanation view.
4. Chat input appears underneath the explanation. They ask "Why is this hydronephrosis and not pyonephrosis?" — answer streams back.
5. Guest: chat lives in `localStorage` under `urorads_chat_{caseId}`, auto-expires after 48 h.
   Logged-in user: chat session is persisted in Postgres; an AI-generated 3-word title is added after the first reply; the chat shows up in the left sidebar and is searchable.

### B. Browse the archive

1. `/archive` lists every case with thumbnail, case number, title, category.
2. Search box filters by title/category client-side.
3. Tap a case → `/case/:id`.

### C. Upload a new case (authenticated)

1. `/add` accepts either an image or a short CT-scroll video, plus an optional "Attending prompt" text field.
2. **Image path:** client sends base64 to `POST /api/ai/analyze` → server returns `{explanation, title, category}` from `gpt-5`. Image is stored inline as a data URL.
3. **Video path:** client uploads via `POST /api/ai/analyze-video-stream` (SSE). Server probes the video, smart-extracts up to 24 frames, streams the explanation back chunk-by-chunk, then finalizes title + category (`gpt-5-nano`), compresses the video with ffmpeg, uploads it to object storage, returns the persistent video URL in the final `complete` event.
4. Author can refine: edits the prompt or rejects the explanation → `POST /api/ai/refine` regenerates.
5. On confirm, `POST /api/cases` persists the row with `createdBy` set to the user.

### D. Edit / delete a case

1. From the case page, the owner or any admin sees Edit/Delete affordances.
2. `/edit/:id` lets them rewrite title/explanation/category. Re-analysis is not re-run from this page; that's only on `/add`.
3. Delete cascades to the case's chat sessions and messages (FK `onDelete cascade`).

### E. Admin user management

1. `/users` (admins only) lists all users.
2. Admin can promote/demote SSO users to/from admin, or delete a user. Deleting a user **anonymises** their authored cases (sets `cases.created_by = NULL`) so the cases stay visible to learners; chat sessions/messages owned by that user are cascade-deleted.

## What "done" looks like

A faithful rebuild ships when all of the following are true:

- The five core flows above work end-to-end against a fresh Postgres + an OpenAI key.
- Public read works without any auth cookie.
- Auth works via at least one SSO provider (NextAuth / Clerk / Auth.js — see doc 5) AND a username-only fallback.
- First SSO user is auto-promoted to admin; username-only users can never be admin.
- Video upload runs the smart-frame pipeline (not the legacy `extractFramesFromVideo`) and streams the explanation as it generates.
- Cases survive author deletion (anonymised, not lost).
- Chat persists for logged-in users; chat is local-only and auto-expires for guests.
- Mobile UI works one-handed: bottom nav, safe-area padding, `100dvh` layout.

## Explicitly **not** part of UroRads

- No DICOM viewer, no windowing/leveling, no native PACS integration. Cases are baked images/videos.
- No quizzes / scoring / spaced-repetition (yet — see doc 9).
- No PHI handling guarantees. Cases are assumed already de-identified by the uploader.
- No payments, no organisations, no per-tenant isolation.
- No native mobile app — it's a PWA-capable web app (`vite-plugin-pwa` is installed but PWA polish is out of scope for the rebuild).
