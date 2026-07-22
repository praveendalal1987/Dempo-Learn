import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, eq, gte, lte, inArray, desc } from "drizzle-orm";
import {
  db,
  cohortsTable,
  cohortMembersTable,
  usersTable,
  journalEntriesTable,
  type User,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { createNotifications } from "../lib/notifications";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

async function getCohort(cohortId: number) {
  const [c] = await db
    .select()
    .from(cohortsTable)
    .where(eq(cohortsTable.id, cohortId));
  return c;
}

/** The cohort's professor (owner) or an admin may moderate/feedback. */
function isCohortManager(
  cohort: { teacherId: string } | undefined,
  user: User,
): boolean {
  if (!cohort) return false;
  return user.isAdmin || cohort.teacherId === user.id;
}

async function isCohortMember(
  cohortId: number,
  userId: string,
): Promise<boolean> {
  const [m] = await db
    .select({ id: cohortMembersTable.id })
    .from(cohortMembersTable)
    .where(
      and(
        eq(cohortMembersTable.cohortId, cohortId),
        eq(cohortMembersTable.studentId, userId),
      ),
    );
  return !!m;
}

async function loadEntry(id: number) {
  const [e] = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.id, id));
  return e;
}

// ---------------------------------------------------------------------------
// GET /journal/my-cohorts — cohorts the user can journal in (member or owner)
// ---------------------------------------------------------------------------
router.get(
  "/journal/my-cohorts",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = req.localUser!;
    const taught = await db
      .select()
      .from(cohortsTable)
      .where(eq(cohortsTable.teacherId, user.id));
    const memberRows = await db
      .select({ cohortId: cohortMembersTable.cohortId })
      .from(cohortMembersTable)
      .where(eq(cohortMembersTable.studentId, user.id));
    const memberIds = memberRows.map((r) => r.cohortId);
    const memberCohorts = memberIds.length
      ? await db
          .select()
          .from(cohortsTable)
          .where(inArray(cohortsTable.id, memberIds))
      : [];

    const byId = new Map<number, unknown>();
    for (const c of [...taught, ...memberCohorts]) {
      byId.set(c.id, {
        id: c.id,
        name: c.name,
        description: c.description,
        type: c.type,
        canManage: c.teacherId === user.id || user.isAdmin,
      });
    }
    res.json(Array.from(byId.values()));
  },
);

// ---------------------------------------------------------------------------
// GET /cohorts/:cohortId/journal?start=&end= — entries + roster for a range
// ---------------------------------------------------------------------------
router.get(
  "/cohorts/:cohortId/journal",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = req.localUser!;
    const cohortId = Number(req.params.cohortId);
    if (!Number.isInteger(cohortId)) {
      res.status(400).json({ error: "Invalid cohort id" });
      return;
    }
    const cohort = await getCohort(cohortId);
    if (!cohort) {
      res.status(404).json({ error: "Cohort not found" });
      return;
    }
    const manager = isCohortManager(cohort, user);
    const member = manager || (await isCohortMember(cohortId, user.id));
    if (!manager && !member) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const q = z
      .object({ start: dateSchema, end: dateSchema })
      .safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: "start and end (YYYY-MM-DD) are required" });
      return;
    }

    const members = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(cohortMembersTable)
      .innerJoin(usersTable, eq(usersTable.id, cohortMembersTable.studentId))
      .where(eq(cohortMembersTable.cohortId, cohortId));

    const rows = await db
      .select()
      .from(journalEntriesTable)
      .where(
        and(
          eq(journalEntriesTable.cohortId, cohortId),
          gte(journalEntriesTable.entryDate, q.data.start),
          lte(journalEntriesTable.entryDate, q.data.end),
        ),
      )
      .orderBy(desc(journalEntriesTable.createdAt));

    // Non-managers never see others' hidden entries (but do see their own).
    const entries = rows.filter(
      (r) => manager || !r.hidden || r.studentId === user.id,
    );

    res.json({
      canManage: manager,
      currentUserId: user.id,
      cohort: { id: cohort.id, name: cohort.name },
      members,
      entries,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /cohorts/:cohortId/journal — create an entry (member or professor)
// ---------------------------------------------------------------------------
const createSchema = z.object({
  entryDate: dateSchema,
  content: z.string().trim().min(1).max(5000),
  link: z.string().trim().max(2000).optional().nullable(),
});

router.post(
  "/cohorts/:cohortId/journal",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = req.localUser!;
    const cohortId = Number(req.params.cohortId);
    if (!Number.isInteger(cohortId)) {
      res.status(400).json({ error: "Invalid cohort id" });
      return;
    }
    const cohort = await getCohort(cohortId);
    if (!cohort) {
      res.status(404).json({ error: "Cohort not found" });
      return;
    }
    const manager = isCohortManager(cohort, user);
    const member = manager || (await isCohortMember(cohortId, user.id));
    if (!manager && !member) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const link = parsed.data.link?.trim() ? parsed.data.link.trim() : null;
    const [entry] = await db
      .insert(journalEntriesTable)
      .values({
        cohortId,
        studentId: user.id,
        entryDate: parsed.data.entryDate,
        content: parsed.data.content,
        link,
      })
      .returning();
    res.status(201).json(entry);
  },
);

// ---------------------------------------------------------------------------
// PATCH /journal/:id — author edits their own entry
// ---------------------------------------------------------------------------
const updateSchema = z.object({
  content: z.string().trim().min(1).max(5000).optional(),
  link: z.string().trim().max(2000).optional().nullable(),
  entryDate: dateSchema.optional(),
});

router.patch("/journal/:id", requireAuth, async (req: Request, res: Response) => {
  const user = req.localUser!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const entry = await loadEntry(id);
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  if (entry.studentId !== user.id) {
    res.status(403).json({ error: "You can only edit your own entry" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;
  if (parsed.data.entryDate !== undefined)
    updates.entryDate = parsed.data.entryDate;
  if (parsed.data.link !== undefined)
    updates.link = parsed.data.link?.trim() ? parsed.data.link.trim() : null;
  const [updated] = await db
    .update(journalEntriesTable)
    .set(updates)
    .where(eq(journalEntriesTable.id, id))
    .returning();
  res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /journal/:id — author or the cohort professor
// ---------------------------------------------------------------------------
router.delete(
  "/journal/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = req.localUser!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const entry = await loadEntry(id);
    if (!entry) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    const cohort = await getCohort(entry.cohortId);
    const manager = isCohortManager(cohort, user);
    if (entry.studentId !== user.id && !manager) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, id));
    res.json({ ok: true });
  },
);

// ---------------------------------------------------------------------------
// POST /journal/:id/feedback — professor leaves feedback (notifies the author)
// ---------------------------------------------------------------------------
router.post(
  "/journal/:id/feedback",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = req.localUser!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const entry = await loadEntry(id);
    if (!entry) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    const cohort = await getCohort(entry.cohortId);
    if (!isCohortManager(cohort, user)) {
      res.status(403).json({ error: "Only the professor can leave feedback" });
      return;
    }
    const parsed = z
      .object({ feedback: z.string().trim().max(3000) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const feedback = parsed.data.feedback.trim() || null;
    const [updated] = await db
      .update(journalEntriesTable)
      .set({ feedback, feedbackAt: new Date(), updatedAt: new Date() })
      .where(eq(journalEntriesTable.id, id))
      .returning();

    if (feedback && entry.studentId !== user.id) {
      void createNotifications([
        {
          userId: entry.studentId,
          type: "journal.feedback",
          title: "New feedback on your journal",
          body: feedback.slice(0, 140),
          link: "/journal",
          courseId: null,
          refId: id,
        },
      ]);
    }
    res.json(updated);
  },
);

// ---------------------------------------------------------------------------
// POST /journal/:id/moderate — professor hides / highlights an entry
// ---------------------------------------------------------------------------
router.post(
  "/journal/:id/moderate",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = req.localUser!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const entry = await loadEntry(id);
    if (!entry) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    const cohort = await getCohort(entry.cohortId);
    if (!isCohortManager(cohort, user)) {
      res.status(403).json({ error: "Only the professor can moderate entries" });
      return;
    }
    const parsed = z
      .object({
        hidden: z.boolean().optional(),
        highlighted: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.hidden !== undefined) updates.hidden = parsed.data.hidden;
    if (parsed.data.highlighted !== undefined)
      updates.highlighted = parsed.data.highlighted;
    const [updated] = await db
      .update(journalEntriesTable)
      .set(updates)
      .where(eq(journalEntriesTable.id, id))
      .returning();
    res.json(updated);
  },
);

export default router;
