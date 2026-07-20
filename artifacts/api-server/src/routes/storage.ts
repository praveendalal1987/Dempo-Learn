import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import {
  db,
  assignmentsTable,
  submissionsTable,
  courseMaterialsTable,
} from '@workspace/db';
import { sql } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';

import { canAccessCourse, getCourse, isCourseTeacher, getAssignment } from '../lib/authz';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { requireAuth } from '../middlewares/auth';

/**
 * Determine whether a user may download a private object.
 * An object is downloadable when it is referenced by:
 * - an assignment attachment → any member of that course (teacher or enrolled student)
 * - a submission's files → the submitting student or the course teacher
 * Unreferenced objects are not downloadable by anyone.
 */
async function canDownloadObject(
  objectPath: string,
  user: { id: string; role: string },
): Promise<boolean> {
  const userId = user.id;
  // Assignment attachments referencing this path
  const assignmentRows = await db
    .select({ courseId: assignmentsTable.courseId })
    .from(assignmentsTable)
    .where(
      sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${assignmentsTable.attachments}) elem WHERE elem->>'path' = ${objectPath})`,
    );
  for (const row of assignmentRows) {
    const course = await getCourse(row.courseId);
    if (course && (await canAccessCourse(course, user))) return true;
  }

  // Course material attachments referencing this path
  const materialRows = await db
    .select({ courseId: courseMaterialsTable.courseId })
    .from(courseMaterialsTable)
    .where(
      sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${courseMaterialsTable.attachments}) elem WHERE elem->>'path' = ${objectPath})`,
    );
  for (const row of materialRows) {
    const course = await getCourse(row.courseId);
    if (course && (await canAccessCourse(course, user))) return true;
  }

  // Submission files referencing this path
  const submissionRows = await db
    .select({
      studentId: submissionsTable.studentId,
      assignmentId: submissionsTable.assignmentId,
    })
    .from(submissionsTable)
    .where(
      sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${submissionsTable.files}) elem WHERE elem->>'path' = ${objectPath})`,
    );
  for (const row of submissionRows) {
    if (row.studentId === userId) return true;
    const assignment = await getAssignment(row.assignmentId);
    if (!assignment) continue;
    const course = await getCourse(assignment.courseId);
    if (course && isCourseTeacher(course, user)) return true;
  }

  return false;
}

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', requireAuth, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const allowed = await canDownloadObject(objectPath, req.localUser!);
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
