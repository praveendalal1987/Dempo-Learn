import { eq, inArray, and } from "drizzle-orm";
import { db, notificationsTable, enrollmentsTable } from "@workspace/db";
import { logger } from "./logger";

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  courseId?: number | null;
  refId?: number | null;
}

/**
 * Inserts notifications. Never throws — notification generation must not
 * break the request that triggered it.
 */
export async function createNotifications(
  rows: NotificationInput[],
): Promise<void> {
  if (rows.length === 0) return;
  try {
    await db.insert(notificationsTable).values(rows);
  } catch (err) {
    logger.error({ err }, "Failed to create notifications");
  }
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
