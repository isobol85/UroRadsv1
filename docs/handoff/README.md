# UroRads — Antigravity Rebuild Handoff

This `docs/handoff/` directory is a self-contained spec for rebuilding **UroRads** (a mobile-first uro-radiology teaching app) from scratch on a **Next.js / Node + Postgres + LLM** stack, without depending on any Replit-specific tooling.

It is written so that another team — or an Antigravity agent — can read these files top-to-bottom and produce a faithful re-implementation.

## What UroRads is, in one paragraph

Medical learners open a radiology case (CT image or short CT-scroll video), read an AI-generated explanation, and chat with an AI tutor that knows the case. Attendings (admins) can upload new cases by dropping an image/video plus an optional prompt; the system uses a vision LLM to write the title, category, and full teaching explanation, with a streaming UI during analysis. Reading cases is public; uploading/editing requires login.

## Reading order

| # | File | What it tells you |
| - | ---- | ----------------- |
| 1 | [`01-product-overview.md`](./01-product-overview.md) | Users, core flows, what "done" means |
| 2 | [`02-architecture.md`](./02-architecture.md) | Current Replit stack vs target Antigravity stack, side-by-side replacement table |
| 3 | [`03-data-model.md`](./03-data-model.md) | Every table, every column, ER diagram, Zod insert rules |
| 4 | [`04-api-contracts.md`](./04-api-contracts.md) | Every `/api/*` endpoint with shapes and curl examples |
| 5 | [`05-auth-and-permissions.md`](./05-auth-and-permissions.md) | Dual login model, permission matrix, NextAuth/Clerk swap |
| 6 | [`06-ai-behavior.md`](./06-ai-behavior.md) | Model tiers, prompts, smart-frame video pipeline, streaming |
| 7 | [`07-frontend-ux.md`](./07-frontend-ux.md) | Pages, key components, URL-driven view mode, guest vs auth chat |
| 8 | [`08-environment-and-ops.md`](./08-environment-and-ops.md) | Env vars, build/run, deployment, what NOT to carry over |
| 9 | [`09-open-questions.md`](./09-open-questions.md) | Known gaps and proposed follow-ups |

## Glossary

- **Case** — one teaching unit: an image (or short CT-scroll video) + AI-written title + AI-written explanation + category.
- **Attending prompt** — optional text the case author adds when uploading; steers the AI's explanation.
- **CT scroll video** — a screen recording of someone scrolling through CT slices in their PACS viewer. Typically 5–20 seconds, no audio.
- **Smart frames** — the way we sample frames from a CT-scroll video: density-aware base sampling + scene-change detection + auto-crop. See doc 6.
- **Chat session** — an authenticated user's persistent conversation with the AI tutor about one case. Guests get a localStorage-only equivalent.
- **Replit Auth** — Replit's hosted OIDC SSO ("Log in with Replit / Google"). Being replaced — see doc 5.
- **Replit AI Integrations** — Replit's managed OpenAI gateway (proxy + API key injection). Being replaced — see doc 6.
- **Replit Object Storage** — Replit's wrapper around Google Cloud Storage. Used for video files. Being replaced — see doc 8.
- **AI tutor** — the chat assistant on the case page; not a separate service, just `POST /api/ai/chat` against the case's explanation.

## Conventions used in this spec

- Code paths use the **current repo** layout (e.g. `server/routes.ts`) so you can cross-check against source as the canonical reference.
- "**Antigravity target**" callouts identify the replacement for a Replit-specific piece. Every Replit-specific dependency is called out at least once in either doc 2 or doc 8.
- All JSON shapes assume `Content-Type: application/json` unless stated.
- Out of scope for this handoff: runnable scaffolding, screenshots, deployment recipes for any specific cloud, and migration of existing production data (the new app starts empty and is seeded via `POST /api/seed`).
