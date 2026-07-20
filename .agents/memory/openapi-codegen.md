---
name: OpenAPI codegen gotchas
description: Orval/zod codegen constraints for lib/api-spec, plus the project React version.
---

- Do NOT use `format: uri` on string schemas — codegen emits `zod.url()` which is unsupported and fails generation. Leave the field a plain string.
- Do NOT declare a query param and a path param with the same name on one operation — Orval emits a duplicate `<Op>Params` export (TS2308).
- The project uses **React 19** (catalog `react: 19.1.0`, `@types/react: 19`), not React 18. Root `package.json` pins react/react-dom to 19.1.0 via pnpm overrides.

**How to apply:** When editing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` and fix these two shapes if codegen fails; write client code against React 19 APIs.

- Query params with `format: date-time` generate `zod.date()` WITHOUT coercion in api-zod — coerce query strings to Date in the route before safeParse (see admin logs route).
