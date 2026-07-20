---
name: Clerk web wiring quirks
description: Non-obvious Clerk (Replit whitelabel) frontend wiring rules that silently break dev auth if drifted.
---

Rules for the web `ClerkProvider` wiring (see `artifacts/dempo/src/lib/auth.tsx`):

- `proxyUrl` must be exactly `import.meta.env.VITE_CLERK_PROXY_URL` (empty/undefined in dev). Do NOT add a fallback like `BASE_URL + "/api/__clerk"`. In dev Clerk loads clerk-js from the dev FAPI directly; forcing the proxy path makes `/api/__clerk/npm/@clerk/clerk-js@6/...` 404 (served as HTML by the SPA) and Clerk fails to load.
- `publishableKey` must come from `publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)`, imported from `@clerk/react/internal` (NOT `@clerk/shared/keys`, which isn't resolvable in the web app).
- Server clerk proxy path is hardcoded `/api/__clerk` (`CLERK_PROXY_PATH`), mounted before body parsers.
- wouter routes for Clerk must be `"/sign-in/*?"` and `"/sign-up/*?"` (optional wildcard) to match OAuth sub-paths.

**Why:** A design subagent drifted from canonical on all of these; symptoms were a blank page + "Failed to load Clerk JS" and MIME errors.
**How to apply:** When wiring or reviewing Clerk on web, diff against the clerk-auth skill's `setup-and-customization.md` canonical block; don't restate from general Clerk knowledge.

Also: a `Shell`/layout that calls `useGetMe()` must gate it on Clerk `isSignedIn` (query `enabled`), else signed-out visitors hang on the loading skeleton instead of seeing public pages.
