# Dempo

Dempo is a teaching/LMS web app where students join courses, submit assignments (text, files, links, video, audio), and get instant AI-assisted grading + plagiarism scores, while teachers create courses, run an AI-pre-filled grading queue, and message students.

## Run & Operate

- `pnpm --filter @workspace/dempo run dev` — run the web app (Vite)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build composite libs (`tsc --build`); run this before `--filter` typechecks or api-server will report phantom "no exported member" errors from unbuilt lib dist
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9, React 19
- Web: React + Vite + wouter + TanStack Query + shadcn/ui + Tailwind v4
- Auth: Clerk (Replit-managed whitelabel), Google SSO, cookie-based
- API: Express 5, DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`); API codegen: Orval; AI: Replit OpenAI integration (`gpt-5.6-terra`)
- Object storage: App Storage via `@workspace/object-storage-web` + presigned URLs

## Where things live

- DB schema (source of truth): `lib/db/src/schema/` (users, courses, enrollments, invites, assignments, submissions, messages)
- API contract (source of truth): `lib/api-spec/openapi.yaml` → generates `@workspace/api-client-react` hooks + `@workspace/api-zod` schemas
- API routes: `artifacts/api-server/src/routes/` (me, courses, assignments, submissions, messaging, dashboard, storage)
- AI grading + plagiarism: `artifacts/api-server/src/lib/grading.ts`
- Auth wiring: web `artifacts/dempo/src/lib/auth.tsx`; server `artifacts/api-server/src/app.ts` + `middlewares/auth.ts` (requireAuth + JIT user provisioning)
- Theme/design tokens: `artifacts/dempo/src/index.css`

## Architecture decisions

- Roles are `teacher | student | unassigned`; new users start `unassigned` and are forced through a role-picker (PATCH /me) before reaching the app.
- Courses are roster-gated: `invitesTable` is the allow-list of student emails a teacher adds. Joining with the invite code only succeeds if the signed-in user's email (case-insensitive) is on that course's roster; otherwise the join is 403'd.
- Users are JIT-provisioned in `requireAuth` from the Clerk profile — there is no signup webhook.
- AI grading + plagiarism run best-effort at submission time (never block the submission); teachers see the AI draft pre-filled and accept/override it.
- Plagiarism is a server-side word-shingle Jaccard similarity vs other submissions on the same assignment (no external service).

## Product

Students: Google sign-in, pick role, join by invite code, see courses with due-date countdowns, submit mixed-media assignments, view past grades with AI + teacher scores side by side. Teachers: create courses/assignments (choosing allowed submission types), grading queue with AI draft + plagiarism, messaging + broadcast announcements. Demo course seeded with invite code `DEMOHR`.

## Gotchas

- Web auth is cookie-based — never add `getToken`/Authorization headers to browser API calls. A 401 means debug cookies/middleware/provisioning, not token auth.
- Clerk proxy path is hardcoded `/api/__clerk`; in dev `proxyUrl`/`VITE_CLERK_PROXY_URL` is empty (Clerk hits dev FAPI directly) — do NOT add a dev fallback or the script load 404s.
- `publishableKeyFromHost` imports from `@clerk/react/internal` in the web app (not `@clerk/shared/keys`).
- Google-font `@import` must be the FIRST line of `index.css` (before `@import 'tailwindcss'`) or PostCSS drops it.
- OpenAPI codegen: avoid `format: uri` (unsupported `zod.url()`) and don't mix query+path params with the same name (duplicate `*Params` export).

## User preferences

- No emojis in the product UI.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
