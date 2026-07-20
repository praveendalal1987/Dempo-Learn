import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  coursesTable,
  courseMaterialsTable,
} from "@workspace/db";

const mockGetAuth = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@clerk/express", () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
  clerkClient: {
    users: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

const mockFileDelete = vi.fn().mockResolvedValue(undefined);
const mockGetObjectEntityFile = vi.fn();

vi.mock("./objectStorage", () => {
  class ObjectNotFoundError extends Error {}
  return {
    ObjectNotFoundError,
    ObjectStorageService: class {
      getObjectEntityFile(path: string) {
        return mockGetObjectEntityFile(path);
      }
    },
  };
});

const { default: materialsRouter } = await import("../routes/materials");
const { cleanupUnreferencedObjects, isObjectPathReferenced } = await import(
  "./attachmentCleanup"
);

const PREFIX = "task27cleanup";
const TEACHER_ID = `${PREFIX}_teacher`;

let courseId: number;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // @ts-expect-error minimal logger stub for tests
    req.log = { warn: () => {}, info: () => {}, error: () => {} };
    next();
  });
  app.use("/api", materialsRouter);
  return app;
}

const app = buildApp();

async function cleanup(): Promise<void> {
  const courses = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.teacherId, TEACHER_ID));
  const ids = courses.map((c) => c.id);
  if (ids.length) {
    await db
      .delete(courseMaterialsTable)
      .where(inArray(courseMaterialsTable.courseId, ids));
    await db.delete(coursesTable).where(inArray(coursesTable.id, ids));
  }
  await db.delete(usersTable).where(eq(usersTable.id, TEACHER_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(usersTable).values([
    { id: TEACHER_ID, email: `${TEACHER_ID}@example.com`, role: "teacher" },
  ]);
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: "Cleanup Test Course",
      teacherId: TEACHER_ID,
      inviteCode: `${PREFIX}CODE`,
    })
    .returning();
  courseId = course.id;
});

afterAll(cleanup);

beforeEach(() => {
  mockGetAuth.mockReset();
  mockGetUser.mockReset();
  mockFileDelete.mockClear();
  mockGetObjectEntityFile.mockReset();
  mockGetObjectEntityFile.mockResolvedValue({ delete: mockFileDelete });
  mockGetAuth.mockReturnValue({ userId: TEACHER_ID });
});

async function createMaterial(attachmentPath: string): Promise<number> {
  const res = await request(app)
    .post(`/api/courses/${courseId}/materials`)
    .send({
      title: "With attachment",
      attachments: [{ path: attachmentPath, name: "file.pdf", size: 10 }],
    });
  expect(res.status).toBe(201);
  return res.body.id;
}

describe("attachment cleanup on material delete/update", () => {
  it("deletes the storage object when the last reference is removed", async () => {
    const path = `/objects/uploads/${PREFIX}-solo`;
    const materialId = await createMaterial(path);

    const res = await request(app).delete(`/api/materials/${materialId}`);
    expect(res.status).toBe(204);
    expect(mockGetObjectEntityFile).toHaveBeenCalledWith(path);
    expect(mockFileDelete).toHaveBeenCalledTimes(1);
  });

  it("keeps the storage object when another record still references it", async () => {
    const path = `/objects/uploads/${PREFIX}-shared`;
    const materialA = await createMaterial(path);
    await createMaterial(path);

    const res = await request(app).delete(`/api/materials/${materialA}`);
    expect(res.status).toBe(204);
    expect(mockFileDelete).not.toHaveBeenCalled();
    expect(await isObjectPathReferenced(path)).toBe(true);
  });

  it("cleans up attachments removed via material edit", async () => {
    const path = `/objects/uploads/${PREFIX}-edited`;
    const materialId = await createMaterial(path);

    const res = await request(app)
      .patch(`/api/materials/${materialId}`)
      .send({ title: "Edited", attachments: [] });
    expect(res.status).toBe(200);
    expect(mockGetObjectEntityFile).toHaveBeenCalledWith(path);
    expect(mockFileDelete).toHaveBeenCalledTimes(1);
  });

  it("does not fail when storage deletion errors", async () => {
    const path = `/objects/uploads/${PREFIX}-err`;
    const materialId = await createMaterial(path);
    mockGetObjectEntityFile.mockRejectedValue(new Error("sidecar down"));

    const res = await request(app).delete(`/api/materials/${materialId}`);
    expect(res.status).toBe(204);
  });

  it("ignores non-object paths and empty input", async () => {
    await cleanupUnreferencedObjects([]);
    await cleanupUnreferencedObjects(["https://example.com/x", "/etc/passwd"]);
    expect(mockGetObjectEntityFile).not.toHaveBeenCalled();
  });
});
