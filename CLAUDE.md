# CLAUDE.md - AI Assistant Guide for UroRads

## Project Overview

**UroRads** is a mobile-first medical education web application for case-based uro-radiology learning. It enables medical professionals to study CT scan cases with AI-powered analysis and interactive chat. Built as a Progressive Web App (PWA) for clinical settings.

## Quick Reference

```bash
# Development
npm run dev        # Start dev server with HMR (port 5000)
npm run check      # TypeScript type checking
npm run db:push    # Push database migrations

# Production
npm run build      # Build for production
npm start          # Run production build
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 7.3 |
| Routing | Wouter (lightweight router) |
| State | TanStack React Query (server), React hooks (client) |
| UI | shadcn/ui + Radix UI primitives |
| Styling | Tailwind CSS 3.4 with CSS variables |
| Backend | Express.js 4.21, Node.js 20 (ESM) |
| Database | PostgreSQL 16 via Drizzle ORM 0.39 |
| AI | Google Gemini (2.5-flash for images, 2.5-pro for chat) |
| Video | FFmpeg, Google Cloud Storage |

## Project Structure

```
├── client/                    # React frontend
│   └── src/
│       ├── components/        # UI components (BottomNav, ChatBubble, etc.)
│       │   └── ui/           # shadcn/ui components (60+ variants)
│       ├── pages/            # Route pages (CasePage, ArchivePage, AddCasePage)
│       ├── hooks/            # Custom hooks (use-mobile, use-toast, use-upload)
│       └── lib/              # Utils, queryClient, chatStorage
├── server/                    # Express backend
│   ├── ai.ts                 # Gemini AI integration (345 lines)
│   ├── routes.ts             # API endpoints (580 lines)
│   ├── storage.ts            # Database operations
│   ├── video.ts              # FFmpeg video processing
│   └── video-analysis/       # Video analysis strategies
├── shared/                    # Shared types and schemas
│   └── schema.ts             # Drizzle ORM schema
└── migrations/               # Database migrations
```

## Path Aliases

Configured in `tsconfig.json`:
- `@/*` → `./client/src/*`
- `@shared/*` → `./shared/*`

## Database Schema

**cases** table:
- `id` (varchar 36, PK, UUID)
- `caseNumber` (integer, auto-increment)
- `title` (text) - AI-generated
- `imageUrl` (text) - Public storage URL
- `explanation` (text) - AI-generated medical explanation
- `category` (text) - Stones, Hydronephrosis, Mass/Tumor, Infection, Trauma, Congenital, Vascular, Bladder, Prostate, Other
- `attendingPrompt` (text, optional) - Custom context for AI
- `videoUrl` (text, optional) - GCS URL
- `mediaType` (text) - "image" or "video"
- `createdAt` (timestamp)

**chat_messages** table:
- `id` (varchar 36, PK, UUID)
- `caseId` (varchar 36, FK)
- `role` (text) - "user" or "ai"
- `content` (text)
- `createdAt` (timestamp)

Note: Client-side chat uses localStorage with 48-hour expiry for privacy.

## API Endpoints

### Case Management
- `GET /api/cases` - List all cases (ordered by caseNumber DESC)
- `GET /api/cases/:id` - Get single case
- `POST /api/cases` - Create new case
- `PATCH /api/cases/:id` - Update case (title, explanation, category)
- `DELETE /api/cases/:id` - Delete case
- `GET /api/cases/:caseId/stream` - Stream video with range support

### Chat
- `GET /api/cases/:caseId/messages` - Get chat messages
- `POST /api/cases/:caseId/messages` - Add chat message

### AI Analysis
- `POST /api/ai/analyze` - Analyze image (generates explanation, title, category)
- `POST /api/ai/refine` - Refine explanation with feedback
- `POST /api/ai/chat` - Generate chat response
- `POST /api/ai/analyze-video` - Analyze video (full metadata)
- `POST /api/ai/analyze-video-stream` - Stream video analysis via SSE

## Key Files to Know

| File | Purpose |
|------|---------|
| `server/ai.ts` | All Gemini AI integration logic |
| `server/routes.ts` | Complete API route handlers |
| `client/src/pages/AddCasePage.tsx` | Main case creation workflow (807 lines) |
| `client/src/pages/CasePage.tsx` | Case viewing with chat (375 lines) |
| `client/src/lib/queryClient.ts` | React Query config and API helpers |
| `client/src/lib/chatStorage.ts` | localStorage chat (48-hour expiry) |
| `shared/schema.ts` | Drizzle ORM schema definitions |

## AI Model Strategy

Two Gemini models are used strategically:
- **gemini-2.5-flash**: Image/video analysis (faster, efficient for visual content)
- **gemini-2.5-pro**: Chat responses and text generation (higher quality)

Environment variables:
- `AI_INTEGRATIONS_GEMINI_API_KEY`
- `AI_INTEGRATIONS_GEMINI_BASE_URL`

## Video Analysis Modes

Configured via `VIDEO_ANALYSIS_MODE` environment variable:
1. **"legacy"** (default) - Frame extraction + multi-image Gemini analysis
2. **"native"** - Direct video upload to Gemini (20MB max)
3. **"native_with_fallback"** - Try native, fall back to frame extraction

## Development Conventions

### Code Patterns

**Components** (React):
- Functional components with hooks
- Props typing with TypeScript interfaces
- `data-testid` attributes for future testing

**Data Fetching**:
- Use `useQuery` from TanStack React Query for reads
- Use `useMutation` for mutations
- API calls go through `queryClient.ts` helpers

**Server**:
- Express middleware pattern
- Zod validation for inputs
- Async/await with try-catch error handling
- JSON responses with `{ error: string }` for failures

### Design Guidelines

From `design_guidelines.md`:
- **Mobile-first** design (primary target <640px)
- **Clinical aesthetic** - medical imagery is the hero
- **Touch targets**: Minimum 44x44px (h-12 w-12)
- **Spacing**: Tailwind units of 2, 4, 8, 12, 16
- **No decorative imagery** - this is a clinical tool
- **PWA support** with safe area insets for notched devices

### Typography Hierarchy
- App Title: `text-lg font-semibold`
- Case Numbers: `text-xl font-bold`
- Case Titles: `text-base font-medium`
- Explanations: `text-base leading-relaxed`
- Body Text: `text-sm leading-normal`
- Labels: `text-xs font-medium uppercase tracking-wide`

## Common Tasks

### Adding a New API Endpoint
1. Add route in `server/routes.ts`
2. Add types in `shared/schema.ts` if needed
3. Add database operations in `server/storage.ts`
4. Create React Query hook in component or `client/src/lib/`

### Adding a New Page
1. Create component in `client/src/pages/`
2. Add route in `client/src/App.tsx` (uses Wouter)
3. Follow existing page patterns (useQuery for data, mobile-first layout)

### Working with AI
1. AI functions are in `server/ai.ts`
2. Use `analyzeImage()` for images, `chat()` for conversation
3. Streaming responses use Server-Sent Events (SSE)

### Database Changes
1. Modify schema in `shared/schema.ts`
2. Run `npm run db:push` to apply migrations
3. Update TypeScript types (auto-generated from schema)

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini API key |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Gemini API base URL |
| `VIDEO_ANALYSIS_MODE` | Video analysis strategy |
| `PORT` | Server port (default 5000) |

## Important Notes

1. **No test framework** is currently configured - `data-testid` attributes exist for future testing
2. **Chat is localStorage-only** - no backend persistence for privacy
3. **Video uploads max 100MB** - compressed to ~50MB target
4. **PWA support** - service worker registered in `client/src/main.tsx`
5. **JSON payload limit** is 20MB for API requests
6. **Multipart uploads** limit is 100MB (configured in multer)

## Deployment

Platform: Replit Autoscale
- Build: `npm run build` (Vite + esbuild)
- Run: `node dist/index.cjs`
- External port 80 → internal port 5000
