# 05 — Auth & Permissions

## Two ways to log in

UroRads supports two parallel login modes, both producing a server-side session:

1. **SSO** via Replit Auth (Replit's hosted OIDC, effectively Google).
   - User row gets a UUID `id`, populated `email`, `firstName`, `lastName`, `profileImageUrl`.
   - First SSO user to ever log in becomes `is_admin = true`.
2. **Username-only**, no password, frictionless ("just type a name and start using the app").
   - User row gets `id = 'username_<slug>'`, `display_name = username`, everything else NULL.
   - **Can never be admin**, enforced in `authStorage.upsertUser()` and `setUserAdmin()`.

Both modes share the same `users` table and the same Express session backed by `connect-pg-simple` (stored in the `sessions` table). Session TTL is **10 years** — deliberately treated as "effectively forever" so the app feels frictionless.

## Permission matrix

| Action | Guest | Username user | SSO user | Admin |
| ------ | ----- | ------------- | -------- | ----- |
| List cases / read a case | ✅ | ✅ | ✅ | ✅ |
| Chat with AI on a case | ✅ (local only) | ✅ (DB persisted) | ✅ (DB persisted) | ✅ |
| Create case | ❌ | ✅ | ✅ | ✅ |
| Edit/delete **own** case | ❌ | ✅ | ✅ | ✅ |
| Edit/delete **any** case | ❌ | ❌ | ❌ | ✅ |
| Use `/users` (manage users) | ❌ | ❌ | ❌ | ✅ |
| Be promoted to admin | n/a | ❌ (enforced) | ✅ | already |

### Where these are enforced

- `isAuthenticated` middleware — `server/replit_integrations/auth/replitAuth.ts`.
- `isAdmin` middleware — `server/replit_integrations/auth/routes.ts`.
- Owner-or-admin checks live **inline** in the case PATCH/DELETE handlers (`server/routes.ts:286` and `:317`) — they read `req.user`, look up the case, and compare `case.createdBy` to `user.claims.sub` or `user.id`.

### Frontend hints (not enforcement)

The client hides Edit/Delete buttons it can't use. **Server is authoritative** — never rely on client checks alone. The `useAuth()` hook (`client/src/hooks/use-auth.ts`) calls `GET /api/auth/user` and caches the result for 5 minutes. The localStorage key `urorads_local_user` is a cache only; if the server returns 401, the cache is cleared.

## First-admin bootstrap

In `authStorage.upsertUser`:

```ts
// pseudocode
if (id startsWith 'username_') {
  isAdmin = false;          // force
} else if (newUser) {
  const adminCount = SELECT count(*) FROM users WHERE is_admin;
  if (adminCount === 0) {
    isAdmin = true;         // bootstrap the first SSO user
  }
}
```

Port this rule verbatim. It survives:

- Username-only users being created first (still no admin yet → next SSO user becomes admin).
- An admin being deleted (next SSO user becomes admin again).

## Antigravity replacement: NextAuth (recommended)

```ts
// app/api/auth/[...nextauth]/route.ts (sketch — verify against your NextAuth version)
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { authStorage, isUsernameUserId } from "@/lib/auth-storage";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 365 * 10 }, // 10 years
  providers: [
    Google,
    Credentials({
      name: "Username",
      credentials: { username: { type: "text" } },
      async authorize(creds) {
        const username = String(creds?.username ?? "").trim().toLowerCase();
        if (!username) return null;
        const user = await authStorage.upsertUser({
          id: `username_${username}`,
          displayName: username,
          isAdmin: false,
        });
        return { id: user.id, name: user.displayName ?? username };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        await authStorage.upsertUser({
          id: user.id!,
          email: user.email ?? null,
          // ...
        }); // bootstraps first admin, same logic as today
      }
      return true;
    },
    async session({ session, token }) {
      session.user.id = token.sub!;
      const u = await authStorage.getUser(token.sub!);
      session.user.isAdmin = u?.isAdmin ?? false;
      return session;
    },
  },
});
```

Then in each Route Handler:

```ts
import { auth } from "@/app/api/auth/[...nextauth]/route";
const session = await auth();
if (!session) return new Response("Unauthorized", { status: 401 });
if (!session.user.isAdmin) return new Response("Forbidden", { status: 403 });
```

### Clerk alternative

If NextAuth feels heavy, **Clerk** works too. The constraints to preserve:

- Username-only flow must produce a user with id starting `username_*` and `isAdmin=false`.
- First Google user gets admin. Implement via Clerk's `user.created` webhook calling `authStorage.upsertUser` with the same bootstrap rule.

## Things to migrate carefully

| Concern | Today | Antigravity |
| ------- | ----- | ----------- |
| Cookie name | `connect.sid` (express-session default) | NextAuth's `next-auth.session-token` (JWT) or `authjs.session-token`. Update any documentation that names the cookie. |
| Session table | `sessions` (jsonb, indexed `expire`) | Optional: drop entirely if using JWT sessions. |
| OIDC client ID/secret | Replit-issued, injected via env | Your own Google OAuth credentials. New env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`. |
| Logout | `GET /api/logout` redirects to `/` | NextAuth `signOut({ redirectTo: "/" })`. Keep the URL the client calls if you want a drop-in (`window.location.href = "/api/logout"` in `use-auth.ts`) — route handler can just call `signOut`. |
| `/api/auth/user` | Returns the joined `User` row | Keep the endpoint shape: combine `session.user` with `authStorage.getUser(session.user.id)` and return the same `User` JSON. The client expects this shape. |
| Username login | `POST /api/auth/username-login { username }` | Map to NextAuth Credentials provider. The client posts to the same path for parity, server forwards to `signIn("credentials", ...)`. |

## Security notes

- `isAdmin` is only ever **set** on the server. Never trust the client.
- The username-only path is intentionally low-trust: anyone can claim any username. That's acceptable because (a) those users can never become admin, (b) cases they create are still moderatable by admins, (c) the product positioning is "low-friction teaching tool", not a credentialing system. If the rebuild changes the positioning, add real auth to the username flow.
- The `/api/auth/username-login` endpoint should rate-limit on the Antigravity rebuild (e.g. 10 req/min per IP). The current implementation does not.
- The `POST /api/cases/:caseId/messages` endpoint accepts writes from anyone with a valid `sessionId` for the user. Tighten this on the rebuild to require the session row to belong to `session.user.id`.
