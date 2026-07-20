import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Course-scoped student groups for group assignments. */
export const courseGroupsTable = pgTable("course_groups", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const courseGroupMembersTable = pgTable(
  "course_group_members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id").notNull(),
    studentId: text("student_id").notNull(),
    isLeader: boolean("is_leader").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("course_group_members_unique").on(t.groupId, t.studentId),
  ],
);

/** Which groups a group assignment targets. */
export const assignmentGroupsTable = pgTable(
  "assignment_groups",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id").notNull(),
    groupId: integer("group_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("assignment_groups_unique").on(t.assignmentId, t.groupId)],
);

/** Leader-managed task breakdown for a group on a group assignment. */
export const groupTasksTable = pgTable("group_tasks", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull(),
  groupId: integer("group_id").notNull(),
  assigneeId: text("assignee_id").notNull(),
  description: text("description").notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type CourseGroup = typeof courseGroupsTable.$inferSelect;
export type CourseGroupMember = typeof courseGroupMembersTable.$inferSelect;
export type AssignmentGroup = typeof assignmentGroupsTable.$inferSelect;
export type GroupTask = typeof groupTasksTable.$inferSelect;
