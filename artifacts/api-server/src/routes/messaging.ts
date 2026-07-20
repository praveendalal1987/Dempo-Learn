import { Router, type IRouter } from "express";
import { eq, and, or, isNull, desc, inArray } from "drizzle-orm";
import {
  db,
  messagesTable,
  coursesTable,
  enrollmentsTable,
  usersTable,
} from "@workspace/db";
import {
  ListMessagesParams,
  ListMessagesResponse,
  SendMessageParams,
  SendMessageBody,
  SendMessageResponse,
  MarkMessagesReadBody,
  MarkMessagesReadResponse,
  GetInboxResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { getCourse, canAccessCourse, isCourseTeacher, getActiveEnrolledCourseIds } from "../lib/authz";
import {
  createNotifications,
  notifyCourseStudents,
} from "../lib/notifications";

const router: IRouter = Router();

async function attachSenders(
  rows: Array<typeof messagesTable.$inferSelect>,
) {
  const senderIds = [...new Set(rows.map((m) => m.senderId))];
  const senders = senderIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, senderIds))
    : [];
  const byId = new Map(senders.map((s) => [s.id, s]));
  return rows.map((m) => ({
    ...m,
    senderName: byId.get(m.senderId)?.name ?? null,
    senderAvatarUrl: byId.get(m.senderId)?.avatarUrl ?? null,
  }));
}

router.get(
  "/courses/:courseId/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const userId = req.userId!;
    const courseId = params.data.courseId;

    const course = await getCourse(courseId);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (!(await canAccessCourse(course, req.localUser!))) {
      res.status(403).json({ error: "Not a member of this course" });
      return;
    }

    // Return: announcements + messages where the user is sender or recipient.
    const rows = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.courseId, courseId),
          or(
            eq(messagesTable.isAnnouncement, true),
            eq(messagesTable.senderId, userId),
            eq(messagesTable.recipientId, userId),
          ),
        ),
      )
      .orderBy(messagesTable.createdAt);

    res.json(ListMessagesResponse.parse(await attachSenders(rows)));
  },
);

router.post(
  "/courses/:courseId/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = SendMessageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = SendMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
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
    if (parsed.data.isAnnouncement && !isCourseTeacher(course, req.localUser!)) {
      res.status(403).json({ error: "Only the course professor can post announcements" });
      return;
    }

    const [message] = await db
      .insert(messagesTable)
      .values({
        courseId: params.data.courseId,
        senderId: req.userId!,
        recipientId: parsed.data.isAnnouncement
          ? null
          : parsed.data.recipientId ?? null,
        body: parsed.data.body,
        isAnnouncement: parsed.data.isAnnouncement ?? false,
      })
      .returning();

    const [withSender] = await attachSenders([message]);

    const senderName = withSender.senderName ?? "Someone";
    if (message.isAnnouncement) {
      void notifyCourseStudents(
        course.id,
        {
          type: "announcement.posted",
          title: `Announcement in ${course.title}`,
          body: message.body.length > 120 ? `${message.body.slice(0, 120)}…` : message.body,
          link: `/messages?courseId=${course.id}`,
          refId: message.id,
        },
        message.senderId,
      );
    } else if (message.recipientId && message.recipientId !== message.senderId) {
      void createNotifications([
        {
          userId: message.recipientId,
          type: "message.received",
          title: `New message from ${senderName}`,
          body: message.body.length > 120 ? `${message.body.slice(0, 120)}…` : message.body,
          link: `/messages?courseId=${course.id}`,
          courseId: course.id,
          refId: message.id,
        },
      ]);
    }

    res.status(201).json(SendMessageResponse.parse(withSender));
  },
);

router.post("/messages/read", requireAuth, async (req, res): Promise<void> => {
  const parsed = MarkMessagesReadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.userId!;

  const conditions = [
    eq(messagesTable.courseId, parsed.data.courseId),
    eq(messagesTable.recipientId, userId),
    isNull(messagesTable.readAt),
  ];
  if (parsed.data.withUserId) {
    conditions.push(eq(messagesTable.senderId, parsed.data.withUserId));
  }

  await db
    .update(messagesTable)
    .set({ readAt: new Date() })
    .where(and(...conditions));

  res.json(MarkMessagesReadResponse.parse({ ok: true }));
});

router.get("/inbox", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const user = req.localUser!;

  // Determine the set of courses relevant to the user.
  let courseIds: number[];
  if (user.role === "teacher") {
    const owned = await db
      .select()
      .from(coursesTable)
      .where(eq(coursesTable.teacherId, userId));
    courseIds = owned.map((c) => c.id);
  } else {
    courseIds = await getActiveEnrolledCourseIds(userId);
  }

  if (courseIds.length === 0) {
    res.json(GetInboxResponse.parse([]));
    return;
  }

  const courses = await db
    .select()
    .from(coursesTable)
    .where(inArray(coursesTable.id, courseIds));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // Direct (non-announcement) messages involving the user in these courses.
  const rows = await db
    .select()
    .from(messagesTable)
    .where(
      and(
        inArray(messagesTable.courseId, courseIds),
        eq(messagesTable.isAnnouncement, false),
        or(
          eq(messagesTable.senderId, userId),
          eq(messagesTable.recipientId, userId),
        ),
      ),
    )
    .orderBy(desc(messagesTable.createdAt));

  // Group by (courseId, otherUserId).
  type Thread = {
    courseId: number;
    otherUserId: string;
    lastMessage: string | null;
    lastMessageAt: Date | null;
    unreadCount: number;
  };
  const threads = new Map<string, Thread>();
  for (const m of rows) {
    const otherUserId = m.senderId === userId ? m.recipientId : m.senderId;
    if (!otherUserId) continue;
    const key = `${m.courseId}:${otherUserId}`;
    let t = threads.get(key);
    if (!t) {
      t = {
        courseId: m.courseId,
        otherUserId,
        lastMessage: m.body,
        lastMessageAt: m.createdAt,
        unreadCount: 0,
      };
      threads.set(key, t);
    }
    if (m.recipientId === userId && !m.readAt) t.unreadCount++;
  }

  const otherIds = [...new Set([...threads.values()].map((t) => t.otherUserId))];
  const others = otherIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, otherIds))
    : [];
  const otherById = new Map(others.map((u) => [u.id, u]));

  const result = [...threads.values()].map((t) => ({
    courseId: t.courseId,
    courseTitle: courseById.get(t.courseId)?.title ?? "",
    otherUserId: t.otherUserId,
    otherUserName: otherById.get(t.otherUserId)?.name ?? null,
    otherUserAvatarUrl: otherById.get(t.otherUserId)?.avatarUrl ?? null,
    lastMessage: t.lastMessage,
    lastMessageAt: t.lastMessageAt,
    unreadCount: t.unreadCount,
  }));

  res.json(GetInboxResponse.parse(result));
});

export default router;
