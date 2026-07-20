import { eq, count } from "drizzle-orm";
import {
  db,
  enrollmentsTable,
  assignmentsTable,
  usersTable,
  courseGroupsTable,
  type Course,
  type Submission,
} from "@workspace/db";

export async function enrichCourse(course: Course) {
  const [[{ value: studentCount }], [{ value: assignmentCount }], [teacher]] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(enrollmentsTable)
        .where(eq(enrollmentsTable.courseId, course.id)),
      db
        .select({ value: count() })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.courseId, course.id)),
      db.select().from(usersTable).where(eq(usersTable.id, course.teacherId)),
    ]);

  return {
    ...course,
    teacherName: teacher?.name ?? null,
    studentCount,
    assignmentCount,
  };
}

export async function enrichSubmission(submission: Submission) {
  const [[student], [assignment], [group]] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, submission.studentId)),
    db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, submission.assignmentId)),
    submission.groupId != null
      ? db
          .select()
          .from(courseGroupsTable)
          .where(eq(courseGroupsTable.id, submission.groupId))
      : Promise.resolve([]),
  ]);

  return {
    ...submission,
    studentName: student?.name ?? null,
    assignmentTitle: assignment?.title ?? null,
    courseId: assignment?.courseId ?? null,
    maxScore: assignment?.maxScore ?? null,
    groupName: group?.name ?? null,
  };
}

