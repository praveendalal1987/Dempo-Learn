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
  feedbackNotesTable,
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

const { default: oversightRouter } = await import("./oversight");
const { default: feedbackRouter } = await import("./feedback");
const { default: sessionsRouter } = await import("./sessions");
const { default: coursesRouter } = await import("./courses");
const { default: submissionsRouter } = await import("./submissions");

const TEST_PREFIX = "task69test";
const DEAN_ID = `${TEST_PREFIX}_dean`;
const COORD_ID = `${TEST_PREFIX}_coord`;
const PROF_ID = `${TEST_PREFIX}_prof`;
const STUDENT_ID = `${TEST_PREFIX}_student`;
const TEST_IDS = [DEAN_ID, COORD_ID, PROF_ID, STUDENT_ID];

let courseId: number;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // @ts-expect-error minimal logger stub for tests
    req.log = { warn: () => {}, info: () => {}, error: () => {} };
    next();
  });
  app.use("/api", oversightRouter);
  app.use("/api", feedbackRouter);
  app.use("/api", sessionsRouter);
  app.use("/api", coursesRouter);
  app.use("/api", submissionsRouter);
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
  await db
    .delete(coordinatorCourseAssignmentsTable)
    .where(inArray(coordinatorCourseAssignmentsTable.coordinatorId, TEST_IDS));
  await db.delete(feedbackNotesTable).where(inArray(feedbackNotesTable.senderId, TEST_IDS));
  await db.delete(notificationsTable).where(inArray(notificationsTable.userId, TEST_IDS));
  await db.delete(activityLogsTable).where(inArray(activityLogsTable.userId, TEST_IDS));
  await db.delete(usersTable).where(inArray(usersTable.id, TEST_IDS));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(usersTable).values([
    { id: DEAN_ID, email: `${DEAN_ID}@example.com`, role: "dean", name: "D Dean" },
    { id: COORD_ID, email: `${COORD_ID}@example.com`, role: "course_coordinator", name: "C Coord" },
    { id: PROF_ID, email: `${PROF_ID}@example.com`, role: "teacher", name: "P Prof" },
    { id: STUDENT_ID, email: `${STUDENT_ID}@example.com`, role: "student", name: "S Student" },
  ]);
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: "Task69 Test Course",
      teacherId: PROF_ID,
      inviteCode: `${TEST_PREFIX}-${Date.now()}`,
    })
    .returning();
  courseId = course.id;
});

afterAll(cleanup);

beforeEach(() => {
  mockGetAuth.mockReset();
  mockGetUser.mockReset();
});

describe("oversight endpoints", () => {
  it("allows dean to list all courses; coordinator only sees assigned ones", async () => {
    actAs(DEAN_ID);
    const deanRes = await request(app).get("/api/oversight/courses");
    expect(deanRes.status).toBe(200);
    expect(deanRes.body.some((c: { id: number }) => c.id === courseId)).toBe(true);

    // Coordinator without an assignment sees an empty scoped list.
    actAs(COORD_ID);
    const coordRes = await request(app).get("/api/oversight/courses");
    expect(coordRes.status).toBe(200);
    expect(coordRes.body.some((c: { id: number }) => c.id === courseId)).toBe(false);
  });

  it("rejects students and professors from oversight", async () => {
    for (const user of [STUDENT_ID, PROF_ID]) {
      actAs(user);
      const res = await request(app).get("/api/oversight/courses");
      expect(res.status).toBe(403);
    }
  });

  it("lists both professors and coordinators as feedback recipients", async () => {
    actAs(DEAN_ID);
    const res = await request(app).get("/api/oversight/professors");
    expect(res.status).toBe(200);
    const roles = new Map(
      res.body.map((p: { id: string; role: string }) => [p.id, p.role]),
    );
    expect(roles.get(PROF_ID)).toBe("teacher");
    expect(roles.get(COORD_ID)).toBe("course_coordinator");
  });

  it("restricts professor and integrity lists to deans", async () => {
    for (const path of ["/api/oversight/professors", "/api/oversight/integrity"]) {
      actAs(DEAN_ID);
      expect((await request(app).get(path)).status).toBe(200);
      actAs(COORD_ID);
      expect((await request(app).get(path)).status).toBe(403);
    }
  });
});

describe("feedback endpoints", () => {
  it("lets a dean send feedback to a course coordinator", async () => {
    actAs(DEAN_ID);
    const sent = await request(app)
      .post("/api/feedback")
      .send({ recipientId: COORD_ID, body: "Scheduling looks tidy this term." });
    expect(sent.status).toBe(201);

    actAs(COORD_ID);
    const inbox = await request(app).get("/api/feedback");
    expect(inbox.status).toBe(200);
    expect(inbox.body.received.some((n: { id: number }) => n.id === sent.body.id)).toBe(true);
  });

  it("lets a dean send feedback to a professor, who can read it", async () => {
    actAs(DEAN_ID);
    const sent = await request(app)
      .post("/api/feedback")
      .send({ recipientId: PROF_ID, subject: "Nice work", body: "Great course engagement." });
    expect(sent.status).toBe(201);

    actAs(PROF_ID);
    const inbox = await request(app).get("/api/feedback");
    expect(inbox.status).toBe(200);
    expect(inbox.body.received.some((n: { id: number }) => n.id === sent.body.id)).toBe(true);

    const read = await request(app).post(`/api/feedback/${sent.body.id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.readAt).toBeTruthy();
  });

  it("rejects non-deans from sending and students from reading", async () => {
    for (const user of [PROF_ID, COORD_ID, STUDENT_ID]) {
      actAs(user);
      const res = await request(app)
        .post("/api/feedback")
        .send({ recipientId: PROF_ID, body: "nope" });
      expect(res.status).toBe(403);
    }
    actAs(STUDENT_ID);
    expect((await request(app).get("/api/feedback")).status).toBe(403);
  });

  it("rejects feedback addressed to students", async () => {
    actAs(DEAN_ID);
    const res = await request(app)
      .post("/api/feedback")
      .send({ recipientId: STUDENT_ID, body: "not allowed" });
    expect(res.status).toBe(400);
  });
});

describe("oversight roles cannot mutate course content", () => {
  it("cannot join courses or submit work", async () => {
    for (const user of [DEAN_ID, COORD_ID]) {
      actAs(user);
      const join = await request(app)
        .post("/api/courses/join")
        .send({ inviteCode: "ANYCODE" });
      expect(join.status).toBe(403);
    }
    // Even if somehow enrolled, submission creation is denied by role.
    await db
      .insert(enrollmentsTable)
      .values({ courseId, studentId: DEAN_ID })
      .onConflictDoNothing();
    actAs(DEAN_ID);
    const submit = await request(app)
      .post("/api/assignments/999999/submissions")
      .send({ text: "hi" });
    expect([403, 404]).toContain(submit.status);
    await db.delete(enrollmentsTable).where(eq(enrollmentsTable.studentId, DEAN_ID));
  });

  it("assigned coordinator can create a session but dean cannot", async () => {
    const body = { title: "Slot 1", startsAt: new Date(Date.now() + 86400000).toISOString() };
    // Coordinators may only schedule for courses assigned to them.
    await db
      .insert(coordinatorCourseAssignmentsTable)
      .values({ coordinatorId: COORD_ID, courseId })
      .onConflictDoNothing();
    actAs(COORD_ID);
    const coord = await request(app)
      .post(`/api/courses/${courseId}/sessions`)
      .send(body);
    expect(coord.status).toBe(201);

    actAs(DEAN_ID);
    const dean = await request(app)
      .post(`/api/courses/${courseId}/sessions`)
      .send(body);
    expect(dean.status).toBe(403);
  });
});
