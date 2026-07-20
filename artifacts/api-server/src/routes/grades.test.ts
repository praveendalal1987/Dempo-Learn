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

const { default: gradesRouter } = await import("./grades");

const TEST_PREFIX = "task16test";
const TEACHER_ID = `${TEST_PREFIX}_teacher`;
const ALICE = `${TEST_PREFIX}_alice`;
const BOB = `${TEST_PREFIX}_bob`;
const CARA = `${TEST_PREFIX}_cara`;
const OUTSIDER = `${TEST_PREFIX}_outsider`;
const ALL_IDS = [TEACHER_ID, ALICE, BOB, CARA, OUTSIDER];

let courseId: number;
let emptyCourseId: number;
let a1: number; // maxScore 100
let a2: number; // maxScore 50

function buildApp(): Express {
  const app = express();
  app.use((req, _res, next) => {
    // @ts-expect-error minimal logger stub for tests
    req.log = { warn: () => {}, info: () => {}, error: () => {} };
    next();
  });
  app.use("/api", gradesRouter);
  return app;
}

const app = buildApp();

async function cleanup(): Promise<void> {
  const courses = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.teacherId, TEACHER_ID));
  const ids = courses.map((c) => c.id);
  if (ids.length) {
    const assignments = await db
      .select()
      .from(assignmentsTable)
      .where(inArray(assignmentsTable.courseId, ids));
    const aIds = assignments.map((a) => a.id);
    if (aIds.length)
      await db
        .delete(submissionsTable)
        .where(inArray(submissionsTable.assignmentId, aIds));
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
    { id: ALICE, email: `${ALICE}@example.com`, role: "student", name: "Alice" },
    { id: BOB, email: `${BOB}@example.com`, role: "student", name: "Bob" },
    { id: CARA, email: `${CARA}@example.com`, role: "student", name: "Cara" },
    { id: OUTSIDER, email: `${OUTSIDER}@example.com`, role: "student", name: "Out" },
  ]);

  const [course] = await db
    .insert(coursesTable)
    .values({ title: "Grades Test Course", teacherId: TEACHER_ID, inviteCode: "T16AAA" })
    .returning();
  courseId = course!.id;

  const [empty] = await db
    .insert(coursesTable)
    .values({ title: "Empty Course", teacherId: TEACHER_ID, inviteCode: "T16BBB" })
    .returning();
  emptyCourseId = empty!.id;

  await db.insert(enrollmentsTable).values([
    { courseId, studentId: ALICE },
    { courseId, studentId: BOB },
    { courseId, studentId: CARA },
    { courseId: emptyCourseId, studentId: ALICE },
  ]);

  const [as1] = await db
    .insert(assignmentsTable)
    .values({ courseId, title: "HW 1", allowedTypes: ["text"], maxScore: 100 })
    .returning();
  const [as2] = await db
    .insert(assignmentsTable)
    .values({ courseId, title: "HW 2", allowedTypes: ["text"], maxScore: 50 })
    .returning();
  a1 = as1!.id;
  a2 = as2!.id;

  await db.insert(submissionsTable).values([
    // Alice: 80/100 graded w/ feedback, 40/50 graded => avg (80 + 80)/2 = 80
    { assignmentId: a1, studentId: ALICE, status: "graded", score: 80, feedback: "Nice work", textResponse: "x" },
    { assignmentId: a2, studentId: ALICE, status: "graded", score: 40, textResponse: "x" },
    // Bob: one graded 100/100, one ungraded => avg 100
    { assignmentId: a1, studentId: BOB, status: "graded", score: 100, textResponse: "x" },
    { assignmentId: a2, studentId: BOB, status: "submitted", textResponse: "x" },
    // Cara: nothing graded, one submitted
    { assignmentId: a1, studentId: CARA, status: "submitted", textResponse: "x" },
  ]);
});

afterAll(cleanup);

beforeEach(() => {
  mockGetAuth.mockReset();
  mockGetUser.mockReset();
});

describe("GET /api/courses/:courseId/my-stats", () => {
  it("returns 401 unauthenticated", async () => {
    mockGetAuth.mockReturnValue({ userId: null });
    const res = await request(app).get(`/api/courses/${courseId}/my-stats`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-member", async () => {
    mockGetAuth.mockReturnValue({ userId: OUTSIDER });
    const res = await request(app).get(`/api/courses/${courseId}/my-stats`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a missing course", async () => {
    mockGetAuth.mockReturnValue({ userId: ALICE });
    const res = await request(app).get(`/api/courses/999999/my-stats`);
    expect(res.status).toBe(404);
  });

  it("computes overall score, progress and submission summaries", async () => {
    mockGetAuth.mockReturnValue({ userId: ALICE });
    const res = await request(app).get(`/api/courses/${courseId}/my-stats`);
    expect(res.status).toBe(200);
    expect(res.body.overallScore).toBe(80);
    expect(res.body.totalAssignments).toBe(2);
    expect(res.body.completedCount).toBe(2);
    expect(res.body.gradedCount).toBe(2);
    expect(res.body.submissions).toHaveLength(2);

    const hw1 = res.body.submissions.find(
      (s: { assignmentId: number }) => s.assignmentId === a1,
    );
    expect(hw1.assignmentTitle).toBe("HW 1");
    expect(hw1.status).toBe("graded");
    expect(hw1.score).toBe(80);
    expect(hw1.maxScore).toBe(100);
    expect(hw1.hasFeedback).toBe(true);

    const hw2 = res.body.submissions.find(
      (s: { assignmentId: number }) => s.assignmentId === a2,
    );
    expect(hw2.hasFeedback).toBe(false);
  });

  it("returns a sensible empty state when nothing is graded", async () => {
    mockGetAuth.mockReturnValue({ userId: CARA });
    const res = await request(app).get(`/api/courses/${courseId}/my-stats`);
    expect(res.status).toBe(200);
    expect(res.body.overallScore).toBeNull();
    expect(res.body.gradedCount).toBe(0);
    expect(res.body.completedCount).toBe(1);
  });

  it("handles a course with no assignments", async () => {
    mockGetAuth.mockReturnValue({ userId: ALICE });
    const res = await request(app).get(`/api/courses/${emptyCourseId}/my-stats`);
    expect(res.status).toBe(200);
    expect(res.body.totalAssignments).toBe(0);
    expect(res.body.overallScore).toBeNull();
    expect(res.body.submissions).toHaveLength(0);
  });
});

describe("GET /api/courses/:courseId/leaderboard", () => {
  it("returns 403 for a non-member", async () => {
    mockGetAuth.mockReturnValue({ userId: OUTSIDER });
    const res = await request(app).get(`/api/courses/${courseId}/leaderboard`);
    expect(res.status).toBe(403);
  });

  it("ranks students by overall score with viewer flagged, names only", async () => {
    mockGetAuth.mockReturnValue({ userId: ALICE });
    const res = await request(app).get(`/api/courses/${courseId}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);

    const [first, second, third] = res.body.entries;
    expect(first.name).toBe("Bob");
    expect(first.rank).toBe(1);
    expect(first.overallScore).toBe(100);
    expect(second.name).toBe("Alice");
    expect(second.rank).toBe(2);
    expect(second.isMe).toBe(true);
    expect(third.name).toBe("Cara");
    expect(third.overallScore).toBeNull();

    expect(res.body.myRank).toBe(2);
    // No emails exposed
    for (const e of res.body.entries) expect(e.email).toBeUndefined();
  });

  it("allows the course teacher to view, with null myRank", async () => {
    mockGetAuth.mockReturnValue({ userId: TEACHER_ID });
    const res = await request(app).get(`/api/courses/${courseId}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.myRank).toBeNull();
  });

  it("returns an empty leaderboard for a course with no submissions", async () => {
    mockGetAuth.mockReturnValue({ userId: ALICE });
    const res = await request(app).get(
      `/api/courses/${emptyCourseId}/leaderboard`,
    );
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].overallScore).toBeNull();
  });
});
