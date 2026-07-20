import { Router, type IRouter } from "express";
import { eq, inArray, count } from "drizzle-orm";
import {
  db,
  coursesTable,
  enrollmentsTable,
  assignmentsTable,
  usersTable,
  submissionsTable,
  submissionSimilaritiesTable,
} from "@workspace/db";
import {
  ListOversightCoursesResponse,
  ListCoordinatorCoursesResponse,
  ListOversightProfessorsResponse,
  ListOversightIntegrityResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { getCoordinatorCourseIds } from "../lib/authz";
import { type Request, type Response, type NextFunction } from "express";
import { inArray as drizzleInArray } from "drizzle-orm";
import type { Course } from "@workspace/db";

async function buildCourseSummaries(courses: Course[]) {
  const courseIds = courses.map((c) => c.id);
  const teacherIds = [...new Set(courses.map((c) => c.teacherId))];

  const [teachers, enrollmentCounts, assignmentCounts] = await Promise.all([
    teacherIds.length
      ? db.select().from(usersTable).where(drizzleInArray(usersTable.id, teacherIds))
      : Promise.resolve([]),
    courseIds.length
      ? db
          .select({ courseId: enrollmentsTable.courseId, value: count() })
          .from(enrollmentsTable)
          .where(drizzleInArray(enrollmentsTable.courseId, courseIds))
          .groupBy(enrollmentsTable.courseId)
      : Promise.resolve([]),
    courseIds.length
      ? db
          .select({ courseId: assignmentsTable.courseId, value: count() })
          .from(assignmentsTable)
          .where(drizzleInArray(assignmentsTable.courseId, courseIds))
          .groupBy(assignmentsTable.courseId)
      : Promise.resolve([]),
  ]);

  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const enrollByCourse = new Map(enrollmentCounts.map((r) => [r.courseId, Number(r.value)]));
  const assignByCourse = new Map(assignmentCounts.map((r) => [r.courseId, Number(r.value)]));

  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    teacherId: c.teacherId,
    teacherName: teacherById.get(c.teacherId)?.name ?? null,
    studentCount: enrollByCourse.get(c.id) ?? 0,
    assignmentCount: assignByCourse.get(c.id) ?? 0,
    createdAt: c.createdAt,
  }));
}

const router: IRouter = Router();

function requireOversight(req: Request, res: Response, next: NextFunction): void {
  const role = req.localUser?.role;
  if (role !== "dean" && role !== "course_coordinator") {
    res.status(403).json({ error: "Dean or course coordinator access required" });
    return;
  }
  next();
}

function requireDean(req: Request, res: Response, next: NextFunction): void {
  if (req.localUser?.role !== "dean") {
    res.status(403).json({ error: "Dean access required" });
    return;
  }
  next();
}

router.get(
  "/oversight/courses",
  requireAuth,
  requireOversight,
  async (req, res): Promise<void> => {
    let courses: Course[];
    if (req.localUser!.role === "course_coordinator") {
      // Coordinators only see courses assigned to them.
      const assignedIds = await getCoordinatorCourseIds(req.userId!);
      courses = assignedIds.length
        ? await db.select().from(coursesTable).where(inArray(coursesTable.id, assignedIds))
        : [];
    } else {
      courses = await db.select().from(coursesTable);
    }
    res.json(
      ListOversightCoursesResponse.parse(await buildCourseSummaries(courses)),
    );
  },
);

router.get(
  "/coordinator/courses",
  requireAuth,
  async (req, res): Promise<void> => {
    if (req.localUser?.role !== "course_coordinator") {
      res.status(403).json({ error: "Course coordinator access required" });
      return;
    }
    const assignedIds = await getCoordinatorCourseIds(req.userId!);
    const courses = assignedIds.length
      ? await db.select().from(coursesTable).where(inArray(coursesTable.id, assignedIds))
      : [];
    res.json(
      ListCoordinatorCoursesResponse.parse(await buildCourseSummaries(courses)),
    );
  },
);

router.get(
  "/oversight/professors",
  requireAuth,
  requireDean,
  async (_req, res): Promise<void> => {
    const professors = await db
      .select()
      .from(usersTable)
      .where(inArray(usersTable.role, ["teacher", "course_coordinator"]));
    const profIds = professors.filter((p) => p.role === "teacher").map((p) => p.id);
    const courseCounts = profIds.length
      ? await db
          .select({ teacherId: coursesTable.teacherId, value: count() })
          .from(coursesTable)
          .where(inArray(coursesTable.teacherId, profIds))
          .groupBy(coursesTable.teacherId)
      : [];
    const countByProf = new Map(courseCounts.map((r) => [r.teacherId, Number(r.value)]));

    res.json(
      ListOversightProfessorsResponse.parse(
        professors.map((p) => ({
          id: p.id,
          email: p.email,
          role: p.role,
          name: p.name,
          title: p.title,
          avatarUrl: p.avatarUrl,
          courseCount: countByProf.get(p.id) ?? 0,
        })),
      ),
    );
  },
);

router.get(
  "/oversight/integrity",
  requireAuth,
  requireDean,
  async (_req, res): Promise<void> => {
    const courses = await db.select().from(coursesTable);
    const courseIds = courses.map((c) => c.id);
    if (courseIds.length === 0) {
      res.json(ListOversightIntegrityResponse.parse([]));
      return;
    }

    const assignments = await db
      .select()
      .from(assignmentsTable)
      .where(inArray(assignmentsTable.courseId, courseIds));
    const assignmentIds = assignments.map((a) => a.id);
    const courseByAssignment = new Map(assignments.map((a) => [a.id, a.courseId]));

    const byCourse = new Map<number, { flaggedCount: number; topScore: number }>();
    if (assignmentIds.length) {
      const flags = await db
        .select({
          similarity: submissionSimilaritiesTable,
          assignmentId: submissionsTable.assignmentId,
        })
        .from(submissionSimilaritiesTable)
        .innerJoin(
          submissionsTable,
          eq(submissionSimilaritiesTable.submissionAId, submissionsTable.id),
        )
        .where(inArray(submissionsTable.assignmentId, assignmentIds));
      for (const row of flags) {
        if (row.similarity.dismissedAt) continue;
        const courseId = courseByAssignment.get(row.assignmentId);
        if (courseId === undefined) continue;
        const entry = byCourse.get(courseId) ?? { flaggedCount: 0, topScore: 0 };
        entry.flaggedCount += 1;
        entry.topScore = Math.max(entry.topScore, row.similarity.score);
        byCourse.set(courseId, entry);
      }
    }

    const teacherIds = [...new Set(courses.map((c) => c.teacherId))];
    const teachers = teacherIds.length
      ? await db.select().from(usersTable).where(inArray(usersTable.id, teacherIds))
      : [];
    const teacherById = new Map(teachers.map((t) => [t.id, t]));

    res.json(
      ListOversightIntegrityResponse.parse(
        courses
          .filter((c) => byCourse.has(c.id))
          .map((c) => ({
            courseId: c.id,
            courseTitle: c.title,
            teacherName: teacherById.get(c.teacherId)?.name ?? null,
            flaggedCount: byCourse.get(c.id)!.flaggedCount,
            topScore: byCourse.get(c.id)!.topScore,
          }))
          .sort((a, b) => b.flaggedCount - a.flaggedCount),
      ),
    );
  },
);

export default router;
