import { eq, inArray, and } from "drizzle-orm";
import { db, notificationsTable, enrollmentsTable, usersTable } from "@workspace/db";
import { logger } from "./logger";
import { isEmailConfigured, sendTemplateEmails } from "./email";

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  courseId?: number | null;
  refId?: number | null;
}

// Notification types that also send an email (when MSG91 email is enabled).
// Chosen to be the student-facing, time-sensitive ones — not every in-app blip.
// Override via MSG91_EMAIL_TYPES (comma-separated) without a code change.
const DEFAULT_EMAIL_TYPES = [
  "assignment.created",
  "submission.graded",
  "feedback.received",
  "announcement.posted",
  "message.received",
  "quiz.published",
  "quiz.results_published",
];

// Safety cap so a single large broadcast can't fan out unboundedly.
const MAX_EMAILS_PER_EVENT = 1000;

function emailableTypes(): Set<string> {
  const raw = process.env.MSG91_EMAIL_TYPES;
  const list = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_EMAIL_TYPES;
  return new Set(list);
}

/** Turn a relative notification link into an absolute URL for emails. */
function absoluteLink(link?: string | null): string {
  const base = process.env.APP_BASE_URL;
  if (!link) return base || "";
  if (/^https?:\/\//i.test(link)) return link;
  if (!base) return link;
  return `${base.replace(/\/$/, "")}${link.startsWith("/") ? "" : "/"}${link}`;
}

/**
 * Best-effort email fan-out for freshly created notifications. Never throws.
 * No-op unless MSG91 email is configured/enabled.
 */
async function dispatchNotificationEmails(
  rows: NotificationInput[],
): Promise<void> {
  try {
    if (!isEmailConfigured()) return;
    const types = emailableTypes();
    const emailable = rows.filter((r) => types.has(r.type));
    if (emailable.length === 0) return;

    if (emailable.length > MAX_EMAILS_PER_EVENT) {
      logger.warn(
        { count: emailable.length, cap: MAX_EMAILS_PER_EVENT },
        "Notification email fan-out exceeded cap; remainder not emailed",
      );
    }
    const capped = emailable.slice(0, MAX_EMAILS_PER_EVENT);

    const userIds = Array.from(new Set(capped.map((r) => r.userId)));
    const users = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));
    const byId = new Map(users.map((u) => [u.id, u]));

    const recipients = capped.flatMap((r) => {
      const u = byId.get(r.userId);
      if (!u?.email) return [];
      return [
        {
          email: u.email,
          name: u.name,
          variables: {
            name: u.name || "there",
            title: r.title,
            body: r.body || "",
            link: absoluteLink(r.link),
          },
        },
      ];
    });

    await sendTemplateEmails(recipients);
  } catch (err) {
    logger.error({ err }, "Failed to dispatch notification emails");
  }
}

/**
 * Inserts notifications. Never throws — notification generation must not
 * break the request that triggered it. On success, also fans out emails for
 * email-worthy types (best-effort; no-op unless MSG91 email is configured).
 */
export async function createNotifications(
  rows: NotificationInput[],
): Promise<void> {
  if (rows.length === 0) return;
  try {
    await db.insert(notificationsTable).values(rows);
  } catch (err) {
    logger.error({ err }, "Failed to create notifications");
    return;
  }
  // Fire-and-forget so email latency never delays the request.
  void dispatchNotificationEmails(rows);
}

/**
 * Fans a notification out to every student enrolled in a course, excluding
 * `excludeUserId` (usually the actor).
 */
export async function notifyCourseStudents(
  courseId: number,
  notification: Omit<NotificationInput, "userId" | "courseId">,
  excludeUserId?: string,
): Promise<void> {
  try {
    const enrollments = await db
      .select()
      .from(enrollmentsTable)
      .where(eq(enrollmentsTable.courseId, courseId));
    const rows = enrollments
      .filter((e) => e.studentId !== excludeUserId)
      .map((e) => ({ ...notification, userId: e.studentId, courseId }));
    await createNotifications(rows);
  } catch (err) {
    logger.error({ err }, "Failed to notify course students");
  }
}

/**
 * Removes notifications tied to a specific entity, e.g. when a class session
 * is deleted.
 */
export async function deleteNotificationsForRef(
  type: string | string[],
  refId: number,
): Promise<void> {
  try {
    const types = Array.isArray(type) ? type : [type];
    await db
      .delete(notificationsTable)
      .where(
        and(
          inArray(notificationsTable.type, types),
          eq(notificationsTable.refId, refId),
        ),
      );
  } catch (err) {
    logger.error({ err }, "Failed to delete notifications");
  }
}
