---
name: API server testing pattern
description: How to write API access-control tests in this monorepo
---
Tests use vitest + supertest, mocking only `@clerk/express` (`getAuth`, `clerkClient.users.getUser`) and hitting the real dev database via `@workspace/db`.

**Why:** Drizzle query chains are painful to mock; the dev DB is always available (`DATABASE_URL` set), so integration-style tests are simpler and actually verify filters/pagination SQL.

**How to apply:** Mount only the router under test in a minimal express app, stub `req.log` (pino-http isn't mounted), use unique test-id prefixes and clean up in beforeAll/afterAll. If a relation is missing, run `pnpm --filter @workspace/db run push` first. Run with `pnpm --filter @workspace/api-server test`.
