import { Router, type IRouter } from "express";
import { eq, inArray, asc } from "drizzle-orm";
import {
  db,
  classSessionsTable,
  coursesTable,
  enrollmentsTable,
  assignmentsTable,
  submissionsTable,
} from "@workspace/db";
import {
  ListClassSessionsParams,
  ListClassSessionsResponse,
  CreateClassSessionParams,
  CreateClassSessionBody,
  CreateClassSessionResponse,
  UpdateClassSessionParams,
  UpdateClassSessionBody,
  UpdateClassSessionResponse,
  DeleteClassSessionParams,
  DeleteClassSessionResponse,
  GetCalendarResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import {
  getCourse,
  canViewCourse,
  isCourseTeacher,
  isAssignedCoordinator,
  getCoordinatorCourseIds,
  filterAssignmentsForStudent,
  getActiveEnrolledCourseIds,
} from "../lib/authz";
import { logActivity } from "../lib/activityLog";
import {
  notifyCourseStudents,
  deleteNotificationsForRef,
} from "../lib/notifications";

const router: IRouter = Router();

router.get(
  "/courses/:courseId/sessions",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListClassSessionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const course = await getCourse(params.data.courseId);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (!(await canViewCourse(course, req.localUser!))) {
      res.status(403).json({ error: "Not a member of this course" });
      return;
    }

    const sessions = await db
      .select()
      .from(classSessionsTable)
      .where(eq(classSessionsTable.courseId, params.data.courseId))
      .orderBy(asc(classSessionsTable.startsAt));

    res.json(
      ListClassSessionsResponse.parse(
        sessions.map((s) => ({ ...s, courseTitle: course.title })),
      ),
    );
  },
);

router.post(
  "/courses/:courseId/sessions",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = CreateClassSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateClassSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const course = await getCourse(params.data.courseId);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (
      !isCourseTeacher(course, req.localUser!) &&
      !(await isAssignedCoordinator(course.id, req.localUser!))
    ) {
      res.status(403).json({ error: "Only the course professor or an assigned course coordinator can schedule sessions" });
      return;
    }
    if (parsed.data.endsAt && parsed.data.endsAt <= parsed.data.startsAt) {
      res.status(400).json({ error: "End time must be after start time" });
      return;
    }

    const [session] = await db
      .insert(classSessionsTable)
      .values({
        courseId: course.id,
        title: parsed.data.title,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt ?? null,
        location: parsed.data.location?.trim() || null,
      })
      .returning();

    void notifyCourseStudents(course.id, {
      type: "class.scheduled",
      title: `Class scheduled: ${session.title}`,
      body: `${course.title} — ${session.startsAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`,
      link: "/calendar",
      refId: session.id,
    });

    if (req.localUser?.role === "course_coordinator") {
      void logActivity({
        user: req.localUser,
        action: "session.created_by_coordinator",
        message: `Coordinator ${req.localUser.email} scheduled "${session.title}" for ${course.title}`,
        metadata: { sessionId: session.id, courseId: course.id },
      });
    }

    res
      .status(201)
      .json(
        CreateClassSessionResponse.parse({ ...session, courseTitle: course.title }),
      );
  },
);

router.patch(
  "/sessions/:sessionId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateClassSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateClassSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(classSessionsTable)
      .where(eq(classSessionsTable.id, params.data.sessionId));
    if (!existing) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const course = await getCourse(existing.courseId);
    if (
      !course ||
      (!isCourseTeacher(course, req.localUser!) &&
        !(await isAssignedCoordinator(course.id, req.localUser!)))
    ) {
      res.status(403).json({ error: "Only the course professor or an assigned course coordinator can edit sessions" });
      return;
    }
    if (parsed.data.endsAt && parsed.data.endsAt <= parsed.data.startsAt) {
      res.status(400).json({ error: "End time must be after start time" });
      return;
    }

    const [session] = await db
      .update(classSessionsTable)
      .set({
        title: parsed.data.title,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt ?? null,
        location: parsed.data.location?.trim() || null,
      })
      .where(eq(classSessionsTable.id, existing.id))
      .returning();

    if (req.localUser?.role === "course_coordinator") {
      void logActivity({
        user: req.localUser,
        action: "session.updated_by_coordinator",
        message: `Coordinator ${req.localUser.email} updated "${session.title}" in ${course.title}`,
        metadata: { sessionId: session.id, courseId: course.id },
      });
    }

    res.json(
      UpdateClassSessionResponse.parse({ ...session, courseTitle: course.title }),
    );
  },
);

router.delete(
  "/sessions/:sessionId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteClassSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(classSessionsTable)
      .where(eq(classSessionsTable.id, params.data.sessionId));
    if (!existing) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const course = await getCourse(existing.courseId);
    if (
      !course ||
      (!isCourseTeacher(course, req.localUser!) &&
        !(await isAssignedCoordinator(course.id, req.localUser!)))
    ) {
      res.status(403).json({ error: "Only the course professor or an assigned course coordinator can delete sessions" });
      return;
    }

    await db
      .delete(classSessionsTable)
      .where(eq(classSessionsTable.id, existing.id));
    void deleteNotificationsForRef(
      ["class.scheduled", "class.reminder"],
      existing.id,
    );

    if (req.localUser?.role === "course_coordinator") {
      void logActivity({
        user: req.localUser,
        action: "session.deleted_by_coordinator",
        message: `Coordinator ${req.localUser.email} cancelled "${existing.title}" in ${course.title}`,
        metadata: { sessionId: existing.id, courseId: course.id },
      });
    }

    res.json(DeleteClassSessionResponse.parse({ ok: true }));
  },
);

router.get("/calendar", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const user = req.localUser!;

  let courseIds: number[];
  if (user.role === "teacher") {
    const owned = await db
      .select()
      .from(coursesTable)
      .where(eq(coursesTable.teacherId, userId));
    courseIds = owned.map((c) => c.id);
  } else if (user.role === "course_coordinator") {
    courseIds = await getCoordinatorCourseIds(userId);
  } else {
    courseIds = await getActiveEnrolledCourseIds(userId);
  }

  if (courseIds.length === 0) {
    res.json(GetCalendarResponse.parse({ sessions: [], assignments: [] }));
    return;
  }

  const courses = await db
    .select()
    .from(coursesTable)
    .where(inArray(coursesTable.id, courseIds));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const [sessions, assignments] = await Promise.all([
    db
      .select()
      .from(classSessionsTable)
      .where(inArray(classSessionsTable.courseId, courseIds))
      .orderBy(asc(classSessionsTable.startsAt)),
    db
      .select()
      .from(assignmentsTable)
      .where(inArray(assignmentsTable.courseId, courseIds)),
  ]);

  const visibleAssignments =
    user.role === "student"
      ? await filterAssignmentsForStudent(assignments, userId)
      : assignments;
  const dated = visibleAssignments.filter((a) => a.dueDate !== null);
  const mySubs =
    user.role === "student" && dated.length
      ? await db
          .select()
          .from(submissionsTable)
          .where(
            inArray(
              submissionsTable.assignmentId,
              dated.map((a) => a.id),
            ),
          )
      : [];
  const myStatusByAssignment = new Map(
    mySubs.filter((s) => s.studentId === userId).map((s) => [s.assignmentId, s.status]),
  );

  res.json(
    GetCalendarResponse.parse({
      sessions: sessions.map((s) => ({
        ...s,
        courseTitle: courseById.get(s.courseId)?.title ?? null,
      })),
      assignments: dated
        .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
        .map((a) => ({
          id: a.id,
          courseId: a.courseId,
          courseTitle: courseById.get(a.courseId)?.title ?? "",
          title: a.title,
          dueDate: a.dueDate,
          mySubmissionStatus: myStatusByAssignment.get(a.id) ?? null,
        })),
    }),
  );
});

export default router;
