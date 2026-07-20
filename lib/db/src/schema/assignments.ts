import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  jsonb,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const assignmentsTable = pgTable("assignments", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  allowedTypes: jsonb("allowed_types").notNull().$type<string[]>(),
  maxScore: integer("max_score").notNull().default(100),
  // individual | group
  assignmentType: text("assignment_type").notNull().default("individual"),
  // Group assignments only: when true, only the group leader may submit.
  leaderOnlySubmit: boolean("leader_only_submit").notNull().default(false),
  attachments: jsonb("attachments")
    .notNull()
    .default([])
    .$type<{ path: string; name: string }[]>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Assignment = typeof assignmentsTable.$inferSelect;

/**
 * Per-student assignment targeting. No rows for an assignment means the
 * assignment is for all enrolled students (the default).
 */
export const assignmentTargetsTable = pgTable(
  "assignment_targets",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id").notNull(),
    studentId: text("student_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("assignment_targets_unique").on(t.assignmentId, t.studentId)],
);

export type AssignmentTarget = typeof assignmentTargetsTable.$inferSelect;
