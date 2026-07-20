import { Router, type IRouter } from "express";
import { eq, desc, and, gt, count, sql } from "drizzle-orm";
import { db, courseMaterialsTable, courseMaterialReadsTable } from "@workspace/db";
import {
  GetUnseenMaterialsCountParams,
  GetUnseenMaterialsCountResponse,
  MarkMaterialsSeenParams,
  ListCourseMaterialsParams,
  ListCourseMaterialsResponse,
  CreateCourseMaterialParams,
  CreateCourseMaterialBody,
  CreateCourseMaterialResponse,
  UpdateCourseMaterialParams,
  UpdateCourseMaterialBody,
  UpdateCourseMaterialResponse,
  DeleteCourseMaterialParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { getCourse, canAccessCourse, isCourseTeacher } from "../lib/authz";
import { logActivity } from "../lib/activityLog";
import { cleanupUnreferencedObjects } from "../lib/attachmentCleanup";

const router: IRouter = Router();

const VALID_OBJECT_PATH = /^\/objects\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

function validateAttachments(
  attachments: { path: string; name: string; size?: number }[],
): boolean {
  return attachments.every(
    (file) => VALID_OBJECT_PATH.test(file.path) && !file.path.includes(".."),
  );
}

function validateLinks(links: string[]): boolean {
  return links.every((l) => {
    try {
      const url = new URL(l);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  });
}

router.get(
  "/courses/:courseId/materials",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListCourseMaterialsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const course = await getCourse(params.data.courseId);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (!(await canAccessCourse(course, req.localUser!))) {
      res.status(403).json({ error: "Not a member of this course" });
      return;
    }

    const rows = await db
      .select()
      .from(courseMaterialsTable)
      .where(eq(courseMaterialsTable.courseId, params.data.courseId))
      .orderBy(desc(courseMaterialsTable.createdAt));

    res.json(ListCourseMaterialsResponse.parse(rows));
  },
);

router.get(
  "/courses/:courseId/materials/unseen",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetUnseenMaterialsCountParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const course = await getCourse(params.data.courseId);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (!(await canAccessCourse(course, req.localUser!))) {
      res.status(403).json({ error: "Not a member of this course" });
      return;
    }

    // The teacher authored the materials; nothing is ever "unseen" for them.
    if (isCourseTeacher(course, req.localUser!)) {
      res.json(GetUnseenMaterialsCountResponse.parse({ count: 0 }));
      return;
    }

    const [read] = await db
      .select()
      .from(courseMaterialReadsTable)
      .where(
        and(
          eq(courseMaterialReadsTable.courseId, params.data.courseId),
          eq(courseMaterialReadsTable.userId, req.userId!),
        ),
      );

    const [row] = await db
      .select({ count: count() })
      .from(courseMaterialsTable)
      .where(
        read
          ? and(
              eq(courseMaterialsTable.courseId, params.data.courseId),
              gt(courseMaterialsTable.createdAt, read.lastSeenAt),
            )
          : eq(courseMaterialsTable.courseId, params.data.courseId),
      );

    res.json(GetUnseenMaterialsCountResponse.parse({ count: row?.count ?? 0 }));
  },
);

router.post(
  "/courses/:courseId/materials/seen",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = MarkMaterialsSeenParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const course = await getCourse(params.data.courseId);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (!(await canAccessCourse(course, req.localUser!))) {
      res.status(403).json({ error: "Not a member of this course" });
      return;
    }

    await db
      .insert(courseMaterialReadsTable)
      .values({
        courseId: params.data.courseId,
        userId: req.userId!,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [courseMaterialReadsTable.courseId, courseMaterialReadsTable.userId],
        set: { lastSeenAt: sql`now()` },
      });

    res.status(204).end();
  },
);

router.post(
  "/courses/:courseId/materials",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = CreateCourseMaterialParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateCourseMaterialBody.safeParse(req.body);
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
      res
        .status(403)
        .json({ error: "Only the course professor can post materials" });
      return;
    }

    const attachments = parsed.data.attachments ?? [];
    if (!validateAttachments(attachments)) {
      res.status(400).json({ error: "Invalid attachment path" });
      return;
    }
    const links = parsed.data.links ?? [];
    if (!validateLinks(links)) {
      res.status(400).json({ error: "Links must be valid http(s) URLs" });
      return;
    }

    const [material] = await db
      .insert(courseMaterialsTable)
      .values({
        courseId: params.data.courseId,
        authorId: req.userId!,
        title: parsed.data.title,
        body: parsed.data.body ?? null,
        links,
        attachments,
      })
      .returning();

    void logActivity({
      user: req.localUser!,
      action: "material.created",
      message: `${req.localUser!.email} posted material "${material.title}" in course "${course.title}"`,
      metadata: { materialId: material.id, courseId: course.id },
    });

    res.status(201).json(CreateCourseMaterialResponse.parse(material));
  },
);

router.patch(
  "/materials/:materialId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateCourseMaterialParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateCourseMaterialBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(courseMaterialsTable)
      .where(eq(courseMaterialsTable.id, params.data.materialId));
    if (!existing) {
      res.status(404).json({ error: "Material not found" });
      return;
    }

    const course = await getCourse(existing.courseId);
    if (!course || !isCourseTeacher(course, req.localUser!)) {
      res
        .status(403)
        .json({ error: "Only the course professor can edit materials" });
      return;
    }

    const attachments = parsed.data.attachments ?? [];
    if (!validateAttachments(attachments)) {
      res.status(400).json({ error: "Invalid attachment path" });
      return;
    }
    const links = parsed.data.links ?? [];
    if (!validateLinks(links)) {
      res.status(400).json({ error: "Links must be valid http(s) URLs" });
      return;
    }

    const [material] = await db
      .update(courseMaterialsTable)
      .set({
        title: parsed.data.title,
        body: parsed.data.body ?? null,
        links,
        attachments,
        updatedAt: new Date(),
      })
      .where(eq(courseMaterialsTable.id, params.data.materialId))
      .returning();

    const newPaths = new Set(attachments.map((f) => f.path));
    const removedPaths = (existing.attachments ?? [])
      .map((f) => f.path)
      .filter((p) => !newPaths.has(p));
    await cleanupUnreferencedObjects(removedPaths, req.log);

    void logActivity({
      user: req.localUser!,
      action: "material.updated",
      message: `${req.localUser!.email} updated material "${material.title}" in course "${course.title}"`,
      metadata: { materialId: material.id, courseId: course.id },
    });

    res.json(UpdateCourseMaterialResponse.parse(material));
  },
);

router.delete(
  "/materials/:materialId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteCourseMaterialParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(courseMaterialsTable)
      .where(eq(courseMaterialsTable.id, params.data.materialId));
    if (!existing) {
      res.status(404).json({ error: "Material not found" });
      return;
    }

    const course = await getCourse(existing.courseId);
    if (!course || !isCourseTeacher(course, req.localUser!)) {
      res
        .status(403)
        .json({ error: "Only the course professor can delete materials" });
      return;
    }

    await db
      .delete(courseMaterialsTable)
      .where(eq(courseMaterialsTable.id, params.data.materialId));

    await cleanupUnreferencedObjects(
      (existing.attachments ?? []).map((f) => f.path),
      req.log,
    );

    void logActivity({
      user: req.localUser!,
      action: "material.deleted",
      message: `${req.localUser!.email} deleted material "${existing.title}" from course "${course.title}"`,
      metadata: { materialId: existing.id, courseId: course.id },
    });

    res.status(204).end();
  },
);

export default router;
