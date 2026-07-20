import { pgTable, text, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";

// Which courses a course coordinator oversees. A coordinator may only view
// and manage the class-session schedule of courses assigned to them here.
export const coordinatorCourseAssignmentsTable = pgTable(
  "coordinator_course_assignments",
  {
    id: serial("id").primaryKey(),
    coordinatorId: text("coordinator_id").notNull(), // user id (role course_coordinator)
    courseId: integer("course_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.coordinatorId, t.courseId)],
);

export type CoordinatorCourseAssignment =
  typeof coordinatorCourseAssignmentsTable.$inferSelect;
