import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { inArray, eq } from "drizzle-orm";
import {
  db,
  usersTable,
  coursesTable,
  enrollmentsTable,
  assignmentsTable,
  submissionsTable,
  submissionSimilaritiesTable,
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

const { default: submissionsRouter } = await import("./submissions");

const TEST_PREFIX = "task44test";
const TEACHER_ID = `${TEST_PREFIX}_teacher`;
const OTHER_TEACHER = `${TEST_PREFIX}_teach2`;
const ALICE = `${TEST_PREFIX}_alice`;
const BOB = `${TEST_PREFIX}_bob`;
const ALL_IDS = [TEACHER_ID, OTHER_TEACHER, ALICE, BOB];

let courseId: number;
let assignment1Id: number;
let assignment2Id: number;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // @ts-expect-error minimal logger stub for tests
    req.log = { warn: () => {}, info: () => {}, error: () => {} };
    next();
  });
  app.use("/api", submissionsRouter);
  return app;
}

const app = buildApp();

function asUser(userId: string) {
  mockGetAuth.mockReturnValue({ userId });
}

async function cleanup(): Promise<void> {
  const courses = await db
    .select()
    .from(coursesTable)
    .where(inArray(coursesTable.teacherId, [TEACHER_ID, OTHER_TEACHER]));
  const ids = courses.map((c) => c.id);
  if (ids.length) {
    const assignments = await db
      .select()
      .from(assignmentsTable)
      .where(inArray(assignmentsTable.courseId, ids));
    const aIds = assignments.map((a) => a.id);
    if (aIds.length) {
      await db
        .delete(submissionSimilaritiesTable)
        .where(inArray(submissionSimilaritiesTable.assignmentId, aIds));
      await db
        .delete(submissionsTable)
        .where(inArray(submissionsTable.assignmentId, aIds));
    }
    await db
      .delete(assignmentsTable)
      .where(inArray(assignmentsTable.courseId, ids));
    await db
      .delete(enrollmentsTable)
      .where(inArray(enrollmentsTable.courseId, ids));
    await db.delete(coursesTable).where(inArray(coursesTable.id, ids));
  }
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_IDS));
}

beforeAll(async () => {
  await cleanup();

  await db.insert(usersTable).values([
    { id: TEACHER_ID, email: `${TEACHER_ID}@example.com`, role: "teacher", name: "Teach" },
    { id: OTHER_TEACHER, email: `${OTHER_TEACHER}@example.com`, role: "teacher", name: "Other" },
    { id: ALICE, email: `${ALICE}@example.com`, role: "student", name: "Alice" },
    { id: BOB, email: `${BOB}@example.com`, role: "student", name: "Bob" },
  ]);

  const [course] = await db
    .insert(coursesTable)
    .values({ title: "Integrity Course", teacherId: TEACHER_ID, inviteCode: "T44AAA" })
    .returning();
  courseId = course!.id;

  await db.insert(enrollmentsTable).values([
    { courseId, studentId: ALICE },
    { courseId, studentId: BOB },
  ]);

  const [a1] = await db
    .insert(assignmentsTable)
    .values({ courseId, title: "Essay One", allowedTypes: ["text"], maxScore: 100 })
    .returning();
  const [a2] = await db
    .insert(assignmentsTable)
    .values({ courseId, title: "Essay Two", allowedTypes: ["text"], maxScore: 100 })
    .returning();
  assignment1Id = a1!.id;
  assignment2Id = a2!.id;

  // Seed submissions + flagged pairs on both assignments directly.
  const subs = await db
    .insert(submissionsTable)
    .values([
      { assignmentId: assignment1Id, studentId: ALICE, textResponse: "same text" },
      { assignmentId: assignment1Id, studentId: BOB, textResponse: "same text" },
      { assignmentId: assignment2Id, studentId: ALICE, textResponse: "other text" },
      { assignmentId: assignment2Id, studentId: BOB, textResponse: "other text" },
    ])
    .returning();

  await db.insert(submissionSimilaritiesTable).values([
    {
      assignmentId: assignment1Id,
      submissionAId: Math.min(subs[0]!.id, subs[1]!.id),
      submissionBId: Math.max(subs[0]!.id, subs[1]!.id),
      score: 100,
    },
    {
      assignmentId: assignment2Id,
      submissionAId: Math.min(subs[2]!.id, subs[3]!.id),
      submissionBId: Math.max(subs[2]!.id, subs[3]!.id),
      score: 55,
    },
  ]);
});

afterAll(cleanup);

beforeEach(() => {
  mockGetAuth.mockReset();
  mockGetUser.mockReset();
});

describe("course-level similarity overview", () => {
  it("returns all flagged pairs across assignments for the course teacher", async () => {
    asUser(TEACHER_ID);
    const res = await request(app).get(`/api/courses/${courseId}/similarities`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // Sorted by score descending.
    expect(res.body[0].score).toBe(100);
    expect(res.body[0].assignmentTitle).toBe("Essay One");
    expect(res.body[1].score).toBe(55);
    expect(res.body[1].assignmentTitle).toBe("Essay Two");
    const names = [
      res.body[0].submissionA.studentName,
      res.body[0].submissionB.studentName,
    ].sort();
    expect(names).toEqual(["Alice", "Bob"]);
    expect(res.body[0].submissionA.submissionId).toBeTypeOf("number");
    expect(res.body[0].computedAt).toBeTruthy();
  });

  it("students cannot view the course integrity overview", async () => {
    asUser(ALICE);
    const res = await request(app).get(`/api/courses/${courseId}/similarities`);
    expect(res.status).toBe(403);
  });

  it("a different teacher cannot view another teacher's course overview", async () => {
    asUser(OTHER_TEACHER);
    const res = await request(app).get(`/api/courses/${courseId}/similarities`);
    expect(res.status).toBe(403);
  });

  it("404s for a missing course", async () => {
    asUser(TEACHER_ID);
    const res = await request(app).get(`/api/courses/999999/similarities`);
    expect(res.status).toBe(404);
  });

  it("teacher can dismiss and restore a flagged pair", async () => {
    asUser(TEACHER_ID);
    const list = await request(app).get(`/api/courses/${courseId}/similarities`);
    const pairId = list.body[0].id;

    const dismiss = await request(app)
      .patch(`/api/similarities/${pairId}/dismissal`)
      .send({ dismissed: true });
    expect(dismiss.status).toBe(200);
    expect(dismiss.body.dismissedAt).toBeTruthy();

    const after = await request(app).get(`/api/courses/${courseId}/similarities`);
    const pair = after.body.find((p: { id: number }) => p.id === pairId);
    expect(pair.dismissedAt).toBeTruthy();

    const restore = await request(app)
      .patch(`/api/similarities/${pairId}/dismissal`)
      .send({ dismissed: false });
    expect(restore.status).toBe(200);
    expect(restore.body.dismissedAt).toBeNull();
  });

  it("students and other teachers cannot dismiss a pair", async () => {
    asUser(TEACHER_ID);
    const list = await request(app).get(`/api/courses/${courseId}/similarities`);
    const pairId = list.body[0].id;

    asUser(ALICE);
    const asStudent = await request(app)
      .patch(`/api/similarities/${pairId}/dismissal`)
      .send({ dismissed: true });
    expect(asStudent.status).toBe(403);

    asUser(OTHER_TEACHER);
    const asOther = await request(app)
      .patch(`/api/similarities/${pairId}/dismissal`)
      .send({ dismissed: true });
    expect(asOther.status).toBe(403);
  });

  it("404s when dismissing a missing pair", async () => {
    asUser(TEACHER_ID);
    const res = await request(app)
      .patch(`/api/similarities/999999/dismissal`)
      .send({ dismissed: true });
    expect(res.status).toBe(404);
  });

  it("dismissal survives a similarity re-run", async () => {
    asUser(TEACHER_ID);
    const list = await request(app).get(`/api/courses/${courseId}/similarities`);
    const pairId = list.body[0].id;
    const assignmentId = list.body[0].assignmentId;

    await request(app)
      .patch(`/api/similarities/${pairId}/dismissal`)
      .send({ dismissed: true });

    const rerun = await request(app).post(
      `/api/assignments/${assignmentId}/similarity`,
    );
    expect(rerun.status).toBe(200);

    const after = await request(app).get(`/api/courses/${courseId}/similarities`);
    const pair = after.body.find(
      (p: { assignmentId: number }) => p.assignmentId === assignmentId,
    );
    expect(pair).toBeTruthy();
    expect(pair.dismissedAt).toBeTruthy();

    // Restore so other tests are unaffected.
    await request(app)
      .patch(`/api/similarities/${pair.id}/dismissal`)
      .send({ dismissed: false });
  });

  it("returns an empty list for a course with no flags", async () => {
    const [empty] = await db
      .insert(coursesTable)
      .values({ title: "Empty Course", teacherId: TEACHER_ID, inviteCode: "T44BBB" })
      .returning();
    asUser(TEACHER_ID);
    const res = await request(app).get(`/api/courses/${empty!.id}/similarities`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    await db.delete(coursesTable).where(eq(coursesTable.id, empty!.id));
  });
});
