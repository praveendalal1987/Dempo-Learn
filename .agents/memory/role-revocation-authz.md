---
name: Role revocation must be role-aware, not id-based
description: Why teacher/owner checks must verify the current role, not just ownership ids
---

The rule: any "is the owner/teacher" check must also verify the user's *current* role (`user.role === "teacher"`), never just `course.teacherId === userId`.

**Why:** When an admin demotes a teacher, `course.teacherId` stays behind; id-only checks let the demoted user keep privileged access via direct API calls. Completion review rejected the remove-teacher task twice for exactly this class of gap (also: submission create/read paths that used `isEnrolled` only and bypassed the `course.isActive` policy).

**How to apply:** Route privilege checks through `artifacts/api-server/src/lib/authz.ts` (`isCourseTeacher(course, user)` / `canAccessCourse(course, user)` take a `{id, role}` user, and `getActiveEnrolledCourseIds` filters deactivated courses). When adding new course-scoped endpoints, use these helpers rather than comparing ids or querying enrollments directly, and add a regression test that a demoted teacher gets 403.

**Recurring pitfall:** some older call sites pass a raw user-id string to `isCourseTeacher`/`canAccessCourse` (which expect `{id, role}`), silently bypassing the role check until typecheck catches it. When touching authz helpers, grep for `(course, req.userId` and fix to `req.localUser!`.
