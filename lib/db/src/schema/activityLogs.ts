import { pgTable, text, timestamp, serial, jsonb, index } from "drizzle-orm/pg-core";

export const activityLogsTable = pgTable(
  "activity_logs",
  {
    id: serial("id").primaryKey(),
    // Actor (nullable: some events, e.g. system errors, have no user).
    userId: text("user_id"),
    userEmail: text("user_email"),
    // info | warn | error
    level: text("level").notNull().default("info"),
    // Machine-readable action, e.g. "auth.provisioned", "user.role_changed",
    // "course.created", "course.joined", "assignment.created",
    // "submission.created", "submission.graded", "api.error"
    action: text("action").notNull(),
    // Human-readable summary of the event.
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activity_logs_created_at_idx").on(table.createdAt),
    index("activity_logs_user_id_idx").on(table.userId),
    index("activity_logs_action_idx").on(table.action),
  ],
);

export type ActivityLog = typeof activityLogsTable.$inferSelect;
export type InsertActivityLog = typeof activityLogsTable.$inferInsert;
