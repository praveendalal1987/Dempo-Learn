import { Router, type IRouter } from "express";
import { eq, and, isNull, inArray, count, desc, gte } from "drizzle-orm";
import {
  db,
  coursesTable,
  enrollmentsTable,
  assignmentsTable,
  submissionsTable,
  messagesTable,
  submissionSimilaritiesTable,
} from "@workspace/db";
import { GetDashboardResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { enrichSubmission } from "../lib/serializers";
import {
  filterAssignmentsForStudent,
  getActiveEnrolledCourseIds,
} from "../lib/authz";

const router: IRouter = Router();

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const user = req.localUser!;
  const now = new Date();

  // Unread direct messages addressed to this user.
  const [[{ value: totalUnread }]] = await Promise.all([
    db
      .select({ value: count() })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.recipientId, userId),
          isNull(messagesTable.readAt),
        ),
      ),
  ]);

  if (user.role === "teacher") {
    const courses = await db
      .select()
      .from(coursesTable)
      .where(eq(coursesTable.teacherId, userId));
    const courseIds = courses.map((c) => c.id);

    let studentCount = 0;
    let pendingGradingCount = 0;
    let upcomingAssignments: Array<typeof assignmentsTable.$inferSelect> = [];
    let recentSubmissions: Array<typeof submissionsTable.$inferSelect> = [];
    let integrityFlags: Array<{
      courseId: number;
      courseTitle: string;
      flaggedCount: number;
      topScore: number;
    }> = [];

    if (courseIds.length) {
      const [[{ value: sc }], assignments] = await Promise.all([
        db
          .select({ value: count() })
          .from(enrollmentsTable)
          .where(inArray(enrollmentsTable.courseId, courseIds)),
        db
          .select()
          .from(assignmentsTable)
          .where(inArray(assignmentsTable.courseId, courseIds)),
      ]);
      studentCount = sc;
      const assignmentIds = assignments.map((a) => a.id);

      upcomingAssignments = assignments
        .filter((a) => a.dueDate && a.dueDate >= now)
        .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()))
        .slice(0, 5);

      const assignmentCourseById = new Map(
        assignments.map((a) => [a.id, a.courseId]),
      );

      if (assignmentIds.length) {
        const pairs = await db
          .select({
            assignmentId: submissionSimilaritiesTable.assignmentId,
            score: submissionSimilaritiesTable.score,
          })
          .from(submissionSimilaritiesTable)
          .where(
            inArray(submissionSimilaritiesTable.assignmentId, assignmentIds),
          );

        const byCourse = new Map<
          number,
          { flaggedCount: number; topScore: number }
        >();
        for (const p of pairs) {
          const cid = assignmentCourseById.get(p.assignmentId);
          if (cid === undefined) continue;
          const entry = byCourse.get(cid) ?? { flaggedCount: 0, topScore: 0 };
          entry.flaggedCount += 1;
          entry.topScore = Math.max(entry.topScore, p.score);
          byCourse.set(cid, entry);
        }
        integrityFlags = courses
          .filter((c) => byCourse.has(c.id))
          .map((c) => ({
            courseId: c.id,
            courseTitle: c.title,
            ...byCourse.get(c.id)!,
          }))
          .sort((a, b) => b.flaggedCount - a.flaggedCount);
      }

      if (assignmentIds.length) {
        const [[{ value: pgc }], subs] = await Promise.all([
          db
            .select({ value: count() })
            .from(submissionsTable)
            .where(
              and(
                inArray(submissionsTable.assignmentId, assignmentIds),
                eq(submissionsTable.status, "submitted"),
              ),
            ),
          db
            .select()
            .from(submissionsTable)
            .where(inArray(submissionsTable.assignmentId, assignmentIds))
            .orderBy(desc(submissionsTable.submittedAt))
            .limit(6),
        ]);
        pendingGradingCount = pgc;
        recentSubmissions = subs;
      }
    }

    res.json(
      GetDashboardResponse.parse({
        role: "teacher",
        courseCount: courses.length,
        studentCount,
        pendingGradingCount,
        totalUnread,
        upcomingAssignments,
        recentSubmissions: await Promise.all(
          recentSubmissions.map(enrichSubmission),
        ),
        integrityFlags,
      }),
    );
    return;
  }

  // Student dashboard
  const courseIds = await getActiveEnrolledCourseIds(userId);

  let upcomingAssignments: Array<typeof assignmentsTable.$inferSelect> = [];
  if (courseIds.length) {
    const assignments = await db
      .select()
      .from(assignmentsTable)
      .where(
        and(
          inArray(assignmentsTable.courseId, courseIds),
          gte(assignmentsTable.dueDate, now),
        ),
      );
    const visible = await filterAssignmentsForStudent(assignments, userId);
    upcomingAssignments = visible
      .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()))
      .slice(0, 5);
  }

  const recentSubmissions = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.studentId, userId))
    .orderBy(desc(submissionsTable.submittedAt))
    .limit(6);

  res.json(
    GetDashboardResponse.parse({
      role: "student",
      courseCount: courseIds.length,
      studentCount: 0,
      pendingGradingCount: 0,
      totalUnread,
      upcomingAssignments,
      recentSubmissions: await Promise.all(
        recentSubmissions.map(enrichSubmission),
      ),
    }),
  );
});

export default router;
