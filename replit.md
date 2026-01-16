# UroRads - Uro-Radiology Education Platform

## Overview

UroRads is a mobile-first medical education application focused on case-based uro-radiology learning. The platform allows medical professionals to view radiology cases (CT scans, imaging), read detailed explanations, and interact with an AI-powered chat assistant for deeper understanding. Key features include case browsing, an archive of past cases, and the ability to add new teaching cases with AI-generated explanations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Build Tool**: Vite with HMR support

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful endpoints prefixed with `/api`
- **AI Integration**: Google Gemini via Replit AI Integrations (server/ai.ts)
  - gemini-2.5-flash: Image/video analysis (fast, efficient)
  - gemini-2.5-pro: Chat responses, title/category generation (quality)
- **Development**: Vite middleware for hot module replacement
- **Production**: Static file serving from built assets

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (configured via `DATABASE_URL`)
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Validation**: Zod schemas generated from Drizzle schema via drizzle-zod
- **Storage Interface**: DatabaseStorage implementation in `server/storage.ts`

### Database Schema
Two main tables:
- **cases**: Stores radiology teaching cases (id, caseNumber, title, imageUrl, explanation, category, attendingPrompt, createdAt)
- **chatMessages**: Stores AI chat conversations per case (id, caseId, role, content, createdAt)

### API Endpoints
- `GET /api/cases` - List all cases
- `GET /api/cases/:id` - Get single case
- `POST /api/cases` - Create new case
- `GET /api/cases/:caseId/messages` - Get chat messages for case
- `POST /api/cases/:caseId/messages` - Add chat message
- `POST /api/ai/analyze` - Analyze image and generate explanation, title, category
- `POST /api/ai/refine` - Refine explanation based on feedback
- `POST /api/ai/chat` - Generate AI chat response

### Project Structure
```
├── client/           # React frontend application
│   └── src/
│       ├── components/   # Reusable UI components (BottomNav, ChatBubble, CaseImage, EmptyState)
│       ├── pages/        # Route page components (CasePage, ArchivePage, AddCasePage)
│       ├── hooks/        # Custom React hooks
│       └── lib/          # Utilities and query client
├── server/           # Express backend
│   ├── ai.ts         # Gemini AI integration
│   ├── db.ts         # Database connection
│   ├── storage.ts    # DatabaseStorage implementation
│   └── routes.ts     # API route handlers
├── shared/           # Shared types and schema
└── migrations/       # Drizzle database migrations
```

### Design System
- Mobile-first with bottom navigation for one-handed operation
- Clean, clinical aesthetic optimized for medical content readability
- Light/dark mode support via CSS variables
- Apple HIG + Material Design principles

## External Dependencies

### AI Integration
- **Google Gemini**: Via Replit AI Integrations for image analysis, chat, and explanations
  - gemini-2.5-flash: Used for image/video analysis (fast processing)
  - gemini-2.5-pro: Used for chat, titles, and text generation (high quality)
- Environment variables: `AI_INTEGRATIONS_GEMINI_API_KEY`, `AI_INTEGRATIONS_GEMINI_BASE_URL`

### Database
- **PostgreSQL**: Primary database (configured via `DATABASE_URL` environment variable)
- **Drizzle Kit**: Database migration and push tooling

### UI Framework
- **Radix UI**: Accessible component primitives (dialogs, dropdowns, tooltips, etc.)
- **shadcn/ui**: Pre-built component styling (new-york style variant)
- **Lucide React**: Icon library

### Data Fetching
- **TanStack React Query**: Server state management and caching

### Form Handling
- **React Hook Form**: Form state management
- **Zod**: Schema validation

### Development Tools
- **Vite**: Build and development server
- **tsx**: TypeScript execution for Node.js
- **esbuild**: Production bundling for server code
