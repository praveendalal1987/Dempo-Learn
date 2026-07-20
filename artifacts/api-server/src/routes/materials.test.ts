import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  coursesTable,
  enrollmentsTable,
  courseMaterialsTable,
  courseMaterialReadsTable,
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

const { default: materialsRouter } = await import("./materials");

const PREFIX = "task7mattest";
const TEACHER_ID = `${PREFIX}_teacher`;
const STUDENT_ID = `${PREFIX}_student`;
const OUTSIDER_ID = `${PREFIX}_outsider`;
const USER_IDS = [TEACHER_ID, STUDENT_ID, OUTSIDER_ID];

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
    await db.delete(courseMaterialsTable).where(inArray(courseMaterialsTable.courseId, ids));
    await db.delete(courseMaterialReadsTable).where(inArray(courseMaterialReadsTable.courseId, ids));
    await db.delete(enrollmentsTable).where(inArray(enrollmentsTable.courseId, ids));
    await db.delete(coursesTable).where(inArray(coursesTable.id, ids));
  }
  await db.delete(usersTable).where(inArray(usersTable.id, USER_IDS));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(usersTable).values([
    { id: TEACHER_ID, email: `${TEACHER_ID}@example.com`, role: "teacher" },
    { id: STUDENT_ID, email: `${STUDENT_ID}@example.com`, role: "student" },
    { id: OUTSIDER_ID, email: `${OUTSIDER_ID}@example.com`, role: "student" },
  ]);
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: "Materials Test Course",
      teacherId: TEACHER_ID,
      inviteCode: `${PREFIX}CODE`,
    })
    .returning();
  courseId = course.id;
  await db.insert(enrollmentsTable).values({ courseId, studentId: STUDENT_ID });
});

afterAll(cleanup);

beforeEach(() => {
  mockGetAuth.mockReset();
  mockGetUser.mockReset();
});

function actAs(userId: string | null) {
  mockGetAuth.mockReturnValue({ userId });
}

describe("course materials CRUD + authorization", () => {
  let materialId: number;

  it("teacher can create a material with links and attachments", async () => {
    actAs(TEACHER_ID);
    const res = await request(app)
      .post(`/api/courses/${courseId}/materials`)
      .send({
        title: "Week 1 Reading",
        body: "Please read before class.",
        links: ["https://example.com/reading"],
        attachments: [{ path: "/objects/uploads/abc123", name: "notes.pdf", size: 1234 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Week 1 Reading");
    expect(res.body.links).toEqual(["https://example.com/reading"]);
    expect(res.body.attachments[0].name).toBe("notes.pdf");
    materialId = res.body.id;
  });

  it("student cannot create a material", async () => {
    actAs(STUDENT_ID);
    const res = await request(app)
      .post(`/api/courses/${courseId}/materials`)
      .send({ title: "Sneaky" });
    expect(res.status).toBe(403);
  });

  it("rejects invalid links and attachment paths", async () => {
    actAs(TEACHER_ID);
    const badLink = await request(app)
      .post(`/api/courses/${courseId}/materials`)
      .send({ title: "Bad", links: ["javascript:alert(1)"] });
    expect(badLink.status).toBe(400);

    const badPath = await request(app)
      .post(`/api/courses/${courseId}/materials`)
      .send({ title: "Bad", attachments: [{ path: "/etc/passwd", name: "x" }] });
    expect(badPath.status).toBe(400);
  });

  it("enrolled student can list materials", async () => {
    actAs(STUDENT_ID);
    const res = await request(app).get(`/api/courses/${courseId}/materials`);
    expect(res.status).toBe(200);
    expect(res.body.some((m: any) => m.id === materialId)).toBe(true);
  });

  it("non-member cannot list materials", async () => {
    actAs(OUTSIDER_ID);
    const res = await request(app).get(`/api/courses/${courseId}/materials`);
    expect(res.status).toBe(403);
  });

  it("teacher can update a material", async () => {
    actAs(TEACHER_ID);
    const res = await request(app)
      .patch(`/api/materials/${materialId}`)
      .send({ title: "Week 1 Reading (updated)", links: [], attachments: [] });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Week 1 Reading (updated)");
  });

  it("student cannot update or delete a material", async () => {
    actAs(STUDENT_ID);
    const upd = await request(app)
      .patch(`/api/materials/${materialId}`)
      .send({ title: "Hacked" });
    expect(upd.status).toBe(403);
    const del = await request(app).delete(`/api/materials/${materialId}`);
    expect(del.status).toBe(403);
  });

  it("teacher can delete a material", async () => {
    actAs(TEACHER_ID);
    const res = await request(app).delete(`/api/materials/${materialId}`);
    expect(res.status).toBe(204);

    const list = await request(app).get(`/api/courses/${courseId}/materials`);
    expect(list.body.some((m: any) => m.id === materialId)).toBe(false);
  });
});

describe("unseen materials indicator", () => {
  beforeEach(async () => {
    await db.delete(courseMaterialsTable).where(eq(courseMaterialsTable.courseId, courseId));
    await db.delete(courseMaterialReadsTable).where(eq(courseMaterialReadsTable.courseId, courseId));
  });

  async function postMaterial(title: string) {
    actAs(TEACHER_ID);
    const res = await request(app)
      .post(`/api/courses/${courseId}/materials`)
      .send({ title });
    expect(res.status).toBe(201);
    return res.body;
  }

  it("counts all materials for a student who never visited", async () => {
    await postMaterial("A");
    await postMaterial("B");
    actAs(STUDENT_ID);
    const res = await request(app).get(`/api/courses/${courseId}/materials/unseen`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it("marking seen clears the count; new posts increase it again", async () => {
    await postMaterial("A");
    actAs(STUDENT_ID);
    const seen = await request(app).post(`/api/courses/${courseId}/materials/seen`);
    expect(seen.status).toBe(204);

    let res = await request(app).get(`/api/courses/${courseId}/materials/unseen`);
    expect(res.body.count).toBe(0);

    // wait so createdAt is strictly after lastSeenAt
    await new Promise((r) => setTimeout(r, 50));
    await postMaterial("B");
    actAs(STUDENT_ID);
    res = await request(app).get(`/api/courses/${courseId}/materials/unseen`);
    expect(res.body.count).toBe(1);
  });

  it("marking seen twice upserts without error", async () => {
    actAs(STUDENT_ID);
    expect((await request(app).post(`/api/courses/${courseId}/materials/seen`)).status).toBe(204);
    expect((await request(app).post(`/api/courses/${courseId}/materials/seen`)).status).toBe(204);
  });

  it("teacher always sees zero unseen", async () => {
    await postMaterial("A");
    actAs(TEACHER_ID);
    const res = await request(app).get(`/api/courses/${courseId}/materials/unseen`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it("outsider cannot access unseen count or mark seen", async () => {
    actAs(OUTSIDER_ID);
    expect((await request(app).get(`/api/courses/${courseId}/materials/unseen`)).status).toBe(403);
    expect((await request(app).post(`/api/courses/${courseId}/materials/seen`)).status).toBe(403);
  });
});
