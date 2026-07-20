import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  coursesTable,
  enrollmentsTable,
  invitesTable,
  cohortsTable,
  cohortMembersTable,
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

const { default: cohortsRouter } = await import("./cohorts");

const TEST_PREFIX = "task42test";
const TEACHER_ID = `${TEST_PREFIX}_teacher`;
const OTHER_TEACHER_ID = `${TEST_PREFIX}_teacher2`;
const STUDENT_ID = `${TEST_PREFIX}_student`;
const STUDENT2_ID = `${TEST_PREFIX}_student2`;
const TEST_IDS = [TEACHER_ID, OTHER_TEACHER_ID, STUDENT_ID, STUDENT2_ID];

let courseId: number;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // @ts-expect-error minimal logger stub for tests
    req.log = { warn: () => {}, info: () => {}, error: () => {} };
    next();
  });
  app.use("/api", cohortsRouter);
  return app;
}

const app = buildApp();

function actAs(userId: string) {
  mockGetAuth.mockReturnValue({ userId });
}

async function cleanup(): Promise<void> {
  const cohorts = await db
    .select()
    .from(cohortsTable)
    .where(inArray(cohortsTable.teacherId, TEST_IDS));
  const cohortIds = cohorts.map((c) => c.id);
  if (cohortIds.length) {
    await db
      .delete(cohortMembersTable)
      .where(inArray(cohortMembersTable.cohortId, cohortIds));
    await db.delete(cohortsTable).where(inArray(cohortsTable.id, cohortIds));
  }
  if (courseId) {
    await db.delete(invitesTable).where(eq(invitesTable.courseId, courseId));
    await db.delete(enrollmentsTable).where(eq(enrollmentsTable.courseId, courseId));
    await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
  }
  await db.delete(usersTable).where(inArray(usersTable.id, TEST_IDS));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(usersTable).values([
    { id: TEACHER_ID, email: `${TEACHER_ID}@example.com`, role: "teacher", name: "T One" },
    { id: OTHER_TEACHER_ID, email: `${OTHER_TEACHER_ID}@example.com`, role: "teacher", name: "T Two" },
    { id: STUDENT_ID, email: `${STUDENT_ID}@example.com`, role: "student", name: "S One" },
    { id: STUDENT2_ID, email: `${STUDENT2_ID}@example.com`, role: "student", name: "S Two" },
  ]);
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: "Task42 Test Course",
      teacherId: TEACHER_ID,
      inviteCode: "T42TST",
    })
    .returning();
  courseId = course.id;
  await db.insert(enrollmentsTable).values({ courseId, studentId: STUDENT_ID });
});

afterAll(async () => {
  await cleanup();
});

describe("cohorts", () => {
  let cohortId: number;

  it("students cannot access cohorts", async () => {
    actAs(STUDENT_ID);
    const res = await request(app).get("/api/cohorts");
    expect(res.status).toBe(403);
  });

  it("teacher can create a cohort", async () => {
    actAs(TEACHER_ID);
    const res = await request(app)
      .post("/api/cohorts")
      .send({ name: "Year 10", description: "Test", type: "year" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Year 10");
    expect(res.body.memberCount).toBe(0);
    cohortId = res.body.id;
  });

  it("lists cohorts with type filter", async () => {
    actAs(TEACHER_ID);
    const all = await request(app).get("/api/cohorts");
    expect(all.status).toBe(200);
    expect(all.body.some((c: any) => c.id === cohortId)).toBe(true);

    const filtered = await request(app).get("/api/cohorts?type=elective");
    expect(filtered.body.some((c: any) => c.id === cohortId)).toBe(false);
  });

  it("another teacher cannot see or modify the cohort", async () => {
    actAs(OTHER_TEACHER_ID);
    expect((await request(app).get(`/api/cohorts/${cohortId}`)).status).toBe(404);
    expect(
      (await request(app).patch(`/api/cohorts/${cohortId}`).send({ name: "Hijack" }))
        .status,
    ).toBe(404);
    expect((await request(app).delete(`/api/cohorts/${cohortId}`)).status).toBe(404);
    expect((await request(app).get(`/api/cohorts/${cohortId}/members`)).status).toBe(404);
  });

  it("adds members by studentId and by email, idempotently", async () => {
    actAs(TEACHER_ID);
    const byId = await request(app)
      .post(`/api/cohorts/${cohortId}/members`)
      .send({ studentId: STUDENT_ID });
    expect(byId.status).toBe(201);

    const byEmail = await request(app)
      .post(`/api/cohorts/${cohortId}/members`)
      .send({ email: `${STUDENT2_ID}@example.com` });
    expect(byEmail.status).toBe(201);

    // duplicate add is idempotent
    const dup = await request(app)
      .post(`/api/cohorts/${cohortId}/members`)
      .send({ studentId: STUDENT_ID });
    expect(dup.status).toBe(201);

    const members = await request(app).get(`/api/cohorts/${cohortId}/members`);
    expect(members.body).toHaveLength(2);

    // unknown email 404s
    const unknown = await request(app)
      .post(`/api/cohorts/${cohortId}/members`)
      .send({ email: "nobody-task42@example.com" });
    expect(unknown.status).toBe(404);
  });

  it("teacher's student picker lists enrolled students", async () => {
    actAs(TEACHER_ID);
    const res = await request(app).get("/api/teacher/students");
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.id)).toContain(STUDENT_ID);
  });

  it("invites a whole cohort to a course roster, skipping duplicates", async () => {
    actAs(TEACHER_ID);
    // pre-existing roster entry for student 1
    await db
      .insert(invitesTable)
      .values({ courseId, email: `${STUDENT_ID}@example.com` });

    const res = await request(app)
      .post(`/api/courses/${courseId}/invite-cohort`)
      .send({ cohortId });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ added: 1, skipped: 1 });

    // repeat: everything skipped
    const again = await request(app)
      .post(`/api/courses/${courseId}/invite-cohort`)
      .send({ cohortId });
    expect(again.body).toEqual({ added: 0, skipped: 2 });

    // other teacher can't invite someone else's cohort into own course
    actAs(OTHER_TEACHER_ID);
    const foreign = await request(app)
      .post(`/api/courses/${courseId}/invite-cohort`)
      .send({ cohortId });
    expect(foreign.status).toBe(403);
  });

  it("removes a member and deletes the cohort", async () => {
    actAs(TEACHER_ID);
    const rm = await request(app).delete(
      `/api/cohorts/${cohortId}/members/${STUDENT_ID}`,
    );
    expect(rm.status).toBe(204);
    const members = await request(app).get(`/api/cohorts/${cohortId}/members`);
    expect(members.body).toHaveLength(1);

    const del = await request(app).delete(`/api/cohorts/${cohortId}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/cohorts/${cohortId}`)).status).toBe(404);
  });
});
