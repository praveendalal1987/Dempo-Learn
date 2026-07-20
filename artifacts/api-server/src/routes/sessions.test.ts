import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  coursesTable,
  enrollmentsTable,
  classSessionsTable,
  notificationsTable,
  activityLogsTable,
} from "@workspace/db";

// ---------------------------------------------------------------------------
// Mock Clerk: control the authenticated user id + the Clerk profile lookup.
// ---------------------------------------------------------------------------
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

const { default: sessionsRouter } = await import("./sessions");
const { default: notificationsRouter } = await import("./notifications");

const TEST_PREFIX = "task17test";
const TEACHER_ID = `${TEST_PREFIX}_teacher`;
const STUDENT_ID = `${TEST_PREFIX}_student`;
const OUTSIDER_ID = `${TEST_PREFIX}_outsider`;
const TEST_IDS = [TEACHER_ID, STUDENT_ID, OUTSIDER_ID];

let courseId: number;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // @ts-expect-error minimal logger stub for tests
    req.log = { warn: () => {}, info: () => {}, error: () => {} };
    next();
  });
  app.use("/api", sessionsRouter);
  app.use("/api", notificationsRouter);
  return app;
}

const app = buildApp();

function actAs(userId: string) {
  mockGetAuth.mockReturnValue({ userId });
}

async function cleanup(): Promise<void> {
  if (courseId) {
    await db.delete(classSessionsTable).where(eq(classSessionsTable.courseId, courseId));
    await db.delete(enrollmentsTable).where(eq(enrollmentsTable.courseId, courseId));
    await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
  }
  await db.delete(notificationsTable).where(inArray(notificationsTable.userId, TEST_IDS));
  await db.delete(activityLogsTable).where(inArray(activityLogsTable.userId, TEST_IDS));
  await db.delete(usersTable).where(inArray(usersTable.id, TEST_IDS));
}

beforeAll(async () => {
  await db.delete(notificationsTable).where(inArray(notificationsTable.userId, TEST_IDS));
  await db.delete(usersTable).where(inArray(usersTable.id, TEST_IDS));
  await db.insert(usersTable).values([
    { id: TEACHER_ID, email: `${TEACHER_ID}@example.com`, role: "teacher", name: "T Teacher" },
    { id: STUDENT_ID, email: `${STUDENT_ID}@example.com`, role: "student", name: "S Student" },
    { id: OUTSIDER_ID, email: `${OUTSIDER_ID}@example.com`, role: "student", name: "O Outsider" },
  ]);
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: "Task17 Test Course",
      teacherId: TEACHER_ID,
      inviteCode: `${TEST_PREFIX}-${Date.now()}`,
    })
    .returning();
  courseId = course.id;
  await db.insert(enrollmentsTable).values({ courseId, studentId: STUDENT_ID });
});

afterAll(cleanup);

beforeEach(() => {
  mockGetAuth.mockReset();
  mockGetUser.mockReset();
});

describe("class sessions", () => {
  it("rejects unauthenticated requests", async () => {
    mockGetAuth.mockReturnValue({ userId: null });
    const res = await request(app).get(`/api/courses/${courseId}/sessions`);
    expect(res.status).toBe(401);
  });

  it("forbids students from creating sessions", async () => {
    actAs(STUDENT_ID);
    const res = await request(app)
      .post(`/api/courses/${courseId}/sessions`)
      .send({ title: "Nope", startsAt: new Date(Date.now() + 3600_000).toISOString() });
    expect(res.status).toBe(403);
  });

  it("lets the teacher create a session and notifies enrolled students", async () => {
    actAs(TEACHER_ID);
    const startsAt = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
    const res = await request(app)
      .post(`/api/courses/${courseId}/sessions`)
      .send({ title: "Live lecture", startsAt, location: "https://meet.example.com/x" });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Live lecture");
    expect(res.body.courseTitle).toBe("Task17 Test Course");

    // fan-out is fire-and-forget; give it a moment
    await new Promise((r) => setTimeout(r, 300));
    const notifs = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, STUDENT_ID));
    expect(notifs.some((n) => n.type === "class.scheduled" && n.refId === res.body.id)).toBe(true);
    // outsider not notified
    const outsiderNotifs = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, OUTSIDER_ID));
    expect(outsiderNotifs.length).toBe(0);
  });

  it("rejects sessions where end precedes start", async () => {
    actAs(TEACHER_ID);
    const start = new Date(Date.now() + 3600_000);
    const res = await request(app)
      .post(`/api/courses/${courseId}/sessions`)
      .send({
        title: "Bad times",
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() - 1000).toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it("lets an enrolled student list sessions but not an outsider", async () => {
    actAs(STUDENT_ID);
    const ok = await request(app).get(`/api/courses/${courseId}/sessions`);
    expect(ok.status).toBe(200);
    expect(ok.body.length).toBeGreaterThan(0);

    actAs(OUTSIDER_ID);
    const forbidden = await request(app).get(`/api/courses/${courseId}/sessions`);
    expect(forbidden.status).toBe(403);
  });

  it("lets the teacher update and delete a session", async () => {
    actAs(TEACHER_ID);
    const [session] = await db
      .select()
      .from(classSessionsTable)
      .where(eq(classSessionsTable.courseId, courseId));

    const upd = await request(app)
      .patch(`/api/sessions/${session.id}`)
      .send({ title: "Renamed", startsAt: session.startsAt.toISOString() });
    expect(upd.status).toBe(200);
    expect(upd.body.title).toBe("Renamed");

    actAs(STUDENT_ID);
    const noDel = await request(app).delete(`/api/sessions/${session.id}`);
    expect(noDel.status).toBe(403);

    actAs(TEACHER_ID);
    const del = await request(app).delete(`/api/sessions/${session.id}`);
    expect(del.status).toBe(200);
    const remaining = await db
      .select()
      .from(classSessionsTable)
      .where(eq(classSessionsTable.id, session.id));
    expect(remaining.length).toBe(0);
  });
});

describe("calendar", () => {
  it("returns sessions for the student's enrolled courses", async () => {
    actAs(TEACHER_ID);
    await request(app)
      .post(`/api/courses/${courseId}/sessions`)
      .send({ title: "Calendar session", startsAt: new Date(Date.now() + 48 * 3600_000).toISOString() });

    actAs(STUDENT_ID);
    const res = await request(app).get("/api/calendar");
    expect(res.status).toBe(200);
    expect(res.body.sessions.some((s: any) => s.title === "Calendar session")).toBe(true);

    actAs(OUTSIDER_ID);
    const empty = await request(app).get("/api/calendar");
    expect(empty.status).toBe(200);
    expect(empty.body.sessions.length).toBe(0);
  });
});

describe("notifications", () => {
  it("lists notifications with unread count and marks them read", async () => {
    await db.insert(notificationsTable).values({
      userId: STUDENT_ID,
      type: "assignment.created",
      title: "Test notif",
      link: "/assignment/1",
    });

    actAs(STUDENT_ID);
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBeGreaterThan(0);
    const notif = res.body.notifications.find((n: any) => n.title === "Test notif");
    expect(notif).toBeTruthy();

    const mark = await request(app)
      .post("/api/notifications/read")
      .send({ ids: [notif.id] });
    expect(mark.status).toBe(200);

    const after = await request(app).get("/api/notifications");
    const marked = after.body.notifications.find((n: any) => n.id === notif.id);
    expect(marked.readAt).toBeTruthy();
  });

  it("cannot mark another user's notifications read", async () => {
    const [foreign] = await db
      .insert(notificationsTable)
      .values({ userId: TEACHER_ID, type: "x", title: "Teacher notif" })
      .returning();

    actAs(STUDENT_ID);
    await request(app).post("/api/notifications/read").send({ ids: [foreign.id] });
    const [row] = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, foreign.id));
    expect(row.readAt).toBeNull();
  });

  it("generates a class reminder for sessions within 24h, deduped", async () => {
    actAs(TEACHER_ID);
    const soon = await request(app)
      .post(`/api/courses/${courseId}/sessions`)
      .send({ title: "Soon class", startsAt: new Date(Date.now() + 2 * 3600_000).toISOString() });
    expect(soon.status).toBe(201);

    actAs(STUDENT_ID);
    await request(app).get("/api/notifications");
    await request(app).get("/api/notifications");

    const reminders = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, STUDENT_ID));
    const forSession = reminders.filter(
      (n) => n.type === "class.reminder" && n.refId === soon.body.id,
    );
    expect(forSession.length).toBe(1);
  });
});
