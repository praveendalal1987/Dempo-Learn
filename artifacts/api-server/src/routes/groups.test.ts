import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  coursesTable,
  enrollmentsTable,
  assignmentsTable,
  assignmentGroupsTable,
  submissionsTable,
  courseGroupsTable,
  courseGroupMembersTable,
  groupTasksTable,
  notificationsTable,
  activityLogsTable,
} from "@workspace/db";

const mockGetAuth = vi.fn();

vi.mock("@clerk/express", () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
  clerkClient: { users: { getUser: vi.fn() } },
}));

const { default: groupsRouter } = await import("./groups");
const { default: assignmentsRouter } = await import("./assignments");
const { default: submissionsRouter } = await import("./submissions");
const { default: gradesRouter } = await import("./grades");

const TEST_PREFIX = "task56test";
const TEACHER_ID = `${TEST_PREFIX}_teacher`;
const LEADER_ID = `${TEST_PREFIX}_leader`;
const MEMBER_ID = `${TEST_PREFIX}_member`;
const OUTSIDER_ID = `${TEST_PREFIX}_outsider`;
const TEST_IDS = [TEACHER_ID, LEADER_ID, MEMBER_ID, OUTSIDER_ID];

let courseId: number;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // @ts-expect-error minimal logger stub for tests
    req.log = { warn: () => {}, info: () => {}, error: () => {} };
    next();
  });
  app.use("/api", groupsRouter);
  app.use("/api", assignmentsRouter);
  app.use("/api", submissionsRouter);
  app.use("/api", gradesRouter);
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
    const assignmentIds = assignments.map((a) => a.id);
    if (assignmentIds.length) {
      await db
        .delete(submissionsTable)
        .where(inArray(submissionsTable.assignmentId, assignmentIds));
      await db
        .delete(assignmentGroupsTable)
        .where(inArray(assignmentGroupsTable.assignmentId, assignmentIds));
      await db
        .delete(groupTasksTable)
        .where(inArray(groupTasksTable.assignmentId, assignmentIds));
      await db
        .delete(assignmentsTable)
        .where(inArray(assignmentsTable.id, assignmentIds));
    }
    const groups = await db
      .select()
      .from(courseGroupsTable)
      .where(eq(courseGroupsTable.courseId, courseId));
    const groupIds = groups.map((g) => g.id);
    if (groupIds.length) {
      await db
        .delete(courseGroupMembersTable)
        .where(inArray(courseGroupMembersTable.groupId, groupIds));
      await db
        .delete(courseGroupsTable)
        .where(inArray(courseGroupsTable.id, groupIds));
    }
    await db
      .delete(enrollmentsTable)
      .where(eq(enrollmentsTable.courseId, courseId));
    await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
  }
  await db
    .delete(notificationsTable)
    .where(inArray(notificationsTable.userId, TEST_IDS));
  await db
    .delete(activityLogsTable)
    .where(inArray(activityLogsTable.userId, TEST_IDS));
  await db.delete(usersTable).where(inArray(usersTable.id, TEST_IDS));
}

beforeAll(async () => {
  await db
    .delete(usersTable)
    .where(inArray(usersTable.id, TEST_IDS));
  await db.insert(usersTable).values([
    { id: TEACHER_ID, email: `${TEACHER_ID}@example.com`, role: "teacher", name: "Teacher" },
    { id: LEADER_ID, email: `${LEADER_ID}@example.com`, role: "student", name: "Leader" },
    { id: MEMBER_ID, email: `${MEMBER_ID}@example.com`, role: "student", name: "Member" },
    { id: OUTSIDER_ID, email: `${OUTSIDER_ID}@example.com`, role: "student", name: "Outsider" },
  ]);
  const [course] = await db
    .insert(coursesTable)
    .values({ title: "Task56 Course", teacherId: TEACHER_ID, inviteCode: "T56TST" })
    .returning();
  courseId = course.id;
  await db.insert(enrollmentsTable).values([
    { courseId, studentId: LEADER_ID },
    { courseId, studentId: MEMBER_ID },
    { courseId, studentId: OUTSIDER_ID },
  ]);
});

afterAll(async () => {
  await cleanup();
});

describe("group assignments", () => {
  let groupId: number;
  let assignmentId: number;
  let submissionId: number;
  let taskId: number;

  it("students cannot create groups", async () => {
    actAs(LEADER_ID);
    const res = await request(app)
      .post(`/api/courses/${courseId}/groups`)
      .send({ name: "G1", memberIds: [LEADER_ID] });
    expect(res.status).toBe(403);
  });

  it("teacher creates a group with a leader", async () => {
    actAs(TEACHER_ID);
    const res = await request(app)
      .post(`/api/courses/${courseId}/groups`)
      .send({ name: "Alpha", memberIds: [LEADER_ID, MEMBER_ID], leaderId: LEADER_ID });
    expect(res.status).toBe(201);
    expect(res.body.leaderId).toBe(LEADER_ID);
    expect(res.body.members).toHaveLength(2);
    groupId = res.body.id;
  });

  it("rejects members not enrolled in the course", async () => {
    actAs(TEACHER_ID);
    const res = await request(app)
      .post(`/api/courses/${courseId}/groups`)
      .send({ name: "Bad", memberIds: ["nonexistent_student"] });
    expect(res.status).toBe(400);
  });

  it("students only see their own groups", async () => {
    actAs(OUTSIDER_ID);
    const res = await request(app).get(`/api/courses/${courseId}/groups`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);

    actAs(MEMBER_ID);
    const res2 = await request(app).get(`/api/courses/${courseId}/groups`);
    expect(res2.body).toHaveLength(1);
    expect(res2.body[0].id).toBe(groupId);
  });

  it("teacher creates a group assignment targeting the group", async () => {
    actAs(TEACHER_ID);
    const res = await request(app)
      .post(`/api/courses/${courseId}/assignments`)
      .send({
        title: "Group project",
        allowedTypes: ["link"],
        assignmentType: "group",
        targetGroupIds: [groupId],
      });
    expect(res.status).toBe(201);
    assignmentId = res.body.id;
  });

  it("group assignment requires at least one group", async () => {
    actAs(TEACHER_ID);
    const res = await request(app)
      .post(`/api/courses/${courseId}/assignments`)
      .send({ title: "Bad", allowedTypes: ["link"], assignmentType: "group" });
    expect(res.status).toBe(400);
  });

  it("non-members do not see the group assignment", async () => {
    actAs(OUTSIDER_ID);
    const res = await request(app).get(`/api/courses/${courseId}/assignments`);
    expect(res.status).toBe(200);
    expect(res.body.map((a: any) => a.id)).not.toContain(assignmentId);
  });

  it("members see the assignment with group context", async () => {
    actAs(MEMBER_ID);
    const res = await request(app).get(`/api/assignments/${assignmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.myGroup?.id).toBe(groupId);
    expect(res.body.myGroup?.leaderId).toBe(LEADER_ID);
  });

  it("only the leader can create tasks", async () => {
    actAs(MEMBER_ID);
    const res = await request(app)
      .post(`/api/assignments/${assignmentId}/groups/${groupId}/tasks`)
      .send({ description: "Research", assigneeId: MEMBER_ID });
    expect(res.status).toBe(403);

    actAs(LEADER_ID);
    const res2 = await request(app)
      .post(`/api/assignments/${assignmentId}/groups/${groupId}/tasks`)
      .send({ description: "Research", assigneeId: MEMBER_ID });
    expect(res2.status).toBe(201);
    taskId = res2.body.id;
  });

  it("outsiders cannot see tasks", async () => {
    actAs(OUTSIDER_ID);
    const res = await request(app).get(
      `/api/assignments/${assignmentId}/groups/${groupId}/tasks`,
    );
    expect(res.status).toBe(404);
  });

  it("the assignee can mark a task done, others cannot", async () => {
    actAs(OUTSIDER_ID);
    const res = await request(app)
      .patch(`/api/group-tasks/${taskId}`)
      .send({ done: true });
    expect(res.status).toBe(404);

    actAs(MEMBER_ID);
    const res2 = await request(app)
      .patch(`/api/group-tasks/${taskId}`)
      .send({ done: true });
    expect(res2.status).toBe(200);
    expect(res2.body.done).toBe(true);
  });

  it("a member submits one shared submission for the group", async () => {
    actAs(MEMBER_ID);
    const res = await request(app)
      .post(`/api/assignments/${assignmentId}/submissions`)
      .send({ linkUrl: "https://example.com/work", aiDeclaration: "none" });
    expect(res.status).toBe(201);
    expect(res.body.groupId).toBe(groupId);
    submissionId = res.body.id;
  });

  it("a second group submission is rejected", async () => {
    actAs(LEADER_ID);
    const res = await request(app)
      .post(`/api/assignments/${assignmentId}/submissions`)
      .send({ linkUrl: "https://example.com/dup", aiDeclaration: "none" });
    expect(res.status).toBe(409);
  });

  it("outsiders cannot submit or view the group submission", async () => {
    actAs(OUTSIDER_ID);
    const res = await request(app)
      .post(`/api/assignments/${assignmentId}/submissions`)
      .send({ linkUrl: "https://example.com/x", aiDeclaration: "none" });
    expect(res.status).toBe(404);

    const res2 = await request(app).get(`/api/submissions/${submissionId}`);
    expect(res2.status).toBe(403);
  });

  it("all group members can view the shared submission with roster and tasks", async () => {
    actAs(LEADER_ID);
    const res = await request(app).get(`/api/submissions/${submissionId}`);
    expect(res.status).toBe(200);
    expect(res.body.group?.id).toBe(groupId);
    expect(res.body.groupTasks).toHaveLength(1);
    expect(res.body.groupTasks[0].done).toBe(true);
  });

  it("teacher sees the roster and task breakdown on the submission", async () => {
    actAs(TEACHER_ID);
    const res = await request(app).get(`/api/submissions/${submissionId}`);
    expect(res.status).toBe(200);
    expect(res.body.group?.members).toHaveLength(2);
    expect(res.body.groupTasks[0].assigneeId).toBe(MEMBER_ID);
  });

  it("grading the group submission counts for every member", async () => {
    actAs(TEACHER_ID);
    const res = await request(app)
      .patch(`/api/submissions/${submissionId}/grade`)
      .send({ score: 80, feedback: "Nice teamwork" });
    expect(res.status).toBe(200);

    for (const studentId of [LEADER_ID, MEMBER_ID]) {
      actAs(studentId);
      const stats = await request(app).get(`/api/courses/${courseId}/my-stats`);
      expect(stats.status).toBe(200);
      expect(stats.body.overallScore).toBe(80);
      expect(stats.body.gradedCount).toBe(1);
    }

    // The outsider is not targeted, so the assignment doesn't count for them.
    actAs(OUTSIDER_ID);
    const stats = await request(app).get(`/api/courses/${courseId}/my-stats`);
    expect(stats.body.totalAssignments).toBe(0);

    // Leaderboard: both members share the grade.
    const lb = await request(app).get(`/api/courses/${courseId}/leaderboard`);
    expect(lb.status).toBe(200);
    const byId = new Map(lb.body.entries.map((e: any) => [e.studentId, e]));
    expect((byId.get(LEADER_ID) as any)?.overallScore).toBe(80);
    expect((byId.get(MEMBER_ID) as any)?.overallScore).toBe(80);
  });

  it("leader-only submission restriction is enforced", async () => {
    actAs(TEACHER_ID);
    const created = await request(app)
      .post(`/api/courses/${courseId}/assignments`)
      .send({
        title: "Leader submits",
        allowedTypes: ["link"],
        assignmentType: "group",
        targetGroupIds: [groupId],
        leaderOnlySubmit: true,
      });
    expect(created.status).toBe(201);

    actAs(MEMBER_ID);
    const res = await request(app)
      .post(`/api/assignments/${created.body.id}/submissions`)
      .send({ linkUrl: "https://example.com/l", aiDeclaration: "none" });
    expect(res.status).toBe(403);

    actAs(LEADER_ID);
    const res2 = await request(app)
      .post(`/api/assignments/${created.body.id}/submissions`)
      .send({ linkUrl: "https://example.com/l", aiDeclaration: "none" });
    expect(res2.status).toBe(201);
  });

  it("teacher can update membership and leader", async () => {
    actAs(TEACHER_ID);
    const res = await request(app)
      .patch(`/api/groups/${groupId}`)
      .send({ memberIds: [LEADER_ID, MEMBER_ID, OUTSIDER_ID], leaderId: MEMBER_ID });
    expect(res.status).toBe(200);
    expect(res.body.leaderId).toBe(MEMBER_ID);
    expect(res.body.members).toHaveLength(3);
  });

  it("teacher can delete a group", async () => {
    actAs(TEACHER_ID);
    const [g] = await db
      .insert(courseGroupsTable)
      .values({ courseId, name: "Temp" })
      .returning();
    const res = await request(app).delete(`/api/groups/${g.id}`);
    expect(res.status).toBe(204);
  });
});

describe("group deletion with orphaned submissions", () => {
  let orphanGroupId: number;
  let orphanAssignmentId: number;
  let orphanSubmissionId: number;

  it("teacher creates a group and a targeted assignment", async () => {
    actAs(TEACHER_ID);
    const gRes = await request(app)
      .post(`/api/courses/${courseId}/groups`)
      .send({ name: "Beta", memberIds: [LEADER_ID, MEMBER_ID], leaderId: LEADER_ID });
    expect(gRes.status).toBe(201);
    orphanGroupId = gRes.body.id;

    const aRes = await request(app)
      .post(`/api/courses/${courseId}/assignments`)
      .send({
        title: "Beta project",
        allowedTypes: ["link"],
        assignmentType: "group",
        targetGroupIds: [orphanGroupId],
      });
    expect(aRes.status).toBe(201);
    orphanAssignmentId = aRes.body.id;
  });

  it("leader submits for the group", async () => {
    actAs(LEADER_ID);
    const sRes = await request(app)
      .post(`/api/assignments/${orphanAssignmentId}/submissions`)
      .send({ linkUrl: "https://example.com/beta", aiDeclaration: "none" });
    expect(sRes.status).toBe(201);
    expect(sRes.body.groupId).toBe(orphanGroupId);
    orphanSubmissionId = sRes.body.id;
  });

  it("teacher grades the submission before deleting the group", async () => {
    actAs(TEACHER_ID);
    const res = await request(app)
      .patch(`/api/submissions/${orphanSubmissionId}/grade`)
      .send({ score: 70, feedback: "Good work" });
    expect(res.status).toBe(200);
  });

  it("both members appear on the leaderboard before group deletion", async () => {
    actAs(OUTSIDER_ID);
    const lb = await request(app).get(`/api/courses/${courseId}/leaderboard`);
    expect(lb.status).toBe(200);
    const byId = new Map(lb.body.entries.map((e: any) => [e.studentId, e]));
    expect((byId.get(LEADER_ID) as any)?.completedCount).toBeGreaterThan(0);
    expect((byId.get(MEMBER_ID) as any)?.completedCount).toBeGreaterThan(0);
  });

  it("teacher deletes the group mid-assignment", async () => {
    actAs(TEACHER_ID);
    const res = await request(app).delete(`/api/groups/${orphanGroupId}`);
    expect(res.status).toBe(204);
  });

  it("teacher can still view the orphaned submission (no group context)", async () => {
    actAs(TEACHER_ID);
    const res = await request(app).get(`/api/submissions/${orphanSubmissionId}`);
    expect(res.status).toBe(200);
    // submission itself is intact
    expect(res.body.id).toBe(orphanSubmissionId);
    // groupId was nulled out on deletion — no group field in the response
    expect(res.body.group).toBeFalsy();
  });

  it("the original submitter can still view the orphaned submission", async () => {
    actAs(LEADER_ID);
    const res = await request(app).get(`/api/submissions/${orphanSubmissionId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orphanSubmissionId);
  });

  it("non-submitting former member can no longer view the submission", async () => {
    // MEMBER_ID was in the group but LEADER_ID submitted; after deletion
    // MEMBER_ID has no group-member row or ownership claim.
    actAs(MEMBER_ID);
    const res = await request(app).get(`/api/submissions/${orphanSubmissionId}`);
    expect(res.status).toBe(403);
  });

  it("submitter still gets credit in my-stats after group deletion", async () => {
    actAs(LEADER_ID);
    const stats = await request(app).get(`/api/courses/${courseId}/my-stats`);
    expect(stats.status).toBe(200);
    const found = stats.body.submissions.find(
      (s: any) => s.id === orphanSubmissionId,
    );
    expect(found).toBeTruthy();
    expect(found.score).toBe(70);
  });

  it("submitter still appears with a score on the leaderboard after group deletion", async () => {
    actAs(OUTSIDER_ID);
    const lb = await request(app).get(`/api/courses/${courseId}/leaderboard`);
    expect(lb.status).toBe(200);
    const byId = new Map(lb.body.entries.map((e: any) => [e.studentId, e]));
    // The submitter retains credit.
    const leaderEntry = byId.get(LEADER_ID) as any;
    expect(leaderEntry).toBeTruthy();
    expect(leaderEntry.completedCount).toBeGreaterThan(0);
  });

  it("former members cannot re-submit for the group assignment after deletion", async () => {
    // The assignment was group-targeted; without a group, students get 404.
    for (const userId of [LEADER_ID, MEMBER_ID]) {
      actAs(userId);
      const res = await request(app)
        .post(`/api/assignments/${orphanAssignmentId}/submissions`)
        .send({ linkUrl: "https://example.com/retry", aiDeclaration: "none" });
      expect(res.status).toBe(404);
    }
  });
});
