# CLAUDE.md - Project Instructions for Claude Code

## Project Overview

**UroRads** is a full-stack TypeScript medical education web application for uro-radiology case-based learning. Medical professionals can view radiology cases (CT scans, images), read AI-generated explanations, chat with an AI assistant, and add new teaching cases.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TanStack Query v5, Wouter, Tailwind CSS, shadcn/ui (Radix UI)
- **Backend**: Node.js, Express, TypeScript (ESM)
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: Google Gemini (gemini-2.5-flash for images, gemini-2.5-pro for text)
- **Storage**: Google Cloud Storage for media files
- **Deployment**: Replit with PWA capabilities

## Development Commands

```bash
npm run dev      # Start dev server with Vite HMR (port 5000)
npm run build    # Build client (Vite) + server (esbuild) to dist/
npm start        # Run production server
npm run db:push  # Push schema changes to PostgreSQL
npm run check    # TypeScript type checking (tsc --noEmit)
```

## Project Structure

```
client/src/
├── main.tsx              # Entry point
├── App.tsx               # Router setup
├── components/           # React components
│   ├── ui/               # shadcn/ui components (35+)
│   ├── BottomNav.tsx     # Mobile navigation
│   ├── CaseImage.tsx     # CT scan display
│   └── ChatBubble.tsx    # AI/user messages
├── pages/                # Route pages
│   ├── CasePage.tsx      # Main case view with chat
│   ├── ArchivePage.tsx   # Case library
│   ├── AddCasePage.tsx   # Create new case
│   └── EditCasePage.tsx  # Edit case
├── hooks/                # Custom React hooks
└── lib/                  # Utilities (queryClient, chatStorage)

server/
├── index.ts              # Express app setup
├── routes.ts             # API route handlers (main business logic)
├── ai.ts                 # Gemini AI integration
├── storage.ts            # DatabaseStorage implementation
├── db.ts                 # Database connection
└── video.ts              # Video processing

shared/
└── schema.ts             # Drizzle ORM schema + Zod validation
```

## Key Files

- `shared/schema.ts` - Database schema (cases, chatMessages tables) with Zod validation
- `server/routes.ts` - All API endpoints and business logic
- `server/ai.ts` - Gemini AI integration for image analysis and chat
- `client/src/lib/chatStorage.ts` - Browser localStorage chat management (48hr expiry)

## API Endpoints

- `GET /api/cases` - List all cases
- `GET /api/cases/:id` - Get single case
- `POST /api/cases` - Create new case
- `PATCH /api/cases/:id` - Update case
- `DELETE /api/cases/:id` - Delete case
- `GET /api/cases/:caseId/messages` - Get chat history
- `POST /api/cases/:caseId/messages` - Add message
- `POST /api/ai/analyze` - Analyze image, generate explanation
- `POST /api/ai/refine` - Refine explanation
- `POST /api/ai/chat` - Generate chat response

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `AI_INTEGRATIONS_GEMINI_API_KEY` - Gemini API key
- `AI_INTEGRATIONS_GEMINI_BASE_URL` - Gemini base URL

Optional:
- `PORT` - Server port (default 5000)
- `NODE_ENV` - development/production

## Code Style & Patterns

- TypeScript strict mode throughout
- ESM modules in both client and server
- React Query for server state management
- Zod schemas auto-generated from Drizzle via drizzle-zod
- Mobile-first design with bottom navigation
- shadcn/ui components with Tailwind styling (new-york variant)

## Database Schema

```typescript
// cases table
id, caseNumber, title, imageUrl, explanation, category,
attendingPrompt, videoUrl, mediaType, createdAt

// chatMessages table
id, caseId, role (user/ai), content, createdAt
```

## Design Guidelines

- Mobile-first with safe area insets for notched devices
- Light/dark mode via CSS custom properties
- Bottom nav: h-16, 3-column grid
- Buttons: h-12, rounded-lg
- Minimal animations (200ms transitions)
- WCAG AA contrast compliance

## Important Notes

- Chat history persists in browser localStorage (no login required)
- Videos processed with FFmpeg
- Production build uses esbuild for server bundling
- Vite handles client build with code splitting
