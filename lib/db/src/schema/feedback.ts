import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

// Feedback notes written by a dean to a professor or course coordinator.
export const feedbackNotesTable = pgTable("feedback_notes", {
  id: serial("id").primaryKey(),
  senderId: text("sender_id").notNull(),
  recipientId: text("recipient_id").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type FeedbackNote = typeof feedbackNotesTable.$inferSelect;
export type InsertFeedbackNote = typeof feedbackNotesTable.$inferInsert;
