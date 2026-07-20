import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, or } from "drizzle-orm";
import {
  db,
  usersTable,
  coursesTable,
  cohortsTable,
  cohortMembersTable,
  enrollmentsTable,
  invitesTable,
  courseMaterialReadsTable,
  notificationsTable,
  messagesTable,
  submissionsTable,
  submissionSimilaritiesTable,
  activityLogsTable,
} from "@workspace/db";
import { deleteUserAndReferences } from "./userCleanup";

const PREFIX = "task49test";
const TEACHER_ID = `${PREFIX}_teacher`;
const STUDENT_ID = `${PREFIX}_student`;
const OTHER_STUDENT_ID = `${PREFIX}_student2`;
const TEST_IDS = [TEACHER_ID, STUDENT_ID, OTHER_STUDENT_ID];
const STUDENT_EMAIL = `${PREFIX}_student@example.com`;

let courseId: number;
let cohortId: number;
let teacherCohortId: number;

async function wipe(): Promise<void> {
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
  await db
    .delete(cohortMembersTable)
    .where(inArray(cohortMembersTable.studentId, TEST_IDS));
  const courses = await db
    .select()
    .from(coursesTable)
    .where(inArray(coursesTable.teacherId, TEST_IDS));
  const courseIds = courses.map((c) => c.id);
  if (courseIds.length) {
    await db
      .delete(enrollmentsTable)
      .where(inArray(enrollmentsTable.courseId, courseIds));
    await db
      .delete(invitesTable)
      .where(inArray(invitesTable.courseId, courseIds));
    await db
      .delete(courseMaterialReadsTable)
      .where(inArray(courseMaterialReadsTable.courseId, courseIds));
    await db
      .delete(messagesTable)
      .where(inArray(messagesTable.courseId, courseIds));
    await db.delete(coursesTable).where(inArray(coursesTable.id, courseIds));
  }
  await db
    .delete(notificationsTable)
    .where(inArray(notificationsTable.userId, TEST_IDS));
  const subs = await db
    .select()
    .from(submissionsTable)
    .where(inArray(submissionsTable.studentId, TEST_IDS));
  const subIds = subs.map((s) => s.id);
  if (subIds.length) {
    await db
      .delete(submissionSimilaritiesTable)
      .where(
        or(
          inArray(submissionSimilaritiesTable.submissionAId, subIds),
          inArray(submissionSimilaritiesTable.submissionBId, subIds),
        ),
      );
    await db
      .delete(submissionsTable)
      .where(inArray(submissionsTable.id, subIds));
  }
  await db
    .delete(activityLogsTable)
    .where(inArray(activityLogsTable.userId, TEST_IDS));
  await db.delete(usersTable).where(inArray(usersTable.id, TEST_IDS));
}

beforeAll(async () => {
  await wipe();
  await db.insert(usersTable).values([
    { id: TEACHER_ID, email: `${PREFIX}_teacher@example.com`, role: "teacher" },
    { id: STUDENT_ID, email: STUDENT_EMAIL, role: "student" },
    { id: OTHER_STUDENT_ID, email: `${PREFIX}_s2@example.com`, role: "student" },
  ]);

  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `${PREFIX} course`,
      teacherId: TEACHER_ID,
      inviteCode: `${PREFIX}-code`,
    })
    .returning();
  courseId = course.id;

  const [cohort] = await db
    .insert(cohortsTable)
    .values({ teacherId: TEACHER_ID, name: `${PREFIX} cohort` })
    .returning();
  cohortId = cohort.id;
  await db.insert(cohortMembersTable).values([
    { cohortId, studentId: STUDENT_ID },
    { cohortId, studentId: OTHER_STUDENT_ID },
  ]);

  await db.insert(enrollmentsTable).values([
    { courseId, studentId: STUDENT_ID },
    { courseId, studentId: OTHER_STUDENT_ID },
  ]);
  await db.insert(invitesTable).values({ courseId, email: STUDENT_EMAIL });
  await db
    .insert(courseMaterialReadsTable)
    .values({ courseId, userId: STUDENT_ID });
  await db.insert(notificationsTable).values({
    userId: STUDENT_ID,
    type: "message.received",
    title: "hi",
  });
  await db.insert(messagesTable).values([
    { courseId, senderId: STUDENT_ID, body: "from student" },
    { courseId, senderId: TEACHER_ID, recipientId: STUDENT_ID, body: "to student" },
    { courseId, senderId: TEACHER_ID, recipientId: OTHER_STUDENT_ID, body: "other" },
  ]);
  const [subA] = await db
    .insert(submissionsTable)
    .values({ assignmentId: 999999, studentId: STUDENT_ID })
    .returning();
  const [subB] = await db
    .insert(submissionsTable)
    .values({ assignmentId: 999999, studentId: OTHER_STUDENT_ID })
    .returning();
  await db.insert(submissionSimilaritiesTable).values({
    assignmentId: 999999,
    submissionAId: Math.min(subA.id, subB.id),
    submissionBId: Math.max(subA.id, subB.id),
    score: 80,
  });
  await db
    .insert(activityLogsTable)
    .values({
      userId: STUDENT_ID,
      action: "auth.login",
      message: "task49 test login",
    });
});

afterAll(async () => {
  await wipe();
});

describe("deleteUserAndReferences", () => {
  it("returns not_found for a missing user", async () => {
    expect(await deleteUserAndReferences(`${PREFIX}_missing`)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("removes a student and all references", async () => {
    expect(await deleteUserAndReferences(STUDENT_ID)).toEqual({ ok: true });

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, STUDENT_ID));
    expect(user).toBeUndefined();

    // Cohort membership gone, other member intact.
    const members = await db
      .select()
      .from(cohortMembersTable)
      .where(eq(cohortMembersTable.cohortId, cohortId));
    expect(members.map((m) => m.studentId)).toEqual([OTHER_STUDENT_ID]);

    // Enrollment gone, other student's intact.
    const enrollments = await db
      .select()
      .from(enrollmentsTable)
      .where(eq(enrollmentsTable.courseId, courseId));
    expect(enrollments.map((e) => e.studentId)).toEqual([OTHER_STUDENT_ID]);

    // Invite for their email gone.
    const invites = await db
      .select()
      .from(invitesTable)
      .where(eq(invitesTable.courseId, courseId));
    expect(invites).toHaveLength(0);

    // Read markers and notifications gone.
    expect(
      await db
        .select()
        .from(courseMaterialReadsTable)
        .where(eq(courseMaterialReadsTable.userId, STUDENT_ID)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.userId, STUDENT_ID)),
    ).toHaveLength(0);

    // Messages sent by or addressed to the student gone; unrelated kept.
    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.courseId, courseId));
    expect(messages).toHaveLength(1);
    expect(messages[0].recipientId).toBe(OTHER_STUDENT_ID);

    // Submissions + similarity pairs gone; other student's submission kept.
    const subs = await db
      .select()
      .from(submissionsTable)
      .where(eq(submissionsTable.assignmentId, 999999));
    expect(subs.map((s) => s.studentId)).toEqual([OTHER_STUDENT_ID]);
    expect(
      await db
        .select()
        .from(submissionSimilaritiesTable)
        .where(eq(submissionSimilaritiesTable.assignmentId, 999999)),
    ).toHaveLength(0);

    // Activity logs kept but detached.
    expect(
      await db
        .select()
        .from(activityLogsTable)
        .where(eq(activityLogsTable.userId, STUDENT_ID)),
    ).toHaveLength(0);
  });

  it("blocks deleting a teacher who still owns courses", async () => {
    const result = await deleteUserAndReferences(TEACHER_ID);
    expect(result).toEqual({
      ok: false,
      reason: "owns_courses",
      courseIds: [courseId],
    });

    // Teacher and their course are untouched.
    expect(
      await db.select().from(usersTable).where(eq(usersTable.id, TEACHER_ID)),
    ).toHaveLength(1);
    expect(
      await db.select().from(coursesTable).where(eq(coursesTable.id, courseId)),
    ).toHaveLength(1);
  });

  it("removes a teacher's owned cohorts and their member rows once courses are gone", async () => {
    // Clear the teacher's course (and rows tied to it) first.
    await db
      .delete(enrollmentsTable)
      .where(eq(enrollmentsTable.courseId, courseId));
    await db.delete(messagesTable).where(eq(messagesTable.courseId, courseId));
    await db.delete(coursesTable).where(eq(coursesTable.id, courseId));

    const [cohort2] = await db
      .insert(cohortsTable)
      .values({ teacherId: TEACHER_ID, name: `${PREFIX} cohort2` })
      .returning();
    teacherCohortId = cohort2.id;
    await db
      .insert(cohortMembersTable)
      .values({ cohortId: teacherCohortId, studentId: OTHER_STUDENT_ID });

    expect(await deleteUserAndReferences(TEACHER_ID)).toEqual({ ok: true });

    expect(
      await db
        .select()
        .from(cohortsTable)
        .where(eq(cohortsTable.teacherId, TEACHER_ID)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(cohortMembersTable)
        .where(
          inArray(cohortMembersTable.cohortId, [cohortId, teacherCohortId]),
        ),
    ).toHaveLength(0);
  });
});
