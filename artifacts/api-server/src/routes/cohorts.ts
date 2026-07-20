import { Router, type IRouter } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import {
  db,
  cohortsTable,
  cohortMembersTable,
  coursesTable,
  enrollmentsTable,
  invitesTable,
  usersTable,
  type Cohort,
} from "@workspace/db";
import {
  ListCohortsQueryParams,
  CreateCohortBody,
  CreateCohortResponse,
  GetCohortParams,
  GetCohortResponse,
  UpdateCohortParams,
  UpdateCohortBody,
  UpdateCohortResponse,
  DeleteCohortParams,
  ListCohortMembersParams,
  ListCohortMembersResponse,
  AddCohortMemberParams,
  AddCohortMemberBody,
  AddCohortMemberResponse,
  RemoveCohortMemberParams,
  ListMyStudentsResponse,
  InviteCohortParams,
  InviteCohortBody,
  InviteCohortResponse,
  ListCohortsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { getCourse, isCourseTeacher } from "../lib/authz";

const router: IRouter = Router();

function requireTeacher(req: any, res: any): boolean {
  if (req.localUser!.role !== "teacher") {
    res.status(403).json({ error: "Only professors can manage cohorts" });
    return false;
  }
  return true;
}

async function getOwnedCohort(
  cohortId: number,
  teacherId: string,
): Promise<Cohort | undefined> {
  const [cohort] = await db
    .select()
    .from(cohortsTable)
    .where(
      and(eq(cohortsTable.id, cohortId), eq(cohortsTable.teacherId, teacherId)),
    );
  return cohort;
}

async function memberCount(cohortId: number): Promise<number> {
  const rows = await db
    .select()
    .from(cohortMembersTable)
    .where(eq(cohortMembersTable.cohortId, cohortId));
  return rows.length;
}

async function serializeCohort(cohort: Cohort) {
  return { ...cohort, memberCount: await memberCount(cohort.id) };
}

router.get("/cohorts", requireAuth, async (req, res): Promise<void> => {
  if (!requireTeacher(req, res)) return;
  const query = ListCohortsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [eq(cohortsTable.teacherId, req.userId!)];
  if (query.data.type) {
    conditions.push(eq(cohortsTable.type, query.data.type));
  }
  const cohorts = await db
    .select()
    .from(cohortsTable)
    .where(and(...conditions))
    .orderBy(desc(cohortsTable.createdAt));

  const serialized = await Promise.all(cohorts.map(serializeCohort));
  res.json(ListCohortsResponse.parse(serialized));
});

router.post("/cohorts", requireAuth, async (req, res): Promise<void> => {
  if (!requireTeacher(req, res)) return;
  const parsed = CreateCohortBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [cohort] = await db
    .insert(cohortsTable)
    .values({
      teacherId: req.userId!,
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      type: parsed.data.type,
    })
    .returning();

  res.status(201).json(CreateCohortResponse.parse(await serializeCohort(cohort)));
});

router.get("/cohorts/:cohortId", requireAuth, async (req, res): Promise<void> => {
  if (!requireTeacher(req, res)) return;
  const params = GetCohortParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const cohort = await getOwnedCohort(params.data.cohortId, req.userId!);
  if (!cohort) {
    res.status(404).json({ error: "Cohort not found" });
    return;
  }

  res.json(GetCohortResponse.parse(await serializeCohort(cohort)));
});

router.patch(
  "/cohorts/:cohortId",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireTeacher(req, res)) return;
    const params = UpdateCohortParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateCohortBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const cohort = await getOwnedCohort(params.data.cohortId, req.userId!);
    if (!cohort) {
      res.status(404).json({ error: "Cohort not found" });
      return;
    }

    const updates: Partial<typeof cohortsTable.$inferInsert> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
    if (parsed.data.description !== undefined)
      updates.description = parsed.data.description?.trim() || null;
    if (parsed.data.type !== undefined) updates.type = parsed.data.type;

    const [updated] = Object.keys(updates).length
      ? await db
          .update(cohortsTable)
          .set(updates)
          .where(eq(cohortsTable.id, cohort.id))
          .returning()
      : [cohort];

    res.json(UpdateCohortResponse.parse(await serializeCohort(updated)));
  },
);

router.delete(
  "/cohorts/:cohortId",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireTeacher(req, res)) return;
    const params = DeleteCohortParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const cohort = await getOwnedCohort(params.data.cohortId, req.userId!);
    if (!cohort) {
      res.status(404).json({ error: "Cohort not found" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(cohortMembersTable)
        .where(eq(cohortMembersTable.cohortId, cohort.id));
      await tx.delete(cohortsTable).where(eq(cohortsTable.id, cohort.id));
    });

    res.status(204).end();
  },
);

router.get(
  "/cohorts/:cohortId/members",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireTeacher(req, res)) return;
    const params = ListCohortMembersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const cohort = await getOwnedCohort(params.data.cohortId, req.userId!);
    if (!cohort) {
      res.status(404).json({ error: "Cohort not found" });
      return;
    }

    const members = await db
      .select()
      .from(cohortMembersTable)
      .where(eq(cohortMembersTable.cohortId, cohort.id));
    const studentIds = members.map((m) => m.studentId);
    const students = studentIds.length
      ? await db
          .select()
          .from(usersTable)
          .where(inArray(usersTable.id, studentIds))
      : [];

    res.json(ListCohortMembersResponse.parse(students));
  },
);

router.post(
  "/cohorts/:cohortId/members",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireTeacher(req, res)) return;
    const params = AddCohortMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = AddCohortMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { studentId, email } = parsed.data;
    if ((!studentId && !email) || (studentId && email)) {
      res
        .status(400)
        .json({ error: "Provide exactly one of studentId or email" });
      return;
    }

    const cohort = await getOwnedCohort(params.data.cohortId, req.userId!);
    if (!cohort) {
      res.status(404).json({ error: "Cohort not found" });
      return;
    }

    let student;
    if (studentId) {
      [student] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, studentId));
    } else {
      const normalized = email!.trim().toLowerCase();
      const candidates = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.role, "student"));
      student = candidates.find(
        (u) => (u.email ?? "").trim().toLowerCase() === normalized,
      );
    }

    if (!student || student.role !== "student") {
      res.status(404).json({ error: "No registered student matches" });
      return;
    }

    // Idempotent add.
    const [existing] = await db
      .select()
      .from(cohortMembersTable)
      .where(
        and(
          eq(cohortMembersTable.cohortId, cohort.id),
          eq(cohortMembersTable.studentId, student.id),
        ),
      );
    if (!existing) {
      await db
        .insert(cohortMembersTable)
        .values({ cohortId: cohort.id, studentId: student.id })
        .onConflictDoNothing();
    }

    res.status(201).json(AddCohortMemberResponse.parse(student));
  },
);

router.delete(
  "/cohorts/:cohortId/members/:studentId",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireTeacher(req, res)) return;
    const params = RemoveCohortMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const cohort = await getOwnedCohort(params.data.cohortId, req.userId!);
    if (!cohort) {
      res.status(404).json({ error: "Cohort not found" });
      return;
    }

    await db
      .delete(cohortMembersTable)
      .where(
        and(
          eq(cohortMembersTable.cohortId, cohort.id),
          eq(cohortMembersTable.studentId, params.data.studentId),
        ),
      );

    res.status(204).end();
  },
);

router.get("/teacher/students", requireAuth, async (req, res): Promise<void> => {
  if (!requireTeacher(req, res)) return;

  const courses = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.teacherId, req.userId!));
  const courseIds = courses.map((c) => c.id);
  const enrollments = courseIds.length
    ? await db
        .select()
        .from(enrollmentsTable)
        .where(inArray(enrollmentsTable.courseId, courseIds))
    : [];
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
  const students = studentIds.length
    ? await db
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, studentIds))
    : [];
  students.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));

  res.json(ListMyStudentsResponse.parse(students));
});

router.post(
  "/courses/:courseId/invite-cohort",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = InviteCohortParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = InviteCohortBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const course = await getCourse(params.data.courseId);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (!isCourseTeacher(course, req.localUser!)) {
      res.status(403).json({ error: "Only the course professor can invite" });
      return;
    }

    const cohort = await getOwnedCohort(parsed.data.cohortId, req.userId!);
    if (!cohort) {
      res.status(404).json({ error: "Cohort not found" });
      return;
    }

    const members = await db
      .select()
      .from(cohortMembersTable)
      .where(eq(cohortMembersTable.cohortId, cohort.id));
    const studentIds = members.map((m) => m.studentId);
    const students = studentIds.length
      ? await db
          .select()
          .from(usersTable)
          .where(inArray(usersTable.id, studentIds))
      : [];

    const existingInvites = await db
      .select()
      .from(invitesTable)
      .where(eq(invitesTable.courseId, course.id));
    const existingEmails = new Set(
      existingInvites.map((i) => i.email.trim().toLowerCase()),
    );

    let added = 0;
    let skipped = 0;
    const toInsert: { courseId: number; email: string }[] = [];
    for (const student of students) {
      const email = (student.email ?? "").trim().toLowerCase();
      if (!email || existingEmails.has(email)) {
        skipped++;
        continue;
      }
      existingEmails.add(email);
      toInsert.push({ courseId: course.id, email });
      added++;
    }
    if (toInsert.length) {
      await db.insert(invitesTable).values(toInsert);
    }

    res.json(InviteCohortResponse.parse({ added, skipped }));
  },
);

export default router;
