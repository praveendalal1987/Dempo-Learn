import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  coursesTable,
  enrollmentsTable,
  assignmentsTable,
  assignmentTargetsTable,
  assignmentGroupsTable,
  courseGroupsTable,
  courseGroupMembersTable,
  coordinatorCourseAssignmentsTable,
  type Course,
  type User,
  type Assignment,
  type CourseGroup,
  type CourseGroupMember,
} from "@workspace/db";

export async function getCourse(courseId: number): Promise<Course | undefined> {
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));
  return course;
}

export async function getAssignment(
  assignmentId: number,
): Promise<Assignment | undefined> {
  const [assignment] = await db
    .select()
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId));
  return assignment;
}

export async function isEnrolled(
  courseId: number,
  studentId: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(enrollmentsTable)
    .where(
      and(
        eq(enrollmentsTable.courseId, courseId),
        eq(enrollmentsTable.studentId, studentId),
      ),
    );
  return !!row;
}

/** Course ids the student is enrolled in, excluding deactivated courses. */
export async function getActiveEnrolledCourseIds(
  studentId: string,
): Promise<number[]> {
  const rows = await db
    .select({ courseId: enrollmentsTable.courseId })
    .from(enrollmentsTable)
    .innerJoin(coursesTable, eq(coursesTable.id, enrollmentsTable.courseId))
    .where(
      and(
        eq(enrollmentsTable.studentId, studentId),
        eq(coursesTable.isActive, true),
      ),
    );
  return rows.map((r) => r.courseId);
}

/**
 * True when the user owns the course AND still holds the teacher role. A
 * demoted teacher keeps `course.teacherId` but must no longer pass teacher
 * checks.
 */
export function isCourseTeacher(
  course: Course,
  user: Pick<User, "id" | "role">,
): boolean {
  return course.teacherId === user.id && user.role === "teacher";
}

/**
 * Returns targeted student ids grouped by assignment id. Assignments with no
 * rows are targeted at all students.
 */
export async function getTargetsByAssignment(
  assignmentIds: number[],
): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (assignmentIds.length === 0) return map;
  const rows = await db
    .select()
    .from(assignmentTargetsTable)
    .where(inArray(assignmentTargetsTable.assignmentId, assignmentIds));
  for (const row of rows) {
    const list = map.get(row.assignmentId) ?? [];
    list.push(row.studentId);
    map.set(row.assignmentId, list);
  }
  return map;
}

/** Returns targeted group ids grouped by assignment id (group assignments). */
export async function getGroupTargetsByAssignment(
  assignmentIds: number[],
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (assignmentIds.length === 0) return map;
  const rows = await db
    .select()
    .from(assignmentGroupsTable)
    .where(inArray(assignmentGroupsTable.assignmentId, assignmentIds));
  for (const row of rows) {
    const list = map.get(row.assignmentId) ?? [];
    list.push(row.groupId);
    map.set(row.assignmentId, list);
  }
  return map;
}

/** Ids of groups the student belongs to. */
export async function getStudentGroupIds(
  studentId: string,
): Promise<Set<number>> {
  const rows = await db
    .select()
    .from(courseGroupMembersTable)
    .where(eq(courseGroupMembersTable.studentId, studentId));
  return new Set(rows.map((r) => r.groupId));
}

/**
 * For a group assignment, resolves the student's targeted group and their
 * membership row (leader flag). Returns undefined when the student is not a
 * member of any targeted group.
 */
export async function getStudentGroupForAssignment(
  assignmentId: number,
  studentId: string,
): Promise<{ group: CourseGroup; membership: CourseGroupMember } | undefined> {
  const links = await db
    .select()
    .from(assignmentGroupsTable)
    .where(eq(assignmentGroupsTable.assignmentId, assignmentId));
  if (links.length === 0) return undefined;
  const groupIds = links.map((l) => l.groupId);
  const [membership] = await db
    .select()
    .from(courseGroupMembersTable)
    .where(
      and(
        inArray(courseGroupMembersTable.groupId, groupIds),
        eq(courseGroupMembersTable.studentId, studentId),
      ),
    );
  if (!membership) return undefined;
  const [group] = await db
    .select()
    .from(courseGroupsTable)
    .where(eq(courseGroupsTable.id, membership.groupId));
  if (!group) return undefined;
  return { group, membership };
}

/**
 * True when the student may see the assignment. Group assignments are visible
 * only to members of a targeted group; individual assignments follow target
 * rows (none = all students).
 */
export async function isAssignmentTargetedAt(
  assignmentId: number,
  studentId: string,
): Promise<boolean> {
  const groupTargets = await getGroupTargetsByAssignment([assignmentId]);
  const groupIds = groupTargets.get(assignmentId);
  if (groupIds && groupIds.length > 0) {
    const myGroups = await getStudentGroupIds(studentId);
    return groupIds.some((g) => myGroups.has(g));
  }
  const targets = await db
    .select()
    .from(assignmentTargetsTable)
    .where(eq(assignmentTargetsTable.assignmentId, assignmentId));
  if (targets.length === 0) return true;
  return targets.some((t) => t.studentId === studentId);
}

/**
 * Filters a list of assignments down to those visible to the given student.
 * Individual assignments: no targets = visible to everyone. Group
 * assignments: visible only when the student is in a targeted group.
 */
export async function filterAssignmentsForStudent<
  T extends { id: number },
>(assignments: T[], studentId: string): Promise<T[]> {
  const ids = assignments.map((a) => a.id);
  const [targetsByAssignment, groupTargets, myGroups] = await Promise.all([
    getTargetsByAssignment(ids),
    getGroupTargetsByAssignment(ids),
    getStudentGroupIds(studentId),
  ]);
  return assignments.filter((a) => {
    const groups = groupTargets.get(a.id);
    if (groups && groups.length > 0) {
      return groups.some((g) => myGroups.has(g));
    }
    const targets = targetsByAssignment.get(a.id);
    return !targets || targets.includes(studentId);
  });
}

/** Course ids assigned to a course coordinator. */
export async function getCoordinatorCourseIds(
  coordinatorId: string,
): Promise<number[]> {
  const rows = await db
    .select({ courseId: coordinatorCourseAssignmentsTable.courseId })
    .from(coordinatorCourseAssignmentsTable)
    .where(eq(coordinatorCourseAssignmentsTable.coordinatorId, coordinatorId));
  return rows.map((r) => r.courseId);
}

/**
 * True when the user currently holds the course_coordinator role AND is
 * assigned to this course. Role is re-checked so a demoted coordinator's
 * leftover assignment rows grant nothing.
 */
export async function isAssignedCoordinator(
  courseId: number,
  user: Pick<User, "id" | "role">,
): Promise<boolean> {
  if (user.role !== "course_coordinator") return false;
  const [row] = await db
    .select({ id: coordinatorCourseAssignmentsTable.id })
    .from(coordinatorCourseAssignmentsTable)
    .where(
      and(
        eq(coordinatorCourseAssignmentsTable.coordinatorId, user.id),
        eq(coordinatorCourseAssignmentsTable.courseId, courseId),
      ),
    );
  return !!row;
}

/**
 * Read-only visibility check used by view endpoints: course members, deans
 * (global read), and coordinators assigned to the course.
 */
export async function canViewCourse(
  course: Course,
  user: Pick<User, "id" | "role">,
): Promise<boolean> {
  if (user.role === "dean") return true;
  if (await isAssignedCoordinator(course.id, user)) return true;
  return canAccessCourse(course, user);
}

/**
 * A member is the owning teacher or an enrolled student. Deactivated courses
 * (owner lost teacher access) are hidden from students.
 */
export async function canAccessCourse(
  course: Course,
  user: Pick<User, "id" | "role">,
): Promise<boolean> {
  if (isCourseTeacher(course, user)) return true;
  if (!course.isActive) return false;
  return isEnrolled(course.id, user.id);
}
