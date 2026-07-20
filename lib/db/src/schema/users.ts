import { pgTable, text, timestamp, boolean, serial } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("unassigned"), // student | teacher | unassigned
  bio: text("bio"),
  title: text("title"),
  linkedinUrl: text("linkedin_url"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;

// Admin-created invites that pre-provision an email as a teacher. When a
// matching email signs in for the first time (or is still unassigned), the
// account is made a teacher automatically and the invite is consumed.
export const teacherInvitesTable = pgTable("teacher_invites", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(), // stored lowercased
  createdBy: text("created_by").notNull(), // admin user id
  createdByEmail: text("created_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TeacherInvite = typeof teacherInvitesTable.$inferSelect;
