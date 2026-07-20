import { Router, type IRouter } from "express";
import { eq, or, desc, inArray } from "drizzle-orm";
import { db, feedbackNotesTable, usersTable } from "@workspace/db";
import {
  ListFeedbackResponse,
  CreateFeedbackBody,
  CreateFeedbackResponse,
  MarkFeedbackReadParams,
  MarkFeedbackReadResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { createNotifications } from "../lib/notifications";
import { logActivity } from "../lib/activityLog";

const router: IRouter = Router();

async function enrichNotes(
  notes: (typeof feedbackNotesTable.$inferSelect)[],
): Promise<Record<string, unknown>[]> {
  const userIds = [
    ...new Set(notes.flatMap((n) => [n.senderId, n.recipientId])),
  ];
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return notes.map((n) => ({
    ...n,
    senderName: byId.get(n.senderId)?.name ?? null,
    recipientName: byId.get(n.recipientId)?.name ?? null,
  }));
}

const FEEDBACK_ROLES = new Set(["dean", "teacher", "course_coordinator"]);

router.get("/feedback", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  if (!FEEDBACK_ROLES.has(req.localUser?.role ?? "")) {
    res.status(403).json({ error: "Feedback is only available to deans, professors, and course coordinators" });
    return;
  }
  const isDean = req.localUser?.role === "dean";

  const notes = await db
    .select()
    .from(feedbackNotesTable)
    .where(
      isDean
        ? or(
            eq(feedbackNotesTable.recipientId, userId),
            eq(feedbackNotesTable.senderId, userId),
          )
        : eq(feedbackNotesTable.recipientId, userId),
    )
    .orderBy(desc(feedbackNotesTable.createdAt));

  const enriched = await enrichNotes(notes);
  res.json(
    ListFeedbackResponse.parse({
      received: enriched.filter((n) => n.recipientId === userId),
      sent: enriched.filter(
        (n) => n.senderId === userId && n.recipientId !== userId,
      ),
    }),
  );
});

router.post("/feedback", requireAuth, async (req, res): Promise<void> => {
  if (req.localUser?.role !== "dean") {
    res.status(403).json({ error: "Only a dean can send feedback" });
    return;
  }
  const parsed = CreateFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [recipient] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, parsed.data.recipientId));
  if (!recipient) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }
  if (recipient.role !== "teacher" && recipient.role !== "course_coordinator") {
    res.status(400).json({
      error: "Feedback can only be sent to a professor or course coordinator",
    });
    return;
  }

  const [note] = await db
    .insert(feedbackNotesTable)
    .values({
      senderId: req.userId!,
      recipientId: recipient.id,
      subject: parsed.data.subject?.trim() || null,
      body: parsed.data.body.trim(),
    })
    .returning();

  void createNotifications([
    {
      userId: recipient.id,
      type: "feedback.received",
      title: `Feedback from ${req.localUser?.name ?? "the dean"}`,
      body: note.subject || note.body.slice(0, 120),
      link: "/feedback",
      refId: note.id,
    },
  ]);
  void logActivity({
    user: req.localUser,
    action: "feedback.sent",
    message: `Dean ${req.localUser?.email ?? "unknown"} sent feedback to ${recipient.email}`,
    metadata: { feedbackId: note.id, recipientId: recipient.id },
  });

  res.status(201).json(
    CreateFeedbackResponse.parse({
      ...note,
      senderName: req.localUser?.name ?? null,
      recipientName: recipient.name ?? null,
    }),
  );
});

router.post(
  "/feedback/:feedbackId/read",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!FEEDBACK_ROLES.has(req.localUser?.role ?? "")) {
      res.status(403).json({ error: "Feedback is only available to deans, professors, and course coordinators" });
      return;
    }
    const params = MarkFeedbackReadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [note] = await db
      .select()
      .from(feedbackNotesTable)
      .where(eq(feedbackNotesTable.id, params.data.feedbackId));
    if (!note || note.recipientId !== req.userId) {
      res.status(404).json({ error: "Feedback not found" });
      return;
    }
    const [updated] = await db
      .update(feedbackNotesTable)
      .set({ readAt: note.readAt ?? new Date() })
      .where(eq(feedbackNotesTable.id, note.id))
      .returning();
    const [enriched] = await enrichNotes([updated]);
    res.json(MarkFeedbackReadResponse.parse(enriched));
  },
);

export default router;
