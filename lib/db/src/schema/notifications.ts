import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  // e.g. assignment.created, submission.graded, message.received,
  // announcement.posted, class.scheduled, class.reminder
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  // In-app path to the relevant page, e.g. /assignment/12
  link: text("link"),
  courseId: integer("course_id"),
  // Id of the underlying entity (assignment, submission, session...), used
  // together with `type` to dedupe generated notifications.
  refId: integer("ref_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;
