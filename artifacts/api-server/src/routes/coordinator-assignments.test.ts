import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  coursesTable,
  classSessionsTable,
  coordinatorCourseAssignmentsTable,
  notificationsTable,
  activityLogsTable,
} from "@workspace/db";

const mockGetAuth = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@clerk/express", () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
  clerkClient: {
    users: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

const { default: adminRouter } = await import("./admin");
const { default: oversightRouter } = await import("./oversight");
const { default: sessionsRouter } = await import("./sessions");
const { default: coursesRouter } = await import("./courses");

const TEST_PREFIX = "task59test";
const ADMIN_ID = `${TEST_PREFIX}_admin`;
const COORD_ID = `${TEST_PREFIX}_coord`;
const PROF_ID = `${TEST_PREFIX}_prof`;
const DEAN_ID = `${TEST_PREFIX}_dean`;
const TEST_IDS = [ADMIN_ID, COORD_ID, PROF_ID, DEAN_ID];

let assignedCourseId: number;
let otherCourseId: number;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // @ts-expect-error minimal logger stub for tests
    req.log = { warn: () => {}, info: () => {}, error: () => {} };
    next();
  });
  app.use("/api", adminRouter);
  app.use("/api", oversightRouter);
  app.use("/api", sessionsRouter);
  app.use("/api", coursesRouter);
  return app;
}

const app = buildApp();

function actAs(userId: string) {
  mockGetAuth.mockReturnValue({ userId });
}

async function cleanup(): Promise<void> {
  const courseIds = [assignedCourseId, otherCourseId].filter(Boolean);
  if (courseIds.length) {
    await db.delete(classSessionsTable).where(inArray(classSessionsTable.courseId, courseIds));
    await db.delete(coursesTable).where(inArray(coursesTable.id, courseIds));
  }
  await db
    .delete(coordinatorCourseAssignmentsTable)
    .where(inArray(coordinatorCourseAssignmentsTable.coordinatorId, TEST_IDS));
  await db.delete(notificationsTable).where(inArray(notificationsTable.userId, TEST_IDS));
  await db.delete(activityLogsTable).where(inArray(activityLogsTable.userId, TEST_IDS));
  await db.delete(usersTable).where(inArray(usersTable.id, TEST_IDS));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(usersTable).values([
    { id: ADMIN_ID, email: `${ADMIN_ID}@example.com`, role: "teacher", isAdmin: true, name: "A Admin" },
    { id: COORD_ID, email: `${COORD_ID}@example.com`, role: "course_coordinator", name: "C Coord" },
    { id: PROF_ID, email: `${PROF_ID}@example.com`, role: "teacher", name: "P Prof" },
    { id: DEAN_ID, email: `${DEAN_ID}@example.com`, role: "dean", name: "D Dean" },
  ]);
  const courses = await db
    .insert(coursesTable)
    .values([
      {
        title: "Task59 Assigned Course",
        teacherId: PROF_ID,
        inviteCode: `${TEST_PREFIX}-a-${Date.now()}`,
      },
      {
        title: "Task59 Other Course",
        teacherId: PROF_ID,
        inviteCode: `${TEST_PREFIX}-b-${Date.now()}`,
      },
    ])
    .returning();
  assignedCourseId = courses[0].id;
  otherCourseId = courses[1].id;
});

afterAll(cleanup);

beforeEach(() => {
  mockGetAuth.mockReset();
  mockGetUser.mockReset();
});

describe("admin coordinator-course assignment", () => {
  it("rejects non-admins", async () => {
    actAs(COORD_ID);
    expect((await request(app).get("/api/admin/coordinator-assignments")).status).toBe(403);
    expect(
      (
        await request(app)
          .put(`/api/admin/users/${COORD_ID}/coordinator-courses`)
          .send({ courseIds: [assignedCourseId] })
      ).status,
    ).toBe(403);
  });

  it("rejects assigning courses to a non-coordinator", async () => {
    actAs(ADMIN_ID);
    const res = await request(app)
      .put(`/api/admin/users/${PROF_ID}/coordinator-courses`)
      .send({ courseIds: [assignedCourseId] });
    expect(res.status).toBe(400);
  });

  it("rejects nonexistent course ids", async () => {
    actAs(ADMIN_ID);
    const res = await request(app)
      .put(`/api/admin/users/${COORD_ID}/coordinator-courses`)
      .send({ courseIds: [999999999] });
    expect(res.status).toBe(400);
  });

  it("assigns courses, lists them, and logs the change", async () => {
    actAs(ADMIN_ID);
    const res = await request(app)
      .put(`/api/admin/users/${COORD_ID}/coordinator-courses`)
      .send({ courseIds: [assignedCourseId] });
    expect(res.status).toBe(200);
    expect(res.body.courseIds).toEqual([assignedCourseId]);

    const overview = await request(app).get("/api/admin/coordinator-assignments");
    expect(overview.status).toBe(200);
    expect(overview.body.assignments).toContainEqual({
      coordinatorId: COORD_ID,
      courseId: assignedCourseId,
    });
    expect(
      overview.body.courses.some((c: { id: number }) => c.id === assignedCourseId),
    ).toBe(true);

    // Give the fire-and-forget log a moment.
    await new Promise((r) => setTimeout(r, 200));
    const logs = await db
      .select()
      .from(activityLogsTable)
      .where(eq(activityLogsTable.userId, ADMIN_ID));
    expect(logs.some((l) => l.action === "coordinator.courses_assigned")).toBe(true);
  });
});

describe("coordinator scoped access", () => {
  beforeEach(async () => {
    await db
      .delete(coordinatorCourseAssignmentsTable)
      .where(eq(coordinatorCourseAssignmentsTable.coordinatorId, COORD_ID));
    await db
      .insert(coordinatorCourseAssignmentsTable)
      .values({ coordinatorId: COORD_ID, courseId: assignedCourseId });
  });

  it("lists only assigned courses on /coordinator/courses and scoped /oversight/courses", async () => {
    actAs(COORD_ID);
    for (const path of ["/api/coordinator/courses", "/api/oversight/courses"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      const ids = res.body.map((c: { id: number }) => c.id);
      expect(ids).toContain(assignedCourseId);
      expect(ids).not.toContain(otherCourseId);
    }
    // Dean still sees everything.
    actAs(DEAN_ID);
    const deanRes = await request(app).get("/api/oversight/courses");
    const deanIds = deanRes.body.map((c: { id: number }) => c.id);
    expect(deanIds).toContain(otherCourseId);
    // Non-coordinators cannot use /coordinator/courses.
    expect((await request(app).get("/api/coordinator/courses")).status).toBe(403);
  });

  it("lets an assigned coordinator manage sessions, but not on unassigned courses", async () => {
    actAs(COORD_ID);
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const created = await request(app)
      .post(`/api/courses/${assignedCourseId}/sessions`)
      .send({ title: "Coord session", startsAt });
    expect(created.status).toBe(201);

    const updated = await request(app)
      .patch(`/api/sessions/${created.body.id}`)
      .send({ title: "Coord session moved", startsAt });
    expect(updated.status).toBe(200);

    // Unassigned course is off limits.
    const denied = await request(app)
      .post(`/api/courses/${otherCourseId}/sessions`)
      .send({ title: "Nope", startsAt });
    expect(denied.status).toBe(403);

    const deleted = await request(app).delete(`/api/sessions/${created.body.id}`);
    expect(deleted.status).toBe(200);

    // Session changes by coordinators are logged.
    await new Promise((r) => setTimeout(r, 200));
    const logs = await db
      .select()
      .from(activityLogsTable)
      .where(eq(activityLogsTable.userId, COORD_ID));
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("session.created_by_coordinator");
    expect(actions).toContain("session.updated_by_coordinator");
    expect(actions).toContain("session.deleted_by_coordinator");
  });

  it("lets an assigned coordinator view the course and its sessions, but not unassigned ones", async () => {
    actAs(COORD_ID);
    expect((await request(app).get(`/api/courses/${assignedCourseId}`)).status).toBe(200);
    expect((await request(app).get(`/api/courses/${assignedCourseId}/sessions`)).status).toBe(200);
    expect((await request(app).get(`/api/courses/${otherCourseId}`)).status).toBe(403);
    expect((await request(app).get(`/api/courses/${otherCourseId}/sessions`)).status).toBe(403);
    // Dean can view any course read-only.
    actAs(DEAN_ID);
    expect((await request(app).get(`/api/courses/${otherCourseId}`)).status).toBe(200);
  });

  it("clears assignments when the coordinator role is revoked", async () => {
    actAs(ADMIN_ID);
    const res = await request(app)
      .patch(`/api/admin/users/${COORD_ID}`)
      .send({ role: "student" });
    expect(res.status).toBe(200);
    const remaining = await db
      .select()
      .from(coordinatorCourseAssignmentsTable)
      .where(eq(coordinatorCourseAssignmentsTable.coordinatorId, COORD_ID));
    expect(remaining).toHaveLength(0);

    // Restore for other tests.
    await db.update(usersTable).set({ role: "course_coordinator" }).where(eq(usersTable.id, COORD_ID));
  });
});
