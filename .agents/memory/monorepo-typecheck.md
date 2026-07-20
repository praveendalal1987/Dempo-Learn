---
name: Monorepo typecheck order
description: Composite lib builds must exist before per-package typechecks.
---

Run `pnpm run typecheck:libs` (which is `tsc --build`) before running a `pnpm --filter <pkg> run typecheck`.

**Why:** api-server and web packages reference composite libs (`@workspace/db`, `@workspace/integrations-openai-ai-server`, etc.) via project references. If the referenced lib `dist/*.d.ts` hasn't been built, tsc reports misleading `TS2305 has no exported member` / `TS6305 not built from source` errors for every imported symbol — the code is actually fine.
**How to apply:** Any time a `--filter` typecheck suddenly claims exports are missing across many files, build libs first and re-run before touching the source.

Also: completion code review runs typechecks against the freshly rebased tree, where `lib/*/dist` is stale — registered validations ("typecheck", "api-tests") now run `typecheck:libs` and `db push-force` first so reviews don't fail on phantom missing exports or missing columns.
