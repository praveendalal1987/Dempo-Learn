import { pgTable, text, serial, timestamp, integer, jsonb, uniqueIndex, boolean } from "drizzle-orm/pg-core";

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  teacherId: text("teacher_id").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  // Set to false when the owning teacher's access is removed; inactive
  // courses are hidden from students.
  isActive: boolean("is_active").notNull().default(true),
  planHours: integer("plan_hours").notNull().default(0),
  lockedPlanDays: jsonb("locked_plan_days")
    .notNull()
    .default([])
    .$type<number[]>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const coursePlanItemsTable = pgTable("course_plan_items", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  hourNumber: integer("hour_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  preWork: text("pre_work"),
  caseStudy: text("case_study"),
  postWork: text("post_work"),
});

export const enrollmentsTable = pgTable("enrollments", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  studentId: text("student_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const invitesTable = pgTable("invites", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const courseMaterialsTable = pgTable("course_materials", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  links: jsonb("links").notNull().default([]).$type<string[]>(),
  attachments: jsonb("attachments")
    .notNull()
    .default([])
    .$type<{ path: string; name: string; size?: number }[]>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const courseMaterialReadsTable = pgTable(
  "course_material_reads",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull(),
    userId: text("user_id").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("course_material_reads_course_user_idx").on(t.courseId, t.userId)],
);

export type Course = typeof coursesTable.$inferSelect;
export type CourseMaterialRead = typeof courseMaterialReadsTable.$inferSelect;
export type CourseMaterial = typeof courseMaterialsTable.$inferSelect;
export type Enrollment = typeof enrollmentsTable.$inferSelect;
export type Invite = typeof invitesTable.$inferSelect;
export type CoursePlanItem = typeof coursePlanItemsTable.$inferSelect;
