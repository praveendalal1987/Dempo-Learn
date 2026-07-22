import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";

// A cohort learning journal: students log what they worked on, day by day.
// Multiple entries per day are allowed. Everyone in the cohort can view all
// entries; the cohort's professor can hide, highlight, and give feedback.
export const journalEntriesTable = pgTable(
  "journal_entries",
  {
    id: serial("id").primaryKey(),
    cohortId: integer("cohort_id").notNull(),
    studentId: text("student_id").notNull(), // author (Clerk user id)
    entryDate: text("entry_date").notNull(), // YYYY-MM-DD — the day the work was done
    content: text("content").notNull(),
    link: text("link"), // optional link to the work (doc/repo/drive)
    hidden: boolean("hidden").notNull().default(false), // professor moderation
    highlighted: boolean("highlighted").notNull().default(false), // professor feature
    feedback: text("feedback"), // professor feedback
    feedbackAt: timestamp("feedback_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("journal_entries_cohort_date_idx").on(t.cohortId, t.entryDate)],
);

export type JournalEntry = typeof journalEntriesTable.$inferSelect;
