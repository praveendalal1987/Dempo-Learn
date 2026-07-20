import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  senderId: text("sender_id").notNull(),
  recipientId: text("recipient_id"), // null for announcements/broadcast
  body: text("body").notNull(),
  isAnnouncement: boolean("is_announcement").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Message = typeof messagesTable.$inferSelect;
