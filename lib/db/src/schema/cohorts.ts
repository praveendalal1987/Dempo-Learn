import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const cohortsTable = pgTable("cohorts", {
  id: serial("id").primaryKey(),
  teacherId: text("teacher_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("custom"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cohortMembersTable = pgTable(
  "cohort_members",
  {
    id: serial("id").primaryKey(),
    cohortId: integer("cohort_id").notNull(),
    studentId: text("student_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("cohort_members_cohort_student_idx").on(t.cohortId, t.studentId),
  ],
);

export type Cohort = typeof cohortsTable.$inferSelect;
export type CohortMember = typeof cohortMembersTable.$inferSelect;
