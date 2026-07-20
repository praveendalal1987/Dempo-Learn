---
name: Parallel task overlap on rebase
description: How to resolve rebase conflicts when a sibling task merged an overlapping feature into main mid-task.
---

Rule: If a sibling task merges its own implementation of overlapping functionality into main while your task is in review, resolve the rebase by adopting main's implementation wholesale (routes, spec, generated clients, tests, schema) and re-layer only your task's unique delta on top.

**Why:** Task 48 built per-student assignment targeting (jsonb `assignedStudentIds`) in parallel with a sibling task that merged a different design (`assignment_targets` table + `targetStudentIds` API). Keeping both would duplicate schema/endpoints; hand-merging generated orval files is error-prone.

**How to apply:** During rebase conflicts, `git checkout --ours` (main) for server routes, openapi.yaml, and generated files; also revert any of your non-conflicted side edits (db schema, helpers) that duplicated main's approach; then hand-merge only the UI/feature bits unique to your task. Push schema (`pnpm --filter @workspace/db run push-force`) before rerunning api tests — missing new tables cause mass test failures.
