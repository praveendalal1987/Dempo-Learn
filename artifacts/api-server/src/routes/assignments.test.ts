import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  coursesTable,
  enrollmentsTable,
  assignmentsTable,
  assignmentTargetsTable,
  submissionsTable,
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

// Avoid real AI grading calls on text submissions.
vi.mock("../lib/grading", () => ({
  gradeTextSubmission: vi.fn(async () => ({ aiScore: null, aiFeedback: null })),
  computePlagiarismScore: vi.fn(() => 0),
}));

const { default: assignmentsRouter } = await import("./assignments");
const { default: submissionsRouter } = await import("./submissions");

const TEST_PREFIX = "task41test";
const TEACHER_ID = `${TEST_PREFIX}_teacher`;
const TARGETED_ID = `${TEST_PREFIX}_targeted`;
const OTHER_ID = `${TEST_PREFIX}_other`;
const TEST_IDS = [TEACHER_ID, TARGETED_ID, OTHER_ID];

let courseId: number;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // @ts-expect-error minimal logger stub for tests
    req.log = { warn: () => {}, info: () => {}, error: () => {} };
    next();
  });
  app.use("/api", assignmentsRouter);
  app.use("/api", submissionsRouter);
  return app;
}

const app = buildApp();

function actAs(userId: string) {
  mockGetAuth.mockReturnValue({ userId });
}

async function cleanup(): Promise<void> {
  if (courseId) {
    const assignments = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.courseId, courseId));
    const ids = assignments.map((a) => a.id);
    if (ids.length) {
      await db
        .delete(submissionsTable)
        .where(inArray(submissionsTable.assignmentId, ids));
      await db
        .delete(assignmentTargetsTable)
        .where(inArray(assignmentTargetsTable.assignmentId, ids));
      await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, ids));
    }
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
    { id: TARGETED_ID, email: `${TARGETED_ID}@example.com`, role: "student", name: "Targeted Student" },
    { id: OTHER_ID, email: `${OTHER_ID}@example.com`, role: "student", name: "Other Student" },
  ]);
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: "Task41 Test Course",
      teacherId: TEACHER_ID,
      inviteCode: `${TEST_PREFIX}-${Date.now()}`,
    })
    .returning();
  courseId = course.id;
  await db.insert(enrollmentsTable).values([
    { courseId, studentId: TARGETED_ID },
    { courseId, studentId: OTHER_ID },
  ]);
});

afterAll(cleanup);

beforeEach(() => {
  mockGetAuth.mockReset();
  mockGetUser.mockReset();
});

async function createAssignment(body: Record<string, unknown>) {
  actAs(TEACHER_ID);
  return request(app)
    .post(`/api/courses/${courseId}/assignments`)
    .send({ title: "A", allowedTypes: ["text"], ...body });
}

describe("assignment targeting", () => {
  it("rejects targets who are not enrolled in the course", async () => {
    const res = await createAssignment({
      targetStudentIds: [TARGETED_ID, "not-a-student"],
    });
    expect(res.status).toBe(400);
  });

  it("creates an all-students assignment when target list is empty", async () => {
    const res = await createAssignment({ title: "For everyone", targetStudentIds: [] });
    expect(res.status).toBe(201);

    // Both students see it.
    for (const sid of [TARGETED_ID, OTHER_ID]) {
      actAs(sid);
      const list = await request(app).get(`/api/courses/${courseId}/assignments`);
      expect(list.status).toBe(200);
      expect(list.body.some((a: any) => a.id === res.body.id)).toBe(true);

      const detail = await request(app).get(`/api/assignments/${res.body.id}`);
      expect(detail.status).toBe(200);
    }
  });

  it("targeted assignment: visible/submittable only for targeted student", async () => {
    const res = await createAssignment({
      title: "Make-up work",
      targetStudentIds: [TARGETED_ID],
    });
    expect(res.status).toBe(201);
    const assignmentId = res.body.id;

    // Targeted student sees it in the list and detail, and can submit.
    actAs(TARGETED_ID);
    const list = await request(app).get(`/api/courses/${courseId}/assignments`);
    expect(list.body.some((a: any) => a.id === assignmentId)).toBe(true);
    const detail = await request(app).get(`/api/assignments/${assignmentId}`);
    expect(detail.status).toBe(200);
    // Students never see target info.
    expect(detail.body.targetStudentIds ?? null).toBeNull();
    const submit = await request(app)
      .post(`/api/assignments/${assignmentId}/submissions`)
      .send({ textResponse: "my work", aiDeclaration: "none" });
    expect(submit.status).toBe(201);

    // Non-targeted student sees nothing and cannot submit.
    actAs(OTHER_ID);
    const otherList = await request(app).get(`/api/courses/${courseId}/assignments`);
    expect(otherList.body.some((a: any) => a.id === assignmentId)).toBe(false);
    const otherDetail = await request(app).get(`/api/assignments/${assignmentId}`);
    expect(otherDetail.status).toBe(404);
    const otherSubmit = await request(app)
      .post(`/api/assignments/${assignmentId}/submissions`)
      .send({ textResponse: "sneaky", aiDeclaration: "none" });
    expect(otherSubmit.status).toBe(404);

    // Teacher sees target info and the submission count of the targeted group.
    actAs(TEACHER_ID);
    const teacherList = await request(app).get(`/api/courses/${courseId}/assignments`);
    const teacherRow = teacherList.body.find((a: any) => a.id === assignmentId);
    expect(teacherRow.targetStudentIds).toEqual([TARGETED_ID]);
    expect(teacherRow.targetStudents[0].name).toBe("Targeted Student");
    expect(teacherRow.submissionCount).toBe(1);

    const teacherDetail = await request(app).get(`/api/assignments/${assignmentId}`);
    expect(teacherDetail.status).toBe(200);
    expect(teacherDetail.body.targetStudentIds).toEqual([TARGETED_ID]);

    // Only the targeted student was notified.
    await new Promise((r) => setTimeout(r, 300));
    const notifs = await db
      .select()
      .from(notificationsTable)
      .where(inArray(notificationsTable.userId, [TARGETED_ID, OTHER_ID]));
    const forThis = notifs.filter(
      (n) => n.type === "assignment.created" && n.refId === assignmentId,
    );
    expect(forThis.map((n) => n.userId)).toEqual([TARGETED_ID]);
  });

  it("PATCH: teacher can edit fields and retarget; students only edit visibility", async () => {
    const created = await createAssignment({
      title: "Editable",
      targetStudentIds: [TARGETED_ID],
    });
    expect(created.status).toBe(201);
    const assignmentId = created.body.id;

    // Student cannot edit.
    actAs(TARGETED_ID);
    const forbidden = await request(app)
      .patch(`/api/assignments/${assignmentId}`)
      .send({ title: "hax" });
    expect(forbidden.status).toBe(403);

    // Teacher edits fields and switches audience to OTHER_ID only.
    actAs(TEACHER_ID);
    const updated = await request(app)
      .patch(`/api/assignments/${assignmentId}`)
      .send({
        title: "Edited title",
        maxScore: 50,
        targetStudentIds: [OTHER_ID],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("Edited title");
    expect(updated.body.maxScore).toBe(50);
    expect(updated.body.targetStudentIds).toEqual([OTHER_ID]);

    // Audience change takes effect immediately.
    actAs(OTHER_ID);
    expect((await request(app).get(`/api/assignments/${assignmentId}`)).status).toBe(200);
    actAs(TARGETED_ID);
    expect((await request(app).get(`/api/assignments/${assignmentId}`)).status).toBe(404);

    // Empty list = all students again.
    actAs(TEACHER_ID);
    const opened = await request(app)
      .patch(`/api/assignments/${assignmentId}`)
      .send({ targetStudentIds: [] });
    expect(opened.status).toBe(200);
    expect(opened.body.targetStudentIds ?? null).toBeNull();
    actAs(TARGETED_ID);
    expect((await request(app).get(`/api/assignments/${assignmentId}`)).status).toBe(200);
  });

  it("PATCH: rejects non-enrolled targets and keeps prior audience", async () => {
    const created = await createAssignment({
      title: "Guarded",
      targetStudentIds: [TARGETED_ID],
    });
    const assignmentId = created.body.id;
    actAs(TEACHER_ID);
    const res = await request(app)
      .patch(`/api/assignments/${assignmentId}`)
      .send({ targetStudentIds: ["nope"] });
    expect(res.status).toBe(400);
    const detail = await request(app).get(`/api/assignments/${assignmentId}`);
    expect(detail.body.targetStudentIds).toEqual([TARGETED_ID]);
  });

  it("PATCH: untargeted student's existing submission stays visible to teacher", async () => {
    const created = await createAssignment({
      title: "Submit then retarget",
      targetStudentIds: [TARGETED_ID],
    });
    const assignmentId = created.body.id;

    actAs(TARGETED_ID);
    const submit = await request(app)
      .post(`/api/assignments/${assignmentId}/submissions`)
      .send({ textResponse: "done", aiDeclaration: "none" });
    expect(submit.status).toBe(201);

    actAs(TEACHER_ID);
    await request(app)
      .patch(`/api/assignments/${assignmentId}`)
      .send({ targetStudentIds: [OTHER_ID] });
    const subs = await request(app).get(`/api/assignments/${assignmentId}/submissions`);
    expect(subs.status).toBe(200);
    expect(subs.body.some((s: any) => s.id === submit.body.id)).toBe(true);
  });

  it("existing assignments with no target rows behave as all students", async () => {
    // Insert directly, bypassing the API (simulates a pre-existing assignment).
    const [legacy] = await db
      .insert(assignmentsTable)
      .values({ courseId, title: "Legacy", allowedTypes: ["text"] })
      .returning();

    actAs(OTHER_ID);
    const list = await request(app).get(`/api/courses/${courseId}/assignments`);
    expect(list.body.some((a: any) => a.id === legacy.id)).toBe(true);
    const detail = await request(app).get(`/api/assignments/${legacy.id}`);
    expect(detail.status).toBe(200);
  });
});
